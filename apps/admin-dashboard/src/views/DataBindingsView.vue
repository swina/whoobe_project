<template>
  <div class="flex flex-col h-full gap-6">
    <div class="shrink-0 flex items-center justify-between gap-4">
      <div>
        <h2 class="text-xl font-bold text-slate-100 light:text-slate-900">Data bindings</h2>
        <p class="text-xs text-slate-400 light:text-slate-600">
          Every page and snippet that shows dynamic data, from Data Objects or from an Integrations route. Open one to edit it in the editor with the bound element selected.
        </p>
        <p class="mt-1 text-xs text-slate-500">
          Recommended: build the bound block once as a snippet, bind it there, then insert it in the pages from the editor's Snippets panel instead of binding the same data again.
          The page gets its own copy, which you can still change; it shows here too, marked with the snippet it came from.
        </p>
      </div>
      <button type="button" class="btn btn-secondary flex items-center gap-1.5" :disabled="loading" @click="refresh">
        <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': loading }" /> Refresh
      </button>
    </div>

    <div class="shrink-0 flex flex-wrap items-center gap-3 text-xs">
      <input v-model="text" type="search" placeholder="Search page, snippet, class, endpoint, route"
        class="w-72 rounded-lg border border-slate-700 light:border-slate-300 bg-slate-900/60 light:bg-white px-3 py-1.5 text-slate-200 light:text-slate-800" />
      <select v-model="kind" class="rounded-lg border border-slate-700 light:border-slate-300 bg-slate-900/60 light:bg-white px-2 py-1.5 text-slate-200 light:text-slate-800">
        <option value="">All data</option>
        <option value="dataObject">Data Objects</option>
        <option value="gateway">Integrations (API)</option>
      </select>
      <select v-model="origin" class="rounded-lg border border-slate-700 light:border-slate-300 bg-slate-900/60 light:bg-white px-2 py-1.5 text-slate-200 light:text-slate-800">
        <option value="">Any origin</option>
        <option value="snippet">Inserted from a snippet</option>
        <option value="own">Bound in the page itself</option>
      </select>
      <select v-model="websiteId" class="rounded-lg border border-slate-700 light:border-slate-300 bg-slate-900/60 light:bg-white px-2 py-1.5 text-slate-200 light:text-slate-800">
        <option value="">All websites</option>
        <option v-for="w in websitesStore.websites" :key="w.id" :value="w.id">{{ w.name }}</option>
      </select>
      <span class="text-slate-500">{{ shown.length }} of {{ entries.length }}</span>
    </div>

    <p v-if="error" class="shrink-0 rounded-xl bg-rose-950/40 border border-rose-800 p-3 text-xs text-rose-300">{{ error }}</p>
    <div v-else-if="loading && !entries.length" class="shrink-0 p-12 text-center text-xs text-slate-500">Reading pages and snippets...</div>
    <div v-else-if="!shown.length" class="shrink-0 rounded-2xl bg-slate-900/40 light:bg-white/40 border border-slate-800/80 light:border-slate-200/80 p-12 text-center text-xs text-slate-500">
      <template v-if="!entries.length">No page or snippet has a data binding yet. Select an element in the editor and use Data binding in its settings.</template>
      <template v-else>No binding matches the filters.</template>
    </div>

    <div v-else class="flex-1 min-h-0 overflow-y-auto rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200">
      <table class="w-full text-left text-xs text-slate-300 light:text-slate-700">
        <thead class="sticky top-0 z-10 bg-slate-950/80 light:bg-white/80 border-b border-slate-800 light:border-slate-200 text-[11px] font-semibold text-slate-400 light:text-slate-600 uppercase tracking-wider backdrop-blur-sm">
          <tr>
            <th class="py-3 px-4">Where</th>
            <th class="py-3 px-4">Website</th>
            <th class="py-3 px-4">Bound to</th>
            <th class="py-3 px-4">Elements</th>
            <th class="py-3 px-4">Snippet</th>
            <th class="py-3 px-4">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/60 light:divide-slate-200/60">
          <tr v-for="e in shown" :key="e.key" class="cursor-pointer hover:bg-slate-800/90 light:hover:bg-slate-100/50 transition" @click="open(e)">
            <td class="py-2.5 px-4">
              <span class="px-1.5 py-0.5 rounded bg-slate-800 light:bg-slate-200 text-[10px] uppercase">{{ e.source.kind }}</span>
              <span class="font-medium text-slate-200 light:text-slate-800"> {{ e.source.title }}</span><span v-if="e.source.kind === 'page' && e.source.published === false" class="text-slate-500"> (draft)</span>
            </td>
            <td class="py-2.5 px-4">{{ websiteName(e.source.websiteId) }}</td>
            <td class="py-2.5 px-4">
              <span class="px-1.5 py-0.5 rounded text-[10px] uppercase" :class="e.kind === 'gateway' ? 'bg-sky-900/60 text-sky-300' : 'bg-emerald-900/60 text-emerald-300'">{{ e.kind === 'gateway' ? 'API' : 'Data Object' }}</span>
              <span class="font-mono"> {{ e.target }}</span><span v-if="e.route" class="font-mono text-slate-500"> {{ e.route }}</span>
            </td>
            <td class="py-2.5 px-4">{{ e.elementIds.length }}</td>
            <td class="py-2.5 px-4">
              <template v-if="e.source.kind === 'snippet'">
                <span :class="usedIn(e.source.id) ? 'text-emerald-400' : 'text-slate-500'">{{ usedIn(e.source.id) ? `used ${usedIn(e.source.id)}x in pages` : 'not used in any page' }}</span>
              </template>
              <template v-else-if="e.fromSnippetId">from {{ snippetName(e.fromSnippetId) }}</template>
              <span v-else class="text-slate-500">built in the page</span>
            </td>
            <td class="py-2.5 px-4" @click.stop>
              <div class="flex items-center gap-2">
                <button type="button" class="btn btn-primary" @click="open(e)">Open</button>
                <button v-if="e.fromSnippetId && snippetExists(e.fromSnippetId)" type="button" class="btn btn-link" title="Open the snippet this block came from" @click="tabsStore.openSnippet(e.fromSnippetId)">
                  <Puzzle class="w-3.5 h-3.5" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
