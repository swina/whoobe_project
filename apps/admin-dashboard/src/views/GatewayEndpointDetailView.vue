<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800">Endpoint: {{ endpointName }}</h3>
        <p class="text-xs text-slate-500">{{ store.routes.length }} route(s)</p>
      </div>
      <button @click="openCreateRoute" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center gap-1.5">
        <Plus class="w-3.5 h-3.5" />
        Add Route
      </button>
    </div>

    <div v-if="store.currentEndpoint" class="p-4 rounded-2xl bg-slate-900/50 light:bg-slate-50 border border-slate-800 light:border-slate-200 space-y-2 text-xs">
      <div class="flex gap-4">
        <span class="text-slate-500">URL:</span>
        <span class="text-slate-200 light:text-slate-800">{{ store.currentEndpoint.baseUrl }}</span>
      </div>
      <div class="flex gap-4">
        <span class="text-slate-500">Auth:</span>
        <span class="px-2 py-0.5 rounded-full text-xs font-medium" :class="authBadgeClass(store.currentEndpoint.authType)">{{ store.currentEndpoint.authType }}</span>
      </div>
      <div class="flex gap-4">
        <span class="text-slate-500">Rate Limit:</span>
        <span class="text-slate-200 light:text-slate-800">{{ store.currentEndpoint.rateLimitRps > 0 ? store.currentEndpoint.rateLimitRps + ' req/s' : 'Unlimited' }}</span>
      </div>
    </div>

    <div class="overflow-x-auto rounded-2xl border border-slate-800 light:border-slate-200">
      <table class="w-full text-xs">
        <thead>
          <tr class="bg-slate-900/80 light:bg-slate-100/80">
            <th class="text-left px-4 py-3 font-semibold text-slate-300 light:text-slate-700">Method</th>
            <th class="text-left px-4 py-3 font-semibold text-slate-300 light:text-slate-700">Path</th>
            <th class="text-left px-4 py-3 font-semibold text-slate-300 light:text-slate-700">Description</th>
            <th class="text-left px-4 py-3 font-semibold text-slate-300 light:text-slate-700">Schema</th>
            <th class="text-right px-4 py-3 font-semibold text-slate-300 light:text-slate-700">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="route in store.routes" :key="route.id" class="border-t border-slate-800 light:border-slate-200 hover:bg-slate-800/40 light:hover:bg-slate-100/40">
            <td class="px-4 py-3">
              <span class="px-2 py-0.5 rounded text-xs font-mono font-bold" :class="methodBadgeClass(route.method)">{{ route.method }}</span>
            </td>
            <td class="px-4 py-3 text-slate-200 light:text-slate-800 font-mono">
              {{ route.path }}
              <div class="text-slate-500 font-mono mt-0.5">id: <button @click="copyId(route.id)" class="text-indigo-400 hover:text-indigo-300 cursor-pointer" :title="'Click to copy'">{{ route.id.slice(0, 8) }}…</button></div>
            </td>
            <td class="px-4 py-3 text-slate-400 light:text-slate-600">{{ route.description || '—' }}</td>
            <td class="px-4 py-3">
              <span v-if="route.responseSchemaId" class="text-emerald-400">Inferred</span>
              <span v-else class="text-slate-500">Not tested</span>
            </td>
            <td class="px-4 py-3 text-right">
              <div class="flex items-center justify-end gap-2">
                <button @click="testRoute(route)" :disabled="testingId === route.id" class="text-emerald-400 hover:text-emerald-300 transition" title="Test & Infer Schema">
                  <TestTube v-if="testingId !== route.id" class="w-3.5 h-3.5" />
                  <Loader v-else class="w-3.5 h-3.5 animate-spin" />
                </button>
                <button @click="viewSchema(route)" class="text-sky-400 hover:text-sky-300 transition" title="View Schema">
                  <FileJson class="w-3.5 h-3.5" />
                </button>
                <button @click="editRoute(route)" class="text-indigo-400 hover:text-indigo-300 transition" title="Edit">
                  <Pencil class="w-3.5 h-3.5" />
                </button>
                <button @click="confirmDeleteRoute(route)" class="text-rose-400 hover:text-rose-300 transition" title="Delete">
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="!store.routes.length && !store.isLoading" class="text-center py-12 text-slate-500 text-xs">No routes configured for this endpoint.</div>

    <!-- Schema Viewer Modal -->
    <div v-if="showSchemaModal && store.currentSchema" class="fixed inset-0 Z-50 flex items-center justify-center bg-black/60" @click.self="showSchemaModal = false">
      <div class="w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6 rounded-2xl bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 shadow-2xl space-y-4">
        <h3 class="text-sm font-bold text-slate-100 light:text-slate-900">Inferred Schema</h3>
        <pre class="text-xs text-Slate-300 light:text-slate-700 bg-slate-950 light:bg-slate-50 p-4 rounded-xl overflow-x-auto">{{ JSON.stringify(store.currentSchema.schema, null, 2) }}</pre>
        <div class="flex justify-end gap-2 mt-4">
          <button @click="showSchemaModal = false" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 light:bg-slate-200 text-slate-300 light:text-slate-700 hover:bg-slate-700 light:hover:bg-slate-300 transition">Close</button>
          <button @click="refreshRouteSchema(routeForSchema!)" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition">Refresh Schema</button>
        </div>
      </div>
    </div>

    <!-- Create/Edit Route Modal -->
    <div v-if="showRouteModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="closeRouteModal">
      <div class="w-full max-w-lg p-6 rounded-2xl bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 shadow-2xl space-y-4">
        <h3 class="text-sm font-bold text-slate-100 light:text-slate-900">{{ isEditingRoute ? 'Edit Route' : 'Add Route' }}</h3>
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Method</label>
            <select v-model="routeForm.method" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500">
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Path</label>
            <input v-model="routeForm.path" type="text" placeholder="products.json" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Description</label>
            <input v-model="routeForm.description" type="text" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label class="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
              <input type="checkbox" v-model="routeForm.autoUpdateSchema" class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 light:bg-slate-50 border-slate-800 light:border-slate-200" />
              Auto-update schema on each request
            </label>
          </div>
        </div>
        <div v-if="store.errorMessage" class="px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">{{ store.errorMessage }}</div>
        <div class="flex justify-end gap-2">
          <button @click="closeRouteModal" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 light:bg-slate-200 text-slate-300 light:text-slate-700 hover:bg-slate-700 light:hover:bg-slate-300 transition">Cancel</button>
          <button @click="saveRoute" :disabled="isSubmittingRoute" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50">
            {{ isSubmittingRoute ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive, watch } from 'vue'
import { Plus, Pencil, Trash2, TestTube, Loader, FileJson } from '@lucide/vue'
import { useGatewayStore } from '../stores/gatewayStore'

const props = defineProps<{ endpointId: string; endpointName: string }>()
const store = useGatewayStore()

const showSchemaModal = ref(false)
const routeForSchema = ref<any>(null)
const showRouteModal = ref(false)
const isEditingRoute = ref(false)
const editingRouteId = ref<string | null>(null)
const isSubmittingRoute = ref(false)
const testingId = ref<string | null>(null)

const routeForm = reactive({
  method: 'GET',
  path: '',
  description: '',
  autoUpdateSchema: false,
})

function authBadgeClass(type: string): string {
  const map: Record<string, string> = {
    'none': 'bg-slate-800 text-slate-400 border border-slate-700',
    'api-key': 'bg-amber-950/60 text-amber-300 border border-amber-800',
    'bearer': 'bg-violet-950/60 text-violet-300 border border-violet-800',
    'basic': 'bg-blue-950/60 text-blue-300 border border-blue-800',
  }
  return map[type] || 'bg-slate-800 text-slate-400 border border-slate-700'
}

function copyId(id: string) {
  try {
    navigator.clipboard.writeText(id).then(() => {
      // success
    })
  } catch {
    // Fallback for older browsers or non-HTTPS
    const textarea = document.createElement('textarea')
    textarea.value = id
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
}

function methodBadgeClass(method: string): string {
  const map: Record<string, string> = {
    GET: 'bg-emerald-950/60 text-emerald-300 border border-emerald-800',
    POST: 'bg-blue-950/60 text-blue-300 border border-blue-800',
    PUT: 'bg-amber-950/60 text-amber-300 border border-amber-800',
    PATCH: 'bg-violet-950/60 text-violet-300 border border-violet-800',
    DELETE: 'bg-rose-950/60 text-rose-300 border border-rose-800',
  }
  return map[method] || 'bg-slate-800 text-slate-400 border border-slate-700'
}

function openCreateRoute() {
  isEditingRoute.value = false
  editingRouteId.value = null
  routeForm.method = 'GET'
  routeForm.path = ''
  routeForm.description = ''
  routeForm.autoUpdateSchema = false
  showRouteModal.value = true
}

function editRoute(route: any) {
  isEditingRoute.value = true
  editingRouteId.value = route.id
  routeForm.method = route.method
  routeForm.path = route.path
  routeForm.description = route.description
  routeForm.autoUpdateSchema = route.autoUpdateSchema
  showRouteModal.value = true
}

function closeRouteModal() {
  showRouteModal.value = false
}

async function saveRoute() {
  isSubmittingRoute.value = true
  try {
    const payload = {
      method: routeForm.method,
      path: routeForm.path,
      description: routeForm.description,
      autoUpdateSchema: routeForm.autoUpdateSchema,
    }
    if (isEditingRoute.value && editingRouteId.value) {
      await store.updateRouteAndRefresh(editingRouteId.value, payload)
    } else {
      await store.createRouteAndRefresh({ ...payload, endpointId: props.endpointId })
    }
    closeRouteModal()
    await store.loadRoutes(props.endpointId)
  } catch (e: any) {
    store.errorMessage = e?.message || 'Failed to save route'
  } finally {
    isSubmittingRoute.value = false
  }
}

async function testRoute(route: any) {
  testingId.value = route.id
  try {
    await store.testRouteAndGetSchema(route.id)
    routeForSchema.value = route
    showSchemaModal.value = true
    await store.loadRoutes(props.endpointId)
  } catch (e: any) {
    store.errorMessage = e?.message || 'Test failed'
  } finally {
    testingId.value = null
  }
}

async function viewSchema(route: any) {
  await store.loadSchema(route.id)
  routeForSchema.value = route
  showSchemaModal.value = true
}

async function refreshRouteSchema(route: any) {
  await store.refreshRouteSchema(route.id)
}

async function confirmDeleteRoute(route: any) {
  if (!confirm(`Delete route "${route.method} ${route.path}"?`)) return
  try {
    await store.removeRoute(route.id)
    await store.loadRoutes(props.endpointId)
  } catch (e: any) {
    store.errorMessage = e?.message || 'Failed to delete route'
  }
}

onMounted(() => {
  store.loadEndpoint(props.endpointId)
  store.loadRoutes(props.endpointId)
})
</script>