<template>
  <div class="flex-1 min-h-0 flex flex-col text-[10px] font-normal" data-testid="automations-panel">
    <div class="p-2 border-b border-slate-200 flex flex-col gap-1.5 shrink-0">
      <input v-model="text" type="search" placeholder="Search name, page, endpoint, route" class="text-xs border rounded px-1.5 py-1 bg-white" />
      <select v-model="endpoint" class="text-xs border rounded px-1.5 py-1 bg-white">
        <option value="">All endpoints</option>
        <option v-for="n in endpointNames" :key="n" :value="n">{{ n }}</option>
      </select>
      <label class="flex items-center gap-1.5 text-gray-600">
        <input type="checkbox" v-model="gatewayOnly" /> Only forms sent to an endpoint
      </label>
      <div class="flex items-center justify-between text-gray-400">
        <span>{{ shown.length }} of {{ entries.length }}</span>
        <button type="button" class="px-1.5 py-0.5 rounded hover:bg-violet-100 text-violet-700 disabled:opacity-50" :disabled="loading" @click="refresh">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>
    </div>

    <p v-if="error" class="p-2 text-xs text-red-600 bg-red-50 border-b border-red-200">{{ error }}</p>
    <p v-else-if="!loading && !entries.length" class="p-3 text-xs text-gray-400">
      No form with submission handling found in the pages and snippets. Turn it on in a form's Advanced &gt; Form settings.
    </p>
    <p v-else-if="!loading && !shown.length" class="p-3 text-xs text-gray-400">Nothing matches the filters.</p>

    <ul class="flex-1 min-h-0 overflow-y-auto">
      <li v-for="e in shown" :key="e.key" class="px-2.5 py-2 border-b border-slate-200 hover:bg-violet-50">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="text-xs font-semibold text-gray-700 truncate" :title="e.name">{{ e.name }}</div>
            <div class="text-gray-400 truncate" :title="e.source.title">
              {{ e.source.kind === 'page' ? 'Page' : 'Snippet' }}: {{ e.source.title }}
              <span v-if="e.source.kind === 'page' && e.source.published === false"> (draft)</span>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <a v-if="serviceUrl(e)" :href="serviceUrl(e)" target="_blank" rel="noopener noreferrer"
              class="px-1.5 py-0.5 rounded text-violet-700 hover:bg-violet-200" title="Open the service this form calls (the automation engine)">Service</a>
            <a :href="automationEditorUrl(e)" target="_blank" rel="noopener"
              class="px-1.5 py-0.5 rounded bg-violet-500 text-white hover:bg-violet-600" title="Open in a new tab with the form selected">Open</a>
          </div>
        </div>
        <div class="mt-1 font-mono text-gray-500 break-all">
          <template v-if="e.target === 'gateway'">{{ e.endpoint }}<span v-if="e.route"> {{ e.route }}</span><span v-else> (first write route)</span></template>
          <template v-else>Data Object (no endpoint)</template>
        </div>
        <div class="mt-1 flex flex-wrap gap-1">
          <span class="px-1.5 rounded" :class="e.reactsToResult ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'"
            :title="e.reactsToResult ? 'The page listens to whoobe-form-result' : 'No AlpineJS listener for whoobe-form-result on the form or above it'">
            {{ e.reactsToResult ? 'reacts to the answer' : 'no reaction' }}
          </span>
          <span v-if="e.popupOff" class="px-1.5 rounded bg-gray-100 text-gray-500" title="The built-in success / error popup is off">popup off</span>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
// Every form that starts an automation, in one list (docs/plans/automations/automations-panel.md). Pages and snippets are read
// whole and scanned in the browser by scripts/automations-registry.ts; nothing is stored. Whoobe does not run the flows: the
// "Service" link only opens the endpoint's address, where the engine (Activepieces, n8n...) has its own editor.
import { computed, onMounted, ref } from 'vue'
import { listPages } from '../pages-api'
import { listSnippets } from '../snippets-api'
import { listEndpoints, type GatewayEndpoint } from '../gateway-api'
import { collectAutomations, filterAutomations, automationEditorUrl, type AutomationEntry } from '../scripts/automations-registry'

const entries = ref<AutomationEntry[]>([])
const endpoints = ref<GatewayEndpoint[]>([])
const loading = ref(false)
const error = ref('')
const text = ref('')
const endpoint = ref('')
const gatewayOnly = ref(true)

const endpointNames = computed(() => [...new Set(entries.value.map((e) => e.endpoint).filter(Boolean))].sort())
const shown = computed(() => filterAutomations(entries.value, { text: text.value, endpoint: endpoint.value, gatewayOnly: gatewayOnly.value }))

// The base address of the endpoint, only when it is plain http(s): it is a link the editor clicks, nothing else is read from it
function serviceUrl(e: AutomationEntry): string {
  if (e.target !== 'gateway') return ''
  const base = endpoints.value.find((x) => x.name === e.endpoint)?.baseUrl ?? ''
  try {
    const u = new URL(base)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : ''
  } catch {
    return ''
  }
}

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    const [pages, snippets, eps] = await Promise.all([listPages(), listSnippets(), listEndpoints().catch(() => [] as GatewayEndpoint[])])
    endpoints.value = eps
    const out: AutomationEntry[] = []
    for (const p of pages) {
      out.push(...collectAutomations(p.content, { kind: 'page', id: p.id, title: p.title || p.slug, websiteId: p.websiteId, published: p.published }))
    }
    for (const s of snippets) {
      out.push(...collectAutomations(s.node, { kind: 'snippet', id: s.id, title: s.name }))
    }
    entries.value = out.sort((a, b) => a.name.localeCompare(b.name))
  } catch (e: any) {
    error.value = e?.message || 'Failed to load the pages and snippets'
  } finally {
    loading.value = false
  }
}

onMounted(refresh)
</script>
