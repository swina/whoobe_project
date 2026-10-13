<template>
  <div class="flex-1 min-h-0 overflow-y-auto text-[10px] font-normal">
    <div v-if="!editor.current" class="p-3 text-xs text-amber-600 bg-amber-50 border-b border-amber-200">
      Select an element on the canvas first, then drag or click a field below to bind it.
    </div>
    <div v-if="!endpoints.length && !loading" class="p-3 text-xs text-gray-400">
      No endpoints configured yet. Add one in Integrations settings, then come back here to bind its fields.
    </div>

    <template v-for="ep in endpoints" :key="ep.id">
      <button
        type="button"
        class="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold text-gray-600 hover:bg-violet-500 hover:text-white border-b border-slate-300"
        :class="{ 'bg-violet-500 text-white': openEndpointId === ep.id }"
        @click="toggleEndpoint(ep.id)"
      >
        <span class="truncate">{{ ep.name }}</span>
        <ChevronDown v-if="openEndpointId === ep.id" class="w-3.5 h-3.5 shrink-0" />
        <ChevronRight v-else class="w-3.5 h-3.5 shrink-0 text-gray-400" />
      </button>

      <div v-if="openEndpointId === ep.id" class="border-b border-slate-300 bg-gray-50">
        <div v-if="!routesByEndpoint[ep.id]?.length" class="px-3 py-2 text-xs text-gray-400">No GET routes configured for this endpoint (a data binding reads GET routes).<template v-if="otherRoutesByEndpoint[ep.id]"> Its POST routes are used by a form: Advanced &gt; Form &gt; Target &gt; Gateway endpoint.</template></div>
        <template v-for="route in routesByEndpoint[ep.id]" :key="route.id">
          <button
            type="button"
            class="w-full flex items-center justify-between px-3 py-1 text-[10px] font-mono text-gray-500 hover:bg-violet-100"
            :class="{ 'bg-violet-100': openRouteId === route.id }"
            @click="toggleRoute(ep, route)"
          >
            <span class="truncate"><span class="font-bold">{{ route.method }}</span> {{ route.path }}</span>
            <ChevronDown v-if="openRouteId === route.id" class="w-3 h-3 shrink-0" />
            <ChevronRight v-else class="w-3 h-3 shrink-0 text-gray-300" />
          </button>

          <div v-if="openRouteId === route.id" class="pl-2 pb-1">
            <div v-if="routeLoading" class="px-3 py-1.5 text-xs text-gray-400">Loading fields...</div>
            <div v-else-if="!fieldsByRoute[route.id]?.length" class="px-3 py-1.5 text-xs text-gray-400">
              No schema yet. Test this route in Integrations settings first.
            </div>
            <div
              v-for="field in fieldsByRoute[route.id]"
              :key="field.path"
              draggable="true"
              class="flex items-center gap-1.5 px-3 py-1 cursor-grab select-none hover:bg-indigo-50 text-gray-600 hover:text-indigo-700"
              :title="`Drag onto a block, or click to bind to the selected element`"
              @dragstart="onDragStart($event, ep, route, field.path)"
              @click="applyBinding(ep, route, field.path)"
            >
              <GripVertical class="w-3 h-3 text-gray-300 shrink-0" />
              <span class="font-mono truncate">{{ field.path }}</span>
              <span class="text-[9px] text-gray-400 font-mono shrink-0">{{ field.type }}</span>
            </div>
            <div
              draggable="true"
              class="flex items-center gap-1.5 px-3 py-1 cursor-grab select-none hover:bg-indigo-50 text-gray-500 hover:text-indigo-700 italic"
              @dragstart="onDragStart($event, ep, route, '')"
              @click="applyBinding(ep, route, '')"
            >
              <GripVertical class="w-3 h-3 text-gray-300 shrink-0" />
              Whole response
            </div>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
