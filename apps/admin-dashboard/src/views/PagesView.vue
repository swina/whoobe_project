<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-bold text-slate-100 light:text-slate-900">Pages</h2>
        <p class="text-xs text-slate-400 light:text-slate-600">Website pages built with the Whoobe One page composer. Click a row to open it in the editor.</p>
      </div>
      <button
        @click="handleCreate"
        class="px-4 py-2 text-sm font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition"
      >
        + Create Page
      </button>
    </div>

    <div class="flex flex-col gap-3 p-4 rounded-xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200">
      <div class="flex flex-col sm:flex-row gap-4">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by title or slug..."
          class="flex-1 px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
        />
        <div class="relative">
          <button @click="isColumnsMenuOpen = !isColumnsMenuOpen"
            class="px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 hover:border-indigo-500 transition"
            :class="activeColumnNames.length > 0 ? 'border-indigo-500 text-indigo-400' : ''">
            View ▾
          </button>
          <div v-if="isColumnsMenuOpen"
            class="absolute right-0 mt-1 w-72 rounded-lg bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 shadow-xl z-10 p-3">
            <span class="text-[10px] font-semibold text-slate-500 uppercase">Columns</span>
            <div class="flex flex-col gap-1 max-h-60 overflow-y-auto mt-2">
              <div v-for="(col, idx) in displayColumns" :key="col.name"
                class="flex items-center gap-1.5 text-xs text-slate-300 light:text-slate-700 group">
                <button @click="moveColumn(col.name, -1)" :disabled="idx === 0"
                  class="text-slate-600 hover:text-slate-300 disabled:opacity-20 shrink-0" title="Move up">
                  <ChevronUp class="w-3 h-3" />
                </button>
                <button @click="moveColumn(col.name, 1)" :disabled="idx === displayColumns.length - 1"
                  class="text-slate-600 hover:text-slate-300 disabled:opacity-20 shrink-0" title="Move down">
                  <ChevronDown class="w-3 h-3" />
                </button>
                <input type="checkbox" :checked="activeColumnNames.includes(col.name)"
                  @change="toggleColumn(col.name)"
                  class="w-3.5 h-3.5 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-indigo-600 shrink-0" />
                <span class="truncate">{{ col.title }}</span>
              </div>
            </div>
          </div>
        </div>

        <button @click="showFilterModal = true"
          class="px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 hover:border-indigo-500 transition inline-flex items-center gap-1.5"
          :class="queryFilters.length > 0 ? 'border-indigo-500 text-indigo-400' : ''">
          <Filter class="w-4 h-4" /> Filter{{ queryFilters.length > 0 ? ` (${queryFilters.length})` : '' }}
        </button>
      </div>
    </div>

    <div v-if="selectedPageIds.size > 0"
      class="absolute bottom-0 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-indigo-900/40 light:bg-indigo-50 border border-indigo-700/50 light:border-indigo-200">
      <span class="text-xs font-semibold text-indigo-200 light:text-indigo-700">{{ selectedPageIds.size }} selected</span>
      <button @click="handleBatchPublish"
        class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 text-white">Publish</button>
      <button @click="handleBatchUnpublish"
        class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white">Unpublish</button>
      <button @click="handleBatchDelete"
        class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-700 hover:bg-rose-600 text-white">Delete</button>
      <button @click="selectedPageIds = new Set()"
        class="text-xs text-slate-400 hover:text-slate-200 light:text-slate-500 ml-auto">Clear</button>
    </div>

    <div v-if="pagesStore.isLoading && pagesStore.pages.length === 0" class="p-12 text-center text-xs text-slate-500">
      Loading pages…
    </div>

    <div v-else-if="sortedPages.length === 0" class="rounded-2xl bg-slate-900/40 light:bg-white/40 border border-slate-800/80 light:border-slate-200/80 p-12 text-center text-xs text-slate-500">
      No pages yet. Create a new page to get started.
    </div>

    <div v-else class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 overflow-hidden">
      <table class="w-full text-left text-xs text-slate-300 light:text-slate-700">
        <thead class="bg-slate-950/80 light:bg-white/80 border-b border-slate-800 light:border-slate-200 text-[11px] font-semibold text-slate-400 light:text-slate-600 uppercase tracking-wider">
          <tr>
            <th class="py-3 px-4 w-8">
              <input type="checkbox" :checked="allPageSelected()" @change="toggleSelectAll"
                class="w-4 h-4 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-indigo-600" />
            </th>
            <th v-for="col in visibleColumns" :key="col.name" @click="toggleSort(col.name)"
              class="py-3 px-4 cursor-pointer hover:text-slate-200 light:hover:text-slate-900 select-none whitespace-nowrap">
              {{ col.title }}
              <span v-if="sortField === col.name" class="ml-1">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/60 light:divide-slate-200/60">
          <tr
            v-for="page in pagedPages"
            :key="page.id"
            @click="tabsStore.openPage(page.id)"
            class="cursor-pointer hover:bg-slate-800/50 light:bg-slate-100/50 transition"
          >
            <td class="py-2.5 px-4 text-center" @click.stop>
              <input type="checkbox" :checked="selectedPageIds.has(page.id)"
                @change="toggleSelectPage(page.id)"
                class="w-4 h-4 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-indigo-600" />
            </td>
            <td v-for="col in visibleColumns" :key="col.name" class="py-2.5 px-4">
              <template v-if="col.name === 'title'">
                <span class="font-semibold text-slate-100 light:text-slate-900 inline-flex items-center gap-2">
                  <FileText class="w-4 h-4 text-indigo-400 inline" /> {{ page.title }}
                </span>
              </template>
              <template v-else-if="col.name === 'slug'">
                <span class="font-mono text-indigo-300">{{ page.slug }}</span>
              </template>
              <template v-else-if="col.name === 'websiteId'">
                <span class="text-slate-400 light:text-slate-600">{{ websiteLabel(page.websiteId) }}</span>
              </template>
              <template v-else-if="col.name === 'locale'">
                <span class="text-slate-400 light:text-slate-600">{{ page.locale }}</span>
              </template>
              <template v-else-if="col.name === 'category'">
                <span class="text-slate-400 light:text-slate-600">{{ page.category || '—' }}</span>
              </template>
              <template v-else-if="col.name === 'status'">
                <span
                  :class="[
                    'px-2 py-0.5 text-[10px] font-bold rounded-full border uppercase',
                    page.published ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  ]"
                >
                  {{ page.published ? 'published' : (page.workflowState || 'draft') }}
                </span>
              </template>
              <template v-else-if="col.name === 'pimcoreId'">
                <span class="text-slate-500 font-mono">{{ page.pimcoreId ?? '—' }}</span>
              </template>
              <template v-else-if="col.name === 'updatedAt'">
                <span class="text-slate-400 light:text-slate-600">{{ new Date(page.updatedAt).toLocaleString() }}</span>
              </template>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="flex items-center justify-between px-4 py-3 border-t border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-white/40">
        <div class="flex items-center gap-2 text-xs text-slate-400 light:text-slate-600">
          <span>Rows per page:</span>
          <select v-model.number="pageSize" class="px-2 py-1 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-300 light:text-slate-700 focus:outline-none focus:border-indigo-500">
            <option v-for="size in [10, 25, 50, 100]" :key="size" :value="size">{{ size }}</option>
          </select>
        </div>
        <div class="flex items-center gap-3 text-xs text-slate-400 light:text-slate-600">
          <span>{{ pageRangeLabel }}</span>
          <button @click="currentPage = Math.max(1, currentPage - 1)" :disabled="currentPage <= 1" class="px-2 py-1 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 disabled:opacity-40 hover:border-indigo-500">‹ Prev</button>
          <button @click="currentPage = Math.min(totalPages, currentPage + 1)" :disabled="currentPage >= totalPages" class="px-2 py-1 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 disabled:opacity-40 hover:border-indigo-500">Next ›</button>
        </div>
      </div>
    </div>

    <!-- Filter Query-->
    <div v-if="showFilterModal"
      class="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center" @click.self="showFilterModal = false">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl h-[60vh] max-h-[80vh] flex flex-col overflow-hidden">
        <div class="flex items-center justify-between px-3 py-2 border-b shrink-0">
          <span class="text-xs font-semibold text-gray-600">Filter pages</span>
          <button class="text-xs text-gray-400 hover:text-gray-700" @click="showFilterModal = false"><X class="w-4 h-4" /></button>
        </div>
        <div class="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
          <div class="text-[10px] text-gray-400 mb-1">Filters (all must match)</div>
          <div v-if="queryFilters.length === 0" class="text-xs text-gray-400 text-center py-4">No filters — shows all pages.</div>
          <div v-for="(f, i) in queryFilters" :key="i" class="flex items-center gap-2">
            <select v-model="f.field" class="text-xs border rounded px-2 py-1 min-w-[7rem]">
              <option v-for="ff in filterFields" :key="ff.name" :value="ff.name">{{ ff.title || ff.name }}</option>
            </select>
            <select v-model="f.operator" class="text-xs border rounded px-2 py-1">
              <option value="eq">=</option>
              <option value="neq">≠</option>
              <option value="contains">contains</option>
              <option value="gt">&gt;</option>
              <option value="lt">&lt;</option>
            </select>
            <template v-if="f.field === 'published'">
              <select v-model="f.value" class="text-xs border rounded px-2 py-1">
                <option :value="true">true</option>
                <option :value="false">false</option>
              </select>
            </template>
            <template v-else-if="f.field === 'updatedAt'">
              <input v-model="f.value" type="date" class="text-xs border rounded px-2 py-1 flex-1" />
            </template>
            <template v-else>
              <input v-model="f.value" type="text" class="text-xs border rounded px-2 py-1 flex-1" placeholder="value" />
            </template>
            <button class="text-gray-400 hover:text-rose-500 shrink-0" @click="queryFilters.splice(i, 1)"><Trash2 class="w-3.5 h-3.5" /></button>
          </div>
          <button class="flex items-center gap-1 text-xs text-indigo-600" @click="addQueryFilter"><Plus class="w-3.5 h-3.5" /> Add filter</button>
        </div>
        <div class="flex items-center justify-between px-3 py-2 border-t shrink-0">
          <button v-if="queryFilters.length > 0" class="text-xs text-rose-500 hover:text-rose-700" @click="clearQueryFilters">Clear</button>
          <div v-else></div>
          <div class="flex items-center gap-2">
            <button class="text-xs px-3 py-1.5 rounded border text-gray-500 hover:bg-gray-50" @click="showFilterModal = false">Cancel</button>
            <button class="text-xs px-3 py-1.5 rounded bg-indigo-600 text-white" @click="showFilterModal = false">Apply</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { FileText, ChevronUp, ChevronDown, Filter, Plus, Trash2, X } from '@lucide/vue'
