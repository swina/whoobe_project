<template>
  <div class="h-full overflow-y-auto p-6">
    <div class="max-w-4xl space-y-5">
      <div>
        <h2 class="text-xl font-bold text-slate-100 light:text-slate-900">Integration import</h2>
        <p class="text-xs text-slate-400 light:text-slate-600">
          Read a list of records from one of your Integrations (a GET route) and make a Data Class from it: the schema only, or the schema and the records as Data Objects.
        </p>
      </div>

      <!-- 1. Where to read from -->
      <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-5 space-y-3">
        <h3 class="text-xs font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider">1. Integration and route</h3>
        <div v-if="loadingEndpoints" class="text-xs text-slate-500">Loading…</div>
        <div v-else-if="!endpoints.length" class="text-xs text-slate-500">No Integrations yet. Add one in Integrations, then come back here.</div>
        <div v-else class="grid grid-cols-2 gap-2">
          <select v-model="endpointId" class="field" data-testid="import-endpoint" @change="onEndpoint">
            <option value="">Integration…</option>
            <option v-for="e in endpoints" :key="e.id" :value="e.id">{{ e.name }}</option>
          </select>
          <select v-model="routeId" class="field" :disabled="!endpointId" data-testid="import-route" @change="onRoute">
            <option value="">GET route…</option>
            <option v-for="r in routes" :key="r.id" :value="r.id">{{ r.path }}</option>
          </select>
        </div>
        <p v-if="endpointId && !routes.length && !loadingRoutes" class="text-xs text-slate-500">This Integration has no GET route: a Data Class is made from what a GET route returns.</p>

        <div v-for="p in placeholders" :key="p" class="flex items-center gap-2">
          <span class="text-xs font-mono text-slate-400 w-28 shrink-0">{{ p }}</span>
          <input v-model="params[p]" type="text" class="field flex-1" :placeholder="`Value for {${p}}`" />
        </div>

        <div class="flex items-center gap-3">
          <button type="button" class="btn btn-secondary" :disabled="!routeId || fetching" data-testid="import-fetch" @click="fetchRecords">{{ fetching ? 'Reading…' : 'Read records' }}</button>
          <span v-if="error" class="text-xs text-rose-400" data-testid="import-error">{{ error }}</span>
        </div>
      </div>

      <!-- 2. Which list, which fields -->
      <div v-if="lists.length" class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-5 space-y-4">
        <h3 class="text-xs font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider">2. Class</h3>
        <div v-if="lists.length > 1">
          <label class="block text-xs font-semibold text-slate-400 light:text-slate-600 mb-1">List of records in the response</label>
          <select v-model="listIndex" class="field w-full" @change="loadList">
            <option v-for="(l, i) in lists" :key="l.path" :value="i">{{ l.path || '(the response)' }} ({{ l.rows.length }} records)</option>
          </select>
        </div>
        <ClassProposalForm v-model:name="name" v-model:label="label" v-model:fields="fields" v-model:import-data="importData" v-model:valid="valid" v-model:key-column="keyColumn" :row-count="rowCount" :progress="busy ? progress : null" />
        <p class="text-xs text-slate-500">Only the records this one request returns are read (no paging).</p>
        <div class="flex justify-end">
          <button type="button" class="btn btn-primary" :disabled="busy || !valid" data-testid="import-create" @click="create">{{ busy ? 'Creating…' : importData ? 'Create class and import' : 'Create class' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Main tab "Integration import" (opened from Settings > Classes > Integration import): reads a GET route of an Integration through the
// gateway, finds the lists of records in the answer and proposes a Data Class from them, as ClassFromFileWizard.vue does for a file.
import { computed, onMounted, ref } from 'vue'
import ClassProposalForm from './ClassProposalForm.vue'
import { listEndpoints, listRoutes, executeRoute, type GatewayEndpoint, type GatewayRoute } from '../../utils/gateway-api'
import { useDataClassesStore } from '../../stores/dataClassesStore'
import { useToastStore } from '../../stores/toastStore'
import { useAuthStore } from '../../stores/authStore'
import { useTabsStore } from '../../stores/tabsStore'
import { fieldsOfProposal, findRecordLists, pascalOf, proposeFields, type ProposedField, type Row } from '../../utils/class-from-file'
import { importRows, importSummary, type ImportResult } from '../../utils/class-import'

const dataClassesStore = useDataClassesStore()
const toastStore = useToastStore()
const authStore = useAuthStore()
const tabsStore = useTabsStore()

const endpoints = ref<GatewayEndpoint[]>([])
const routes = ref<GatewayRoute[]>([])
const loadingEndpoints = ref(true)
const loadingRoutes = ref(false)
const endpointId = ref('')
const routeId = ref('')
const params = ref<Record<string, string>>({})
const fetching = ref(false)
const error = ref('')

const lists = ref<{ path: string; rows: Row[] }[]>([])
const listIndex = ref(0)
const fields = ref<ProposedField[]>([])
const name = ref('')
const label = ref('')
const importData = ref(false)
const valid = ref(false)
const keyColumn = ref('')
const busy = ref(false)
const progress = ref({ done: 0, total: 0 })
const rowCount = computed(() => lists.value[listIndex.value]?.rows.length ?? 0)

const route = computed(() => routes.value.find((r) => r.id === routeId.value))
const placeholders = computed(() => [...(route.value?.path.matchAll(/\{([A-Za-z0-9_]+)\}/g) ?? [])].map((m) => m[1]))

onMounted(async () => {
  try { endpoints.value = await listEndpoints() } catch { endpoints.value = [] }
  loadingEndpoints.value = false
})

function resetResult() {
  lists.value = []
  fields.value = []
  error.value = ''
}

async function onEndpoint() {
  routeId.value = ''
  routes.value = []
  params.value = {}
  resetResult()
  if (!endpointId.value) return
  loadingRoutes.value = true
  try { routes.value = (await listRoutes(endpointId.value)).filter((r) => String(r.method).toUpperCase() === 'GET') } catch { routes.value = [] }
  loadingRoutes.value = false
}

function onRoute() {
  params.value = {}
  resetResult()
}

function loadList() {
  const l = lists.value[listIndex.value]
  fields.value = l ? proposeFields(l.rows) : []
  const endpoint = endpoints.value.find((e) => e.id === endpointId.value)
  const last = l?.path && !l.path.startsWith('(') ? l.path.split('.').pop()! : (route.value?.path.split('/').filter((s) => s && !s.startsWith('{')).pop() ?? endpoint?.name ?? '')
  name.value = pascalOf(last) || 'Imported'
  label.value = last.replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

async function fetchRecords() {
  resetResult()
  fetching.value = true
  try {
    const res = await executeRoute(routeId.value, undefined, placeholders.value.length ? params.value : undefined)
    if (res.error || res.upstreamStatus >= 400) throw new Error(`The Integration answered ${res.upstreamStatus}.`)
    const found = findRecordLists(res.body)
    if (!found.length) throw new Error('No list of records in the answer: expected an array of objects (at the top or inside a key).')
    lists.value = found
    listIndex.value = 0
    loadList()
  } catch (e: any) {
    error.value = e?.message || 'Could not read the route.'
  } finally {
    fetching.value = false
  }
}

async function create() {
  if (!valid.value) return
  busy.value = true
  try {
    const f = fieldsOfProposal(fields.value)
    const created = await dataClassesStore.createDataClass({ name: name.value.trim(), label: label.value.trim(), fields: f, viewConfig: { listColumns: f.slice(0, 5).map((x) => ({ name: x.name })) } })
    let result: ImportResult | null = null
    if (importData.value) {
      result = await importRows(authStore.config.coreApiUrl, created.id, lists.value[listIndex.value]?.rows ?? [], fields.value, (done, total) => { progress.value = { done, total } }, keyColumn.value)
    }
    toastStore.show(importSummary(created.label, result))
    tabsStore.openClass(created.id)
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to create class')
  } finally {
    busy.value = false
  }
}
</script>
