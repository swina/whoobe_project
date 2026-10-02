<template>
  <div class="min-h-full bg-gray-100 py-8">
    <div class="mx-auto max-w-3xl px-4">
      <div class="mb-6 flex items-center gap-4">
        <router-link to="/" class="text-sm font-semibold text-violet-600 hover:text-violet-500">← Back to studio</router-link>
        <SearchBox />
      </div>

      <div v-if="error" class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{{ error }}</div>

      <div v-else-if="query" class="text-sm text-gray-500">
        {{ total === 0 ? 'No results' : `${total} result${total === 1 ? '' : 's'}` }} for
        <span class="font-semibold text-gray-800">"{{ query }}"</span>
        <span class="ml-1 text-gray-400">({{ tookMs }}ms)</span>
      </div>

      <ul v-if="results.length" class="mt-4 space-y-3">
        <li
          v-for="result in results"
          :key="`${result.type}-${result.id}`"
          class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
        >
          <div class="flex items-start justify-between gap-3">
            <a
              :href="result.url ?? result.path"
              class="text-base font-semibold text-violet-700 hover:text-violet-500"
              v-html="highlight(result.title)"
            ></a>
            <span
              class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              :class="typeBadgeClass(result.type)"
            >
              {{ result.type }}
            </span>
          </div>
          <p class="mt-1 text-sm text-gray-600" v-html="highlight(result.excerpt)"></p>
          <p class="mt-2 text-xs text-gray-400">
            {{ result.category || result.payload?.className || '—' }}
            <template v-if="result.url || result.path"> · {{ result.url ?? result.path }}</template>
          </p>
        </li>
      </ul>

      <div v-if="total > pageSize" class="mt-6 flex items-center justify-between">
        <button
          :disabled="page <= 1"
          class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 disabled:opacity-40"
          @click="goTo(page - 1)"
        >
          Previous
        </button>
        <span class="text-sm text-gray-500">Page {{ page }} of {{ totalPages }}</span>
        <button
          :disabled="page >= totalPages"
          class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 disabled:opacity-40"
          @click="goTo(page + 1)"
        >
          Next
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { highlightSearchSnippet } from '@whoobe-cms/core'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SearchBox from '../components/SearchBox.vue'
import { searchContent, type SearchResult, type SearchDocumentType } from '../search-api'

const route = useRoute()
const router = useRouter()

const query = computed(() => (typeof route.query.q === 'string' ? route.query.q.trim() : ''))
const page = computed(() => Math.max(1, Number.parseInt(typeof route.query.page === 'string' ? route.query.page : '1', 10) || 1))
// The search element narrows results via the URL (types + optional classId) -
// e.g. /search?q=...&type=object,asset&classId=<id>.
const types = computed<SearchDocumentType[]>(() => {
  const raw = route.query.type
  const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : []
  return values.filter((v): v is SearchDocumentType => typeof v === 'string' && ['page', 'object', 'class', 'asset'].includes(v))
})
const classId = computed(() => (typeof route.query.classId === 'string' ? route.query.classId : null))
const pageSize = 10

const results = ref<SearchResult[]>([])
const total = ref(0)
const tookMs = ref(0)
const error = ref<string | null>(null)
const loading = ref(false)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

function highlight(text: string): string {
  // The server marks matches with <em> (ts_headline); everything else is escaped
  // so a title like `<img onerror=…>` renders as text (see core search-highlight).
  return highlightSearchSnippet(text, '<mark class="bg-amber-100 text-inherit">')
}

function typeBadgeClass(type: string): string {
  if (type === 'page') return 'bg-violet-100 text-violet-700'
  if (type === 'class') return 'bg-emerald-100 text-emerald-700'
  if (type === 'asset') return 'bg-amber-100 text-amber-700'
  return 'bg-blue-100 text-blue-700'
}

function goTo(target: number) {
  router.push({
    name: 'Search',
    query: {
      q: query.value,
      page: target > 1 ? String(target) : undefined,
      type: types.value.length > 0 ? types.value.join(',') : undefined,
      classId: classId.value ?? undefined,
    },
  })
}

watch(
  [query, page, types, classId],
  async () => {
    if (query.value.length < 2) {
      results.value = []
      total.value = 0
      return
    }
    loading.value = true
    error.value = null
    try {
      const res = await searchContent({
        q: query.value,
        page: page.value,
        pageSize,
        type: types.value.length > 0 ? types.value : null,
        classId: classId.value,
      })
      results.value = res.results
      total.value = res.total
      tookMs.value = res.tookMs
    } catch (e: any) {
      error.value = e.message || 'Search failed'
      results.value = []
      total.value = 0
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)
</script>