import { usePagesStore } from '../stores/pagesStore'
import { useTabsStore } from '../stores/tabsStore'
import { useToastStore } from '../stores/toastStore'
import { useWebsitesStore } from '../stores/websitesStore'
import { randomUUID } from '../utils/random-id'
import type { WhoobeOnePage } from '../utils/pages-api'

const pagesStore = usePagesStore()
const tabsStore = useTabsStore()
const toastStore = useToastStore()
const websitesStore = useWebsitesStore()

onMounted(() => {
  pagesStore.refreshPages()
  websitesStore.refreshWebsites()
})

const searchQuery = ref('')
const pageSize = ref(25)
const currentPage = ref(1)
const sortField = ref<string>('slug')
const sortDir = ref<'asc' | 'desc'>('asc')
const isColumnsMenuOpen = ref(false)
const activeColumnNames = ref<string[]>([])
const showFilterModal = ref(false)
const queryFilters = ref<{ field: string; operator: string; value: unknown }[]>([])

interface ColumnOption { name: string; title: string }
const SYSTEM_COLUMNS: ColumnOption[] = [
  { name: 'title', title: 'Title' },
  { name: 'slug', title: 'Slug' },
  { name: 'websiteId', title: 'Website' },
  { name: 'locale', title: 'Locale' },
  { name: 'category', title: 'Category' },
  { name: 'status', title: 'Status' },
  { name: 'pimcoreId', title: 'Pimcore ID' },
  { name: 'updatedAt', title: 'Updated' },
]

