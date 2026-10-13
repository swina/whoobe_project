<template>
  <div class="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center" @click.self="$emit('close')">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-3xl h-[80vh] max-h-[80vh] flex flex-col overflow-hidden">
      <div class="flex items-center gap-2 px-3 py-2 border-b shrink-0">
        <span class="text-xs font-semibold text-gray-600">Bind to gateway endpoint</span>
        <div class="flex-1"></div>
        <button class="flex items-center gap-1 text-gray-400 hover:text-gray-700 text-xs" @click="$emit('close')">
          <X class="w-3.5 h-3.5" /> Close
        </button>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
        <!-- Step 1: Endpoint -->
        <div>
          <label class="text-xs font-medium text-gray-600 mb-1 block">Endpoint</label>
          <select v-model="selectedEndpointId" @change="onEndpointChange" class="w-full text-xs border rounded px-2 py-1.5">
            <option value="">-- Select endpoint --</option>
            <option v-for="ep in endpoints" :key="ep.id" :value="ep.id">{{ ep.name }} — {{ ep.baseUrl }}</option>
          </select>
          <div v-if="!endpoints.length" class="text-xs text-gray-400 mt-1">No endpoints configured. Add one in Integrations settings.</div>
        </div>

        <!-- Step 2: Route -->
        <div v-if="selectedEndpointId">
          <label class="text-xs font-medium text-gray-600 mb-1 block">Route</label>
          <select v-model="selectedRouteId" @change="onRouteChange" class="w-full text-xs border rounded px-2 py-1.5">
            <option value="">-- Select route --</option>
            <option v-for="r in routes" :key="r.id" :value="r.id">{{ r.method }} {{ r.path }}{{ r.description ? ' — ' + r.description : '' }}</option>
          </select>
          <div v-if="!routes.length" class="text-xs text-gray-400 mt-1">No routes configured for this endpoint.</div>
        </div>

        <!-- Step 3: Dynamic params -->
        <div v-if="selectedRoute && dynamicParams.length > 0">
          <label class="text-xs font-medium text-gray-600 mb-1 block">Path Parameters</label>
          <div class="grid grid-cols-2 gap-2">
            <div v-for="p in dynamicParams" :key="p">
              <label class="text-[10px] text-gray-400 block">\{ {{ p }} \}</label>
              <input v-model="paramValues[p]" type="text" :placeholder="p" list="whoobe-selection-refs" class="w-full text-xs border rounded px-2 py-1" />
            </div>
          </div>
          <datalist id="whoobe-selection-refs"><option v-for="n in selectionNames" :key="n" :value="`{selection.${n}}`" /></datalist>
          <div class="text-[10px] text-indigo-600 mt-1">
            <code class="font-mono">{selection.name}</code> takes the value the visitor chooses in another list on this page (the name set under Advanced &gt; Linked bindings of that list): the list is loaded when the choice is made, and stays empty until then.
          </div>
          <div class="text-[10px] text-gray-400 mt-1">
            Type a literal value, or type <code class="font-mono">{paramName}</code> matching this page's own dynamic slug segment (e.g. a page at <code class="font-mono">/product/{id}</code> can use <code class="font-mono">{id}</code>) to fetch the record matching whatever the visitor actually requested.
          </div>
        </div>

        <!-- Step 4: Field -->
        <div v-if="selectedRoute">
          <label class="text-xs font-medium text-gray-600 mb-1 block">Response Field</label>
          <div class="max-h-48 overflow-y-auto border rounded divide-y">
            <button
              v-for="field in flatFields"
              :key="field.path"
              type="button"
              class="w-full text-xs text-left px-3 py-1.5 hover:bg-indigo-50 flex items-center gap-2"
              :class="selectedFieldPath === field.path ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600'"
              @click="selectField(field.path)"
            >
              <span class="font-mono">{{ field.path }}</span>
              <span class="text-[9px] text-gray-400 font-mono">{{ field.type }}</span>
            </button>
            <button
              type="button"
              class="w-full text-xs text-left px-3 py-1.5 hover:bg-indigo-50"
              :class="selectedFieldPath === '' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600'"
              @click="selectField('')"
            >
              Whole response
            </button>
          </div>
          <div v-if="!schemaData" class="text-xs text-gray-400 mt-1">No schema yet. Test the route first to see available fields.</div>
        </div>

        <!-- Step 5: Result filters - only when the selected field is a list
             (a repeater), since filtering a single object/scalar value has
             nothing to filter. -->
        <div v-if="filterableFields">
          <label class="text-xs font-medium text-gray-600 mb-1 block">Filter results <span class="text-gray-400 font-normal">(all conditions must match)</span></label>
          <div v-if="!filters.length" class="text-xs text-gray-400 mb-1.5">No filters - every item is included.</div>
          <div v-for="(f, i) in filters" :key="i" class="flex items-center gap-1.5 mb-1.5">
            <select v-model="f.field" class="text-xs border rounded px-1.5 py-1 min-w-[6rem]">
              <option v-for="field in filterableFields" :key="field.key" :value="field.key">{{ field.key }}</option>
            </select>
            <select v-model="f.operator" class="text-xs border rounded px-1.5 py-1">
              <option value="eq">=</option>
              <option value="neq">≠</option>
              <option value="contains">contains</option>
              <option value="gt">&gt;</option>
              <option value="lt">&lt;</option>
            </select>
            <input v-model="f.value" type="text" placeholder="value" class="text-xs border rounded px-1.5 py-1 flex-1" />
            <button type="button" class="text-gray-400 hover:text-rose-500 shrink-0" @click="filters.splice(i, 1)">
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
          <button type="button" class="flex items-center gap-1 text-xs text-indigo-600" @click="addFilter">
            <Plus class="w-3.5 h-3.5" /> Add filter
          </button>
        </div>

        <!-- Pagination of the list, for a repeater container or a Table: done in the browser over the list the gateway returned. -->
        <div v-if="filterableFields" class="space-y-2">
          <label class="text-xs font-medium text-gray-600 block">Pagination <span class="text-gray-400 font-normal">(repeaters and tables)</span></label>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <div class="text-[10px] text-gray-400 mb-1">Rows per page</div>
              <input v-model.number="rowsPerPage" type="number" min="0" class="text-xs border rounded px-2 py-1 w-full" placeholder="0 = no pagination" />
            </div>
            <div>
              <div class="text-[10px] text-gray-400 mb-1">Style</div>
              <select v-model="paginationMode" class="text-xs border rounded px-2 py-1 w-full" :disabled="!rowsPerPage">
                <option value="standard">Standard (arrows)</option>
                <option value="lazyload">Lazy load (More button)</option>
              </select>
            </div>
            <div v-if="rowsPerPage && paginationMode === 'lazyload'">
              <div class="text-[10px] text-gray-400 mb-1">More button text</div>
              <input v-model="loadMoreText" type="text" class="text-xs border rounded px-2 py-1 w-full" placeholder="More" />
            </div>
            <div v-if="rowsPerPage && paginationMode === 'lazyload'">
              <div class="text-[10px] text-gray-400 mb-1">More button CSS</div>
              <input v-model="loadMoreClass" type="text" class="text-xs border rounded px-2 py-1 w-full" placeholder="Tailwind classes" />
            </div>
          </div>
          <div v-if="rowsPerPage">
            <div class="text-[10px] text-gray-400 mb-1">Pagination container CSS</div>
            <input v-model="paginationContainerClass" type="text" class="text-xs border rounded px-2 py-1 w-full" placeholder="Tailwind classes for the whole pagination area (default: centered, on its own line)" />
          </div>
        </div>