// Sidebar tab for browsing gateway endpoints/routes/fields and binding one
// to the selected block, either by dragging a field chip onto the canvas
// (BlockEditor.vue's onGatewayFieldDrop) or by clicking it here while a
// block is already selected (applyBinding below - the same effect, for
// when drag precision isn't practical). GatewayBindingPicker.vue (the
// toolbar modal) remains the precise-editing entry point for params/
// transform on a binding already applied; this panel is purely additive,
// for discovery and first-time binding.
import { ref, onMounted } from 'vue'
import { ChevronDown, ChevronRight, GripVertical } from '@lucide/vue'
import { useEditorStore } from '../store/editor'
import { flattenSchemaFields, type FlatSchemaField } from '../utils/gateway-schema-walk'
import { toRelativeGatewayBinding } from '../scripts/nested-binding-author'
import { GATEWAY_FIELD_DRAG_MIME_TYPE, type GatewayFieldDragPayload } from '../utils/gateway-drag'

interface EndpointInfo {
  id: string
  name: string
  baseUrl: string
}

interface RouteInfo {
  id: string
  endpointId: string
  method: string
  path: string
  description: string
  responseSchemaId: string | null
}

const editor = useEditorStore()

const endpoints = ref<EndpointInfo[]>([])
const loading = ref(false)
const openEndpointId = ref<string | null>(null)
const routesByEndpoint = ref<Record<string, RouteInfo[]>>({})
const otherRoutesByEndpoint = ref<Record<string, number>>({})

const openRouteId = ref<string | null>(null)
const routeLoading = ref(false)
const fieldsByRoute = ref<Record<string, FlatSchemaField[]>>({})

async function toggleEndpoint(id: string) {
  if (openEndpointId.value === id) {
    openEndpointId.value = null
    return
  }
  openEndpointId.value = id
  openRouteId.value = null
  if (!routesByEndpoint.value[id]) {
    try {
      const { listRoutes } = await import('../gateway-api')
      // a data binding reads GET routes: the POST ones (a form's target, an automation's webhook) are set up elsewhere
      const all = await listRoutes(id)
      routesByEndpoint.value[id] = all.filter((r) => String(r.method).toUpperCase() === 'GET')
      otherRoutesByEndpoint.value[id] = all.length - routesByEndpoint.value[id].length
    } catch {
      routesByEndpoint.value[id] = []
    }
  }
}

async function toggleRoute(_ep: EndpointInfo, route: RouteInfo) {
  if (openRouteId.value === route.id) {
    openRouteId.value = null
    return
  }
  openRouteId.value = route.id
  if (!fieldsByRoute.value[route.id]) {
    routeLoading.value = true
    try {
      const { getRouteSchema } = await import('../gateway-api')
      const schema = await getRouteSchema(route.id)
      fieldsByRoute.value[route.id] = flattenSchemaFields(schema?.schema)
    } catch {
      fieldsByRoute.value[route.id] = []
    } finally {
      routeLoading.value = false
    }
  }
}

function onDragStart(event: DragEvent, ep: EndpointInfo, route: RouteInfo, fieldPath: string) {
  const payload: GatewayFieldDragPayload = { endpointName: ep.name, routePath: route.path, fieldPath }
  event.dataTransfer?.setData(GATEWAY_FIELD_DRAG_MIME_TYPE, JSON.stringify(payload))
  event.dataTransfer!.effectAllowed = 'copy'
}

function applyBinding(ep: EndpointInfo, route: RouteInfo, fieldPath: string) {
  if (!editor.current) return
  ;(editor.current as any).gatewayBinding = toRelativeGatewayBinding(editor.document, (editor.current as any).id, { endpointName: ep.name, routePath: route.path, fieldPath, params: null, transform: null })
}

onMounted(async () => {
  loading.value = true
  try {
    const { listEndpoints } = await import('../gateway-api')
    endpoints.value = await listEndpoints()
  } catch {
    endpoints.value = []
  } finally {
    loading.value = false
  }
})
</script>
