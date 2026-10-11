<template>
  <div class="flex flex-col h-full gap-6">
    <div class="shrink-0 flex items-center justify-between gap-4">
      <div>
        <h2 class="text-xl font-bold text-slate-100 light:text-slate-900">Automations</h2>
        <p class="text-xs text-slate-400 light:text-slate-600">
          The forms that start an automation, found in every page and snippet. Open one to edit it in the editor with the form selected;
          the flow itself is built in the automation engine the form calls (Service).
        </p>
      </div>
      <button type="button" class="btn btn-secondary flex items-center gap-1.5" :disabled="loading" @click="refresh">
        <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': loading }" /> Refresh
      </button>
    </div>

    <div class="shrink-0 flex flex-wrap items-center gap-3 text-xs">
      <input v-model="text" type="search" placeholder="Search name, page, endpoint, route"
        class="w-72 rounded-lg border border-slate-700 light:border-slate-300 bg-slate-900/60 light:bg-white px-3 py-1.5 text-slate-200 light:text-slate-800" />
      <select v-model="endpoint" class="rounded-lg border border-slate-700 light:border-slate-300 bg-slate-900/60 light:bg-white px-2 py-1.5 text-slate-200 light:text-slate-800">
        <option value="">All endpoints</option>
        <option v-for="n in endpointNames" :key="n" :value="n">{{ n }}</option>
      </select>
      <select v-model="websiteId" class="rounded-lg border border-slate-700 light:border-slate-300 bg-slate-900/60 light:bg-white px-2 py-1.5 text-slate-200 light:text-slate-800">
        <option value="">All websites</option>
        <option v-for="w in websitesStore.websites" :key="w.id" :value="w.id">{{ w.name }}</option>
      </select>
      <label class="flex items-center gap-1.5 text-slate-400 light:text-slate-600">
        <input type="checkbox" v-model="gatewayOnly" /> Only forms sent to an endpoint
      </label>
      <span class="text-slate-500">{{ shown.length }} of {{ entries.length }}</span>
    </div>

    <p v-if="error" class="shrink-0 rounded-xl bg-rose-950/40 border border-rose-800 p-3 text-xs text-rose-300">{{ error }}</p>
    <div v-else-if="loading && !entries.length" class="shrink-0 p-12 text-center text-xs text-slate-500">Reading pages and snippets...</div>
    <div v-else-if="!shown.length" class="shrink-0 rounded-2xl bg-slate-900/40 light:bg-white/40 border border-slate-800/80 light:border-slate-200/80 p-12 text-center text-xs text-slate-500">
      <template v-if="!entries.length">No form with submission handling found. Turn it on in a form's Advanced &gt; Form settings, in the editor.</template>
      <template v-else>No automation matches the filters.</template>
    </div>

    <div v-else class="flex-1 min-h-0 overflow-y-auto rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200">
      <table class="w-full text-left text-xs text-slate-300 light:text-slate-700">
        <thead class="sticky top-0 z-10 bg-slate-950/80 light:bg-white/80 border-b border-slate-800 light:border-slate-200 text-[11px] font-semibold text-slate-400 light:text-slate-600 uppercase tracking-wider backdrop-blur-sm">
          <tr>
            <th class="py-3 px-4">Name</th>
            <th class="py-3 px-4">Where</th>
            <th class="py-3 px-4">Website</th>
            <th class="py-3 px-4">Endpoint and route</th>
            <th class="py-3 px-4">Page reaction</th>
            <th class="py-3 px-4">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/60 light:divide-slate-200/60">
          <tr v-for="e in shown" :key="e.key" class="cursor-pointer hover:bg-slate-800/90 light:hover:bg-slate-100/50 transition" @click="open(e)">
            <td class="py-2.5 px-4 font-medium text-slate-200 light:text-slate-800">{{ e.name }}</td>
            <td class="py-2.5 px-4">
              <span class="px-1.5 py-0.5 rounded bg-slate-800 light:bg-slate-200 text-[10px] uppercase">{{ e.source.kind }}</span>
              {{ e.source.title }}<span v-if="e.source.kind === 'page' && e.source.published === false" class="text-slate-500"> (draft)</span>
            </td>
            <td class="py-2.5 px-4">{{ websiteName(e.source.websiteId) }}</td>
            <td class="py-2.5 px-4 font-mono break-all">
              <template v-if="e.target === 'gateway'">{{ e.endpoint }}<span v-if="e.route" class="text-slate-500"> {{ e.route }}</span><span v-else class="text-slate-500"> (first write route)</span></template>
              <span v-else class="text-slate-500 font-sans">Data Object</span>
            </td>
            <td class="py-2.5 px-4">
              <span :class="e.reactsToResult ? 'text-emerald-400' : 'text-slate-500'">{{ e.reactsToResult ? 'reacts to the answer' : 'no reaction' }}</span>
              <span v-if="e.popupOff" class="text-slate-500"> · popup off</span>
            </td>
            <td class="py-2.5 px-4" @click.stop>
              <div class="flex items-center gap-2">
                <button type="button" class="btn btn-primary" @click="open(e)">Open</button>
                <a v-if="serviceUrl(e)" :href="serviceUrl(e)" target="_blank" rel="noopener noreferrer" class="btn btn-link" title="Open the service this form calls (the automation engine)">
                  <ExternalLink class="w-3.5 h-3.5" />
                </a>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