// One list of what is bound to dynamic data (Data Objects or an Integrations route), outside the editor
// (docs/plans/cms/data-bindings-list.md). Pages and snippets are read whole and scanned in the browser by collectDataBindings()
// from @whoobe-cms/schema; nothing is stored. A block inserted from a snippet is a copy that carries `sourceSnippetId`, which is
// how a page row is tied back to its snippet and how a snippet row knows where it is used.
import { computed, onMounted, ref } from 'vue'
import { Puzzle, RefreshCw } from '@lucide/vue'
import { collectDataBindings, collectSnippetUses, filterDataBindings, type DataBindingEntry } from '@whoobe-cms/schema'
import { useAuthStore } from '../stores/authStore'
import { useTabsStore } from '../stores/tabsStore'
import { useWebsitesStore } from '../stores/websitesStore'
import { fetchPages } from '../utils/pages-api'
import { fetchSnippets } from '../utils/snippets-api'

const authStore = useAuthStore()
const tabsStore = useTabsStore()
const websitesStore = useWebsitesStore()

const entries = ref<DataBindingEntry[]>([])
const snippetNames = ref(new Map<string, string>())
// snippet id -> number of blocks in pages built from it (any block of the snippet counts, bound or not)
const uses = ref(new Map<string, number>())
const loading = ref(false)
const error = ref('')
const text = ref('')
const kind = ref<'' | 'dataObject' | 'gateway'>('')
const origin = ref<'' | 'snippet' | 'own'>('')
const websiteId = ref('')

const shown = computed(() =>
  filterDataBindings(entries.value, { text: text.value, kind: kind.value, origin: origin.value })
    // snippets have no website: a website filter keeps the pages of that site only
    .filter((e) => !websiteId.value || e.source.websiteId === websiteId.value),
)

function websiteName(id?: string | null): string {
  if (!id) return '-'
  return websitesStore.websites.find((w) => w.id === id)?.name ?? '-'
}
const usedIn = (snippetId: string): number => uses.value.get(snippetId) ?? 0
const snippetExists = (id: string): boolean => snippetNames.value.has(id)
const snippetName = (id: string): string => snippetNames.value.get(id) ?? '(deleted snippet)'

function open(e: DataBindingEntry) {
  const elementId = e.elementIds[0]
  if (e.source.kind === 'page') tabsStore.openPage(e.source.id, 'editor', elementId)
  else tabsStore.openSnippet(e.source.id, elementId)
}

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    const base = authStore.config.coreApiUrl
    const [pages, snippets] = await Promise.all([
      fetchPages(base),
      fetchSnippets(base),
      websitesStore.refreshWebsites().catch(() => undefined),
    ])
    const out: DataBindingEntry[] = []
    const used = new Map<string, number>()
    for (const p of pages) {
      out.push(...collectDataBindings(p.content, { kind: 'page', id: p.id, title: p.title || p.slug, websiteId: p.websiteId, published: p.published }))
      for (const [id, n] of collectSnippetUses(p.content)) used.set(id, (used.get(id) ?? 0) + n)
    }
    for (const s of snippets) out.push(...collectDataBindings(s.node, { kind: 'snippet', id: s.id, title: s.name }))
    snippetNames.value = new Map(snippets.map((s) => [s.id, s.name]))
    uses.value = used
    entries.value = out.sort((a, b) => a.source.title.localeCompare(b.source.title) || a.target.localeCompare(b.target))
  } catch (e: any) {
    error.value = e?.message || 'Failed to load the pages and snippets'
  } finally {
    loading.value = false
  }
}

onMounted(refresh)
</script>