<!-- Preview binding expression -->
        <div v-if="canConfirm" class="border-t pt-3 space-y-2">
          <div class="text-[10px] text-gray-400 mb-0.5">Binding expression</div>
          <input v-model="editableExpression" type="text" class="w-full text-xs font-mono border rounded px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-indigo-400" />
        </div>

        <!-- Preview result -->
        <div v-if="canConfirm" class="border-t pt-3 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-gray-600">Preview</span>
            <button
              class="flex items-center gap-1 text-xs px-2 py-1 rounded border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-40"
              :disabled="previewLoading"
              @click="fetchPreview"
            >
              <Play class="w-3 h-3" /> {{ previewLoading ? 'Loading…' : 'Test' }}
            </button>
          </div>
          <div v-if="previewError" class="text-xs text-rose-600 bg-rose-50 rounded px-2 py-1.5">{{ previewError }}</div>
          <div v-else-if="previewValue !== undefined" class="bg-gray-50 border rounded max-h-32 overflow-y-auto p-2">
            <pre class="text-xs text-gray-700 font-mono whitespace-pre-wrap break-all">{{ formatPreview(previewValue) }}</pre>
          </div>
          <div v-else class="text-xs text-gray-400 italic">Click Test to preview the resolved value.</div>
        </div>
      </div>

      <div class="flex items-center justify-between px-3 py-2 border-t shrink-0">
        <button
          v-if="initial"
          class="flex items-center gap-1 text-xs text-rose-500 hover:text-rose-700"
          @click="$emit('clear')"
        >
          <Unlink class="w-3.5 h-3.5" /> Unbind
        </button>
        <div v-else></div>
        <div class="flex items-center gap-2">
          <button class="text-xs px-3 py-1.5 rounded border text-gray-500 hover:bg-gray-50" @click="$emit('close')">Cancel</button>
          <button
            class="text-xs px-3 py-1.5 rounded bg-indigo-600 text-white disabled:opacity-40"
            :disabled="!canConfirm"
            @click="confirm"
          >
            Bind
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { Play, Plus, Trash2, Unlink, X } from '@lucide/vue'
import { flattenSchemaFields, itemFieldsForArrayPath, type FlatSchemaField } from '../utils/gateway-schema-walk'
import { useEditorStore } from '../store/editor'

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

