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
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search by title or slug..."
        class="flex-1 px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 rounded-lg text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
      />
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
            <th class="py-3 px-4 w-8"></th>
            <th class="py-3 px-4">Title</th>
            <th class="py-3 px-4">Slug</th>
            <th class="py-3 px-4">Website</th>
            <th class="py-3 px-4">Locale</th>
            <th class="py-3 px-4">Status</th>
            <th class="py-3 px-4">Pimcore ID</th>
            <th class="py-3 px-4">Updated</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/60 light:divide-slate-200/60">
          <tr
            v-for="page in pagedPages"
            :key="page.id"
            @click="tabsStore.openPage(page.id)"
            class="cursor-pointer hover:bg-slate-800/50 light:bg-slate-100/50 transition"
          >
            <td class="py-2.5 px-4 text-center">
              <FileText class="w-4 h-4 text-indigo-400 inline" />
            </td>
            <td class="py-2.5 px-4 font-semibold text-slate-100 light:text-slate-900">{{ page.title }}</td>
            <td class="py-2.5 px-4 font-mono text-indigo-300">{{ page.slug }}</td>
            <td class="py-2.5 px-4 text-slate-400 light:text-slate-600">{{ page.website_id }}</td>
            <td class="py-2.5 px-4 text-slate-400 light:text-slate-600">{{ page.locale }}</td>
            <td class="py-2.5 px-4">
              <span
                :class="[
                  'px-2 py-0.5 text-[10px] font-bold rounded-full border uppercase',
                  page.published ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                ]"
              >
                {{ page.published ? 'published' : (page.workflowState || 'draft') }}
              </span>
            </td>
            <td class="py-2.5 px-4 text-slate-500 font-mono">{{ page.pimcoreId ?? '—' }}</td>
            <td class="py-2.5 px-4 text-slate-400 light:text-slate-600">{{ new Date(page.updatedAt).toLocaleString() }}</td>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { FileText } from '@lucide/vue'
import { usePagesStore } from '../stores/pagesStore'
import { useTabsStore } from '../stores/tabsStore'

const pagesStore = usePagesStore()
const tabsStore = useTabsStore()

onMounted(() => {
  pagesStore.refreshPages()
})

const searchQuery = ref('')
const pageSize = ref(25)
const currentPage = ref(1)

const sortedPages = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const filtered = query
    ? pagesStore.pages.filter((p) => p.title.toLowerCase().includes(query) || p.slug.toLowerCase().includes(query))
    : pagesStore.pages
  return [...filtered].sort((a, b) => a.slug.localeCompare(b.slug))
})

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

watch(searchQuery, () => { currentPage.value = 1 })
watch(pageSize, () => { currentPage.value = 1 })
watch(totalPages, (pages) => { if (currentPage.value > pages) currentPage.value = pages })

function handleCreate() {
  const placeholderId = `new:${crypto.randomUUID()}`
  tabsStore.openPage(placeholderId, 'settings')
}
</script>