const visibleColumns = computed<ColumnOption[]>(() => {
  if (activeColumnNames.value.length === 0) return SYSTEM_COLUMNS
  return activeColumnNames.value
    .map((name) => SYSTEM_COLUMNS.find((c) => c.name === name))
    .filter((c): c is ColumnOption => !!c)
})

// Order used in the View dropdown: selected columns first (in active order),
// then unselected columns (in their natural order).
const displayColumns = computed<ColumnOption[]>(() => {
  const active = activeColumnNames.value
  if (active.length === 0) return SYSTEM_COLUMNS
  const byName = new Map(SYSTEM_COLUMNS.map((c) => [c.name, c]))
  const selected = active.map((name) => byName.get(name)).filter((c): c is ColumnOption => !!c)
  const unselected = SYSTEM_COLUMNS.filter((c) => !active.includes(c.name))
  return [...selected, ...unselected]
})

function toggleColumn(fieldName: string) {
  const current = new Set(activeColumnNames.value)
  if (current.has(fieldName)) current.delete(fieldName)
  else current.add(fieldName)
  activeColumnNames.value = SYSTEM_COLUMNS.map((c) => c.name).filter((n) => current.has(n))
}

function moveColumn(name: string, delta: number) {
  const names = [...activeColumnNames.value.length > 0 ? activeColumnNames.value : SYSTEM_COLUMNS.map((c) => c.name)]
  const idx = names.indexOf(name)
  if (idx === -1) return
  const target = idx + delta
  if (target < 0 || target >= names.length) return
  names.splice(idx, 1)
  names.splice(target, 0, name)
  activeColumnNames.value = names
}

