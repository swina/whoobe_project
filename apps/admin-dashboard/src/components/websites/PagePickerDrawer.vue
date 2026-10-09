<template>
  <div class="fixed inset-0 z-50 flex justify-end">
    <div class="absolute inset-0 bg-black/40" @click="$emit('close')"></div>
    <div class="relative w-96 h-full bg-slate-900 light:bg-white border-l border-slate-800 light:border-slate-200 shadow-2xl flex flex-col z-10">
      <div class="flex items-center justify-between px-4 py-3 border-b border-slate-800 light:border-slate-200">
        <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800">Link a Page</h3>
        <button @click="$emit('close')" class="btn btn-link-muted">✕</button>
      </div>

      <div class="px-4 py-2 border-b border-slate-800/60 light:border-slate-200/60">
        <input
          v-model="search"
          type="text"
          placeholder="Search pages by title or slug…"
          class="field w-full"
        />
      </div>

      <div class="flex-1 overflow-y-auto p-2 space-y-1">
        <div v-if="pagesStore.isLoading" class="text-xs text-slate-500 text-center py-4">Loading pages…</div>
        <div v-else-if="filteredPages.length === 0" class="text-xs text-slate-500 text-center py-4 italic">No pages found for this website.</div>
        <div
          v-for="page in filteredPages"
          :key="page.id"
          draggable="true"
          @dragstart="onPageDragStart($event, page)"
          @click="selectPage(page)"
          class="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-800/60 light:hover:bg-slate-100 border border-transparent hover:border-slate-700/60 light:hover:border-slate-200 transition group"
        >
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-semibold text-slate-200 light:text-slate-800 truncate">{{ page.title }}</span>
              <span :class="['inline-block w-1.5 h-1.5 rounded-full shrink-0', page.published ? 'bg-emerald-400' : 'bg-amber-400']" :title="page.published ? 'Published' : 'Draft'"></span>
            </div>
            <div class="text-[10px] text-slate-500 font-mono truncate">/{{ page.slug }}</div>
          </div>
          <span class="text-[10px] text-slate-600 font-mono shrink-0">{{ page.locale }}</span>
        </div>
      </div>

      <div class="px-4 py-3 border-t border-slate-800 light:border-slate-200">
        <button
          @click="creating = true"
          class="btn btn-primary w-full"
        >
          + Create New Page
        </button>
      </div>

      <!-- Quick-create form -->
      <div v-if="creating" class="px-4 py-3 border-t border-slate-800 light:border-slate-200 space-y-2 text-xs">
        <input v-model="newTitle" type="text" placeholder="Page title" class="field w-full" />
        <input v-model="newSlug" type="text" placeholder="slug" class="field w-full font-mono" />
        <div class="flex justify-end gap-2">
          <button @click="creating = false" class="btn btn-link-muted">Cancel</button>
          <button @click="createPage" :disabled="!newTitle.trim() || !newSlug.trim()" class="btn btn-primary btn-sm">Create</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { usePagesStore } from '../../stores/pagesStore'
import type { WhoobeOnePage } from '../../utils/pages-api'

const props = defineProps<{
  websiteId: string
  locale: string
}>()

const emit = defineEmits<{
  (e: 'select', page: WhoobeOnePage): void
  (e: 'close'): void
}>()

const pagesStore = usePagesStore()
const search = ref('')
const creating = ref(false)
const newTitle = ref('')
const newSlug = ref('')

const filteredPages = computed(() => {
  let list = pagesStore.pages
  if (search.value.trim()) {
    const q = search.value.toLowerCase()
    list = list.filter((p) => p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q))
  }
  return list
})

function selectPage(page: WhoobeOnePage) {
  emit('select', page)
}

function onPageDragStart(e: DragEvent, page: WhoobeOnePage) {
  if (!e.dataTransfer) return
  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData('application/page-id', page.id)
  e.dataTransfer.setData('application/page-title', page.title)
  e.dataTransfer.setData('application/page-slug', page.slug)
}

async function createPage() {
  if (!newTitle.value.trim() || !newSlug.value.trim()) return
  try {
    const created = await pagesStore.createPage({
      slug: newSlug.value.trim(),
      title: newTitle.value.trim(),
      content: { id: 'whoobe-' + Math.random().toString(36).substr(2, 5), tag: 'document', type: 'container', element: 'div', css: { css: '', container: 'flex flex-col' }, blocks: [] },
      websiteId: props.websiteId,
    })
    creating.value = false
    newTitle.value = ''
    newSlug.value = ''
    emit('select', created)
  } catch (e: any) {
    alert(e?.message || 'Failed to create page')
  }
}

onMounted(() => {
  pagesStore.refreshPages()
})
</script>