interface GatewayResultFilter {
  field: string
  operator: 'eq' | 'neq' | 'in' | 'contains' | 'gt' | 'lt'
  value?: unknown
}

interface GatewayBinding {
  endpointName: string
  routePath: string
  fieldPath: string
  params?: Record<string, string> | null
  filters?: GatewayResultFilter[] | null
  transform?: Record<string, unknown> | null
  rowsPerPage?: number | null
  paginationMode?: 'standard' | 'lazyload' | null
  loadMoreText?: string | null
  loadMoreClass?: string | null
  paginationContainerClass?: string | null
}

const emit = defineEmits<{
  (e: 'select', binding: GatewayBinding): void
  (e: 'clear'): void
  (e: 'close'): void
}>()

const props = withDefaults(
  defineProps<{
    initial?: GatewayBinding | null
  }>(),
  { initial: null }
)

const endpoints = ref<EndpointInfo[]>([])
const routes = ref<RouteInfo[]>([])
const selectedEndpointId = ref('')
const selectedRouteId = ref('')
const selectedFieldPath = ref('')
const paramValues = ref<Record<string, string>>({})
const schemaData = ref<Record<string, any> | null>(null)
const loading = ref(false)
const baseUrl = ref('')

const selectedRoute = computed(() => routes.value.find(r => r.id === selectedRouteId.value))
const matchedEndpoint = computed(() => endpoints.value.find(e => e.id === selectedEndpointId.value))

const dynamicParams = computed(() => {
  const r = selectedRoute.value
  if (!r) return []
  const params: string[] = []
  const regex = /\{(\w+)\}/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(r.path)) !== null) params.push(m[1])
  return params
})

const flatFields = computed<FlatSchemaField[]>(() => flattenSchemaFields(schemaData.value))

// Only non-null when the currently selected field resolves to an array -
// filtering a single object/scalar has nothing to filter. Field candidates
// are the array item's own relative keys (e.g. "category"), never prefixed
// with selectedFieldPath (see gateway-schema-walk.ts's own doc comment).
const filterableFields = computed<FlatSchemaField[] | null>(() =>
  itemFieldsForArrayPath(schemaData.value, selectedFieldPath.value)
)