// One list of the forms that start an automation (docs/plans/automations/automations-panel.md), outside the editor. Pages and
// snippets are read whole and scanned in the browser by collectAutomations() from @whoobe-cms/schema (the editor's Automations
// panel uses the same function); nothing is stored. Whoobe does not run the flows: "Service" opens the endpoint's own address.
import { computed, onMounted, ref } from 'vue'
import { ExternalLink, RefreshCw } from '@lucide/vue'
import { collectAutomations, filterAutomations, type AutomationEntry } from '@whoobe-cms/schema'
import { useAuthStore } from '../stores/authStore'
import { useGatewayStore } from '../stores/gatewayStore'
import { useTabsStore } from '../stores/tabsStore'
import { useWebsitesStore } from '../stores/websitesStore'
import { fetchPages } from '../utils/pages-api'
import { fetchSnippets } from '../utils/snippets-api'

const authStore = useAuthStore()
const gatewayStore = useGatewayStore()
const tabsStore = useTabsStore()
const websitesStore = useWebsitesStore()

const entries = ref<AutomationEntry[]>([])
const loading = ref(false)
const error = ref('')
const text = ref('')
const endpoint = ref('')
const websiteId = ref('')
const gatewayOnly = ref(true)

const endpointNames = computed(() => [...new Set(entries.value.map((e) => e.endpoint).filter(Boolean))].sort())
const shown = computed(() =>
  filterAutomations(entries.value, { text: text.value, endpoint: endpoint.value, gatewayOnly: gatewayOnly.value })
    // snippets have no website: a website filter keeps the pages of that site only
    .filter((e) => !websiteId.value || e.source.websiteId === websiteId.value),
)

function websiteName(id?: string | null): string {
  if (!id) return '-'
  return websitesStore.websites.find((w) => w.id === id)?.name ?? '-'
}

// The base address of the endpoint, only when it is plain http(s): it is a link the user clicks, nothing else is read from it
function serviceUrl(e: AutomationEntry): string {
  if (e.target !== 'gateway') return ''
  const base = gatewayStore.endpoints.find((x) => x.name === e.endpoint)?.baseUrl ?? ''
  try {
    const u = new URL(base)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : ''
  } catch {
    return ''
  }
}

function open(e: AutomationEntry) {
  if (e.source.kind === 'page') tabsStore.openPage(e.source.id, 'editor', e.elementId)
  else tabsStore.openSnippet(e.source.id, e.elementId)
}

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    const base = authStore.config.coreApiUrl
    const [pages, snippets] = await Promise.all([
      fetchPages(base),
      fetchSnippets(base),
      gatewayStore.refreshEndpoints().catch(() => undefined),
      websitesStore.refreshWebsites().catch(() => undefined),
    ])
    const out: AutomationEntry[] = []
    for (const p of pages) {
      out.push(...collectAutomations(p.content, { kind: 'page', id: p.id, title: p.title || p.slug, websiteId: p.websiteId, published: p.published }))
    }
    for (const s of snippets) out.push(...collectAutomations(s.node, { kind: 'snippet', id: s.id, title: s.name }))
    entries.value = out.sort((a, b) => a.name.localeCompare(b.name))
  } catch (e: any) {
    error.value = e?.message || 'Failed to load the pages and snippets'
  } finally {
    loading.value = false
  }
}

onMounted(refresh)
</script>