function toggleSort(colName: string) {
  if (sortField.value === colName) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = colName
    sortDir.value = 'asc'
  }
  currentPage.value = 1
}

// Filters
interface FilterField { name: string; title: string; fieldType: 'input' | 'checkbox' | 'date' }
const filterFields: FilterField[] = [
  { name: 'title', title: 'Title', fieldType: 'input' },
  { name: 'slug', title: 'Slug', fieldType: 'input' },
  { name: 'category', title: 'Category', fieldType: 'input' },
  { name: 'websiteId', title: 'Website', fieldType: 'input' },
  { name: 'locale', title: 'Locale', fieldType: 'input' },
  { name: 'published', title: 'Published', fieldType: 'checkbox' },
  { name: 'workflowState', title: 'Workflow Status', fieldType: 'input' },
  { name: 'pimcoreId', title: 'Pimcore ID', fieldType: 'input' },
  { name: 'updatedAt', title: 'Updated At', fieldType: 'date' },
]

function addQueryFilter() {
  queryFilters.value.push({ field: 'title', operator: 'contains', value: '' })
}

function clearQueryFilters() { queryFilters.value = [] }

function matchPageFilter(page: WhoobeOnePage, f: { field: string; operator: string; value: unknown }): boolean {
  const value = (page as any)[f.field]
  switch (f.operator) {
    case 'eq': return value === f.value
    case 'neq': return value !== f.value
    case 'contains': return String(value ?? '').toLowerCase().includes(String(f.value ?? '').toLowerCase())
    case 'gt': {
      const nv = Number(value); const nf = Number(f.value)
      if (!isNaN(nv) && !isNaN(nf)) return nv > nf
      const dv = new Date(value as any); const df = new Date(f.value as any)
      if (!isNaN(dv.getTime()) && !isNaN(df.getTime())) return dv.getTime() > df.getTime()
      return false
    }
    case 'lt': {
      const nv = Number(value); const nf = Number(f.value)
      if (!isNaN(nv) && !isNaN(nf)) return nv < nf
      const dv = new Date(value as any); const df = new Date(f.value as any)
      if (!isNaN(dv.getTime()) && !isNaN(df.getTime())) return dv.getTime() < df.getTime()
      return false
    }
    default: return true
  }
}