const filters = ref<GatewayResultFilter[]>([])
// Pagination of a list result (repeater container / Table); kept when the binding is edited again
const rowsPerPage = ref<number>(props.initial?.rowsPerPage ?? 0)
// selection names the lists of this page publish: offered as {selection.name} for a route parameter
const selectionNames = computed(() => {
  const names = new Set<string>()
  const visit = (n: any, depth: number) => {
    if (!n || typeof n !== 'object' || depth > 100) return
    if (n.selection?.publish?.name) names.add(n.selection.publish.name)
    for (const b of Array.isArray(n.blocks) ? n.blocks : []) visit(b, depth + 1)
  }
  visit(useEditorStore().document, 0)
  return [...names]
})
const paginationMode = ref<'standard' | 'lazyload'>(props.initial?.paginationMode === 'lazyload' ? 'lazyload' : 'standard')
const loadMoreText = ref(props.initial?.loadMoreText ?? '')
const loadMoreClass = ref(props.initial?.loadMoreClass ?? '')
const paginationContainerClass = ref(props.initial?.paginationContainerClass ?? '')

function addFilter() {
  filters.value.push({ field: filterableFields.value?.[0]?.key ?? '', operator: 'eq', value: '' })
}

// Explicit reset on user field selection (not a global watch(selectedFieldPath)
// - that would also fire during onMounted's programmatic restoration below
// and wipe the very filters being restored, since a watcher can't tell "the
// user picked a different field" apart from "we're replaying a saved one").
// A different field means a different item shape, so any existing filters
// (relative to the PREVIOUS field's items) are meaningless and cleared.
function selectField(path: string) {
  selectedFieldPath.value = path
  filters.value = []
}

const canConfirm = computed(() => Boolean(selectedEndpointId.value && selectedRouteId.value))

const editableExpression = ref('')

const bindingExpression = computed(() => {
  const ep = matchedEndpoint.value
  const r = selectedRoute.value
  if (!ep || !r) return ''
  const params = Object.keys(paramValues.value).length > 0 ? paramValues.value : undefined
  return buildExpression(ep.name, r.path, selectedFieldPath.value, params)
})

watch(bindingExpression, (val) => {
  if (val) editableExpression.value = val
})

function buildExpression(endpointName: string, routePath: string, fieldPath: string, params?: Record<string, string>): string {
  let expr = `gateway:${endpointName}:${routePath}:${fieldPath || 'response'}`
  if (params && Object.keys(params).length > 0) {
    expr += '?' + new URLSearchParams(params).toString()
  }
  return expr
}

// Preview
const previewLoading = ref(false)
const previewError = ref('')
const previewValue = ref<unknown>(undefined)

function gatewayBaseUrl(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env.VITE_GATEWAY_URL) return import.meta.env.VITE_GATEWAY_URL
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const h = window.location.hostname
    return h === 'localhost' || h === '127.0.0.1' ? `http://${h}:3001` : `${window.location.protocol}//${h}:3001`
  }
  return 'http://localhost:3001'
}

function formatPreview(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

async function fetchPreview() {
  const ep = matchedEndpoint.value
  if (!ep || !selectedRouteId.value) return
  if (Object.values(paramValues.value).some((v) => /^\{selection\./.test(String(v)))) {
    previewError.value = 'This list depends on a choice the visitor makes, so there is nothing to preview here: use the editor Preview.'
    return
  }
  previewLoading.value = true
  previewError.value = ''
  previewValue.value = undefined
  try {
    const baseUrl = gatewayBaseUrl()
    // Admin-authenticated preview path (docs/plans/api-gateway/gateway-auth-
    // authz.md) - the public /api/v1/gateway/resolve now requires a saved
    // bindingId, which doesn't exist yet while this binding is being authored.
    const url = `${baseUrl.replace(/\/+$/, '')}/api/v1/gateway/preview-resolve`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpointName: ep.name,
        routePath: selectedRoute.value?.path,
        fieldPath: selectedFieldPath.value || undefined,
        params: Object.keys(paramValues.value).length > 0 ? paramValues.value : undefined,
        filters: filters.value.length > 0 ? filters.value : undefined,
      }),
      credentials: 'include',
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      throw new Error(err.error || `Request failed: ${res.status}`)
    }
    const data = await res.json() as { value?: unknown }
    previewValue.value = data.value
  } catch (e: any) {
    previewError.value = e?.message || 'Preview failed'
  } finally {
    previewLoading.value = false
  }
}

async function onEndpointChange() {
  selectedRouteId.value = ''
  selectedFieldPath.value = ''
  schemaData.value = null
  paramValues.value = {}
  filters.value = []
  previewValue.value = undefined
  if (!selectedEndpointId.value) return
  loading.value = true
  try {
    const { listRoutes } = await import('../gateway-api')
    routes.value = await listRoutes(selectedEndpointId.value)
  } catch {
    routes.value = []
  } finally {
    loading.value = false
  }
}

async function onRouteChange() {
  selectedFieldPath.value = ''
  schemaData.value = null
  paramValues.value = {}
  filters.value = []
  previewValue.value = undefined
  if (!selectedRouteId.value) return
  try {
    const { getRouteSchema } = await import('../gateway-api')
    const schema = await getRouteSchema(selectedRouteId.value)
    if (schema && schema.schema) {
      schemaData.value = schema.schema
    }
  } catch {
    schemaData.value = null
  }
}

function confirm() {
  const expr = editableExpression.value.trim()
  if (!expr) return
  // Parse the expression: gateway:endpointName:routePath:fieldPath?params
  let withoutPrefix = expr
  if (withoutPrefix.startsWith('gateway:')) withoutPrefix = withoutPrefix.slice('gateway:'.length)
  const qsIndex = withoutPrefix.indexOf('?')
  let params: Record<string, string> | null = null
  if (qsIndex >= 0) {
    const qs = new URLSearchParams(withoutPrefix.slice(qsIndex + 1))
    params = Object.fromEntries(qs.entries())
    withoutPrefix = withoutPrefix.slice(0, qsIndex)
  }
  const colonIndex = withoutPrefix.indexOf(':')
  if (colonIndex < 0) return
  const endpointName = withoutPrefix.slice(0, colonIndex)
  const rest = withoutPrefix.slice(colonIndex + 1)
  const lastColonIndex = rest.lastIndexOf(':')
  if (lastColonIndex < 0) return
  const routePath = rest.slice(0, lastColonIndex)
  const fieldPath = rest.slice(lastColonIndex + 1)
  if (!endpointName || !routePath) return
  const resolvedFieldPath = fieldPath === 'response' ? '' : fieldPath

  // Transform config lives in the sidebar (DataBindingTransformControl.vue),
  // not this modal - preserve it only when rebinding to the SAME field
  // (a different field's transform options would be nonsensical), same
  // rule as DataObjectPicker.vue's confirm().
  const transform =
    props.initial && resolvedFieldPath === props.initial.fieldPath ? props.initial.transform ?? null : null

  const binding: GatewayBinding = {
    endpointName,
    routePath,
    fieldPath: resolvedFieldPath,
    params: params && Object.keys(params).length > 0 ? params : null,
    filters: filters.value.length > 0 ? filters.value : null,
    transform,
    // a list only: pagination means nothing for a single value
    rowsPerPage: filterableFields.value && rowsPerPage.value > 0 ? rowsPerPage.value : undefined,
    paginationMode: filterableFields.value && rowsPerPage.value > 0 ? (paginationMode.value === 'lazyload' ? 'lazyload' : 'standard') : undefined,
    loadMoreText: filterableFields.value && rowsPerPage.value > 0 && loadMoreText.value ? loadMoreText.value : undefined,
    loadMoreClass: filterableFields.value && rowsPerPage.value > 0 && loadMoreClass.value ? loadMoreClass.value : undefined,
    paginationContainerClass: filterableFields.value && rowsPerPage.value > 0 && paginationContainerClass.value ? paginationContainerClass.value : undefined,
  }
  emit('select', binding)
}

onMounted(async () => {
  try {
    const { listEndpoints } = await import('../gateway-api')
    endpoints.value = await listEndpoints()
  } catch {
    endpoints.value = []
  }

  if (props.initial) {
    const ep = endpoints.value.find(e => e.name === props.initial!.endpointName)
    if (ep) {
      selectedEndpointId.value = ep.id
      baseUrl.value = ep.baseUrl
      await onEndpointChange()
      const r = routes.value.find(rt => rt.path === props.initial!.routePath)
      if (r) {
        selectedRouteId.value = r.id
        await onRouteChange()
        selectedFieldPath.value = props.initial!.fieldPath
        if (props.initial!.params) {
          paramValues.value = { ...props.initial!.params }
        }
        if (props.initial!.filters?.length) {
          filters.value = props.initial!.filters.map((f) => ({ ...f }))
        }
      }
    }
  }
})
</script>