function websiteLabel(websiteId: string | null): string {
  if (!websiteId) return '—'
  return websitesStore.websites.find((w) => w.id === websiteId)?.name || websiteId
}

function pageSortValue(page: WhoobeOnePage, field: string): unknown {
  if (field === 'status') return page.published ? 1 : 0
  if (field === 'websiteId') return websiteLabel(page.websiteId)
  if (field === 'updatedAt') return new Date(page.updatedAt).getTime()
  return (page as any)[field]
}

const sortedPages = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const activeFilters = queryFilters.value.filter((f) => String(f.value ?? '').trim() !== '')
  const filtered = pagesStore.pages.filter((p) => {
    if (query && !(p.title.toLowerCase().includes(query) || p.slug.toLowerCase().includes(query))) return false
    if (activeFilters.length === 0) return true
    return activeFilters.every((f) => matchPageFilter(p, f))
  })
  const field = sortField.value
  const dir = sortDir.value
  return [...filtered].sort((a, b) => {
    const va = pageSortValue(a, field)
    const vb = pageSortValue(b, field)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    let cmp = 0
    if (typeof va === 'string' && typeof vb === 'string') cmp = va.localeCompare(vb)
    else if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb
    else cmp = String(va).localeCompare(String(vb))
    return dir === 'asc' ? cmp : -cmp
  })
})

// Batch selection
const selectedPageIds = ref<Set<string>>(new Set())

function toggleSelectPage(id: string) {
  const next = new Set(selectedPageIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedPageIds.value = next
}

function toggleSelectAll() {
  if (selectedPageIds.value.size === pagedPages.value.length) {
    selectedPageIds.value = new Set()
  } else {
    selectedPageIds.value = new Set(pagedPages.value.map((p) => p.id))
  }
}

function allPageSelected(): boolean {
  return pagedPages.value.length > 0 && pagedPages.value.every((p) => selectedPageIds.value.has(p.id))
}

async function runBatchAction(action: (id: string) => Promise<unknown>, successVerb: string) {
  const ids = [...selectedPageIds.value]; if (ids.length === 0) return
  const results = await Promise.allSettled(ids.map((id) => action(id)))
  const succeeded = results.filter((r) => r.status === 'fulfilled').length
  toastStore.show(`${succeeded} ${successVerb}, ${ids.length - succeeded} failed`)
  selectedPageIds.value = new Set()
}

async function handleBatchPublish() {
  await runBatchAction((id) => pagesStore.updatePage(id, { published: true }), 'published')
}

async function handleBatchUnpublish() {
  await runBatchAction((id) => pagesStore.updatePage(id, { published: false }), 'unpublished')
}

async function handleBatchDelete() {
  const ids = [...selectedPageIds.value]; if (ids.length === 0) return
  if (!confirm(`Delete ${ids.length} page(s)? This cannot be undone.`)) return
  await runBatchAction((id) => pagesStore.deletePage(id), 'deleted')
}

const totalPages = computed(() => Math.max(1, Math.ceil(sortedPages.value.length / pageSize.value)))

const pagedPages = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return sortedPages.value.slice(start, start + pageSize.value)
})

const pageRangeLabel = computed(() => {
  if (sortedPages.value.length === 0) return '0 of 0'
  const start = (currentPage.value - 1) * pageSize.value + 1
  const end = Math.min(sortedPages.value.length, currentPage.value * pageSize.value)
  return `${start}-${end} of ${sortedPages.value.length}`
})

watch([searchQuery, queryFilters, pageSize], () => { currentPage.value = 1 }, { deep: true })
watch(totalPages, (pages) => { if (currentPage.value > pages) currentPage.value = pages })

function handleCreate() {
  const placeholderId = `new:${randomUUID()}`
  tabsStore.openPage(placeholderId, 'settings')
}
</script>