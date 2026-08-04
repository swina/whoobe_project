<template>
  <div class="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center p-6" @click.self="$emit('close')">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden">
      <div class="flex items-center justify-between px-4 py-2 border-b shrink-0">
        <span class="font-semibold text-gray-700 text-sm">Templates</span>
        <button class="flex items-center gap-1 text-gray-400 hover:text-gray-700 text-xs" @click="$emit('close')">
          <X class="w-3.5 h-3.5" /> Close
        </button>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto p-4 bg-gray-50">
        <div v-if="loading" class="text-xs text-gray-400 text-center py-10">Loading…</div>
        <div v-else-if="error" class="text-xs text-rose-500 text-center py-10">{{ error }}</div>
        <div v-else-if="!templates.length" class="text-xs text-gray-400 text-center py-10">No saved templates yet.</div>
        <div v-else class="grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))">
          <button
            v-for="template in templates"
            :key="template.id"
            type="button"
            title="Click to preview"
            class="relative w-full h-[300px] rounded-lg border border-gray-200 bg-white overflow-hidden hover:border-indigo-400"
            @click="preview(template)"
          >
            <!-- Same real, live thumbnail technique as KitGalleryModal.vue -
                 the template's own root node rendered through the same
                 read-only preview component DocumentPreview.vue uses,
                 scaled down and clipped to a fixed 300x300 box. -->
            <div class="absolute inset-0 overflow-hidden pointer-events-none">
              <div style="width: 1200px; transform: scale(0.25); transform-origin: top left">
                <BlockContainerPreview :doc="template.node" />
              </div>
            </div>
            <div class="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[11px] px-2 py-1 flex items-center justify-between gap-1">
              <span class="truncate">
                {{ template.name }}
                <span v-if="template.category" class="text-gray-300">({{ template.category }})</span>
              </span>
              <span
                role="button"
                title="Load this template (replaces the current document)"
                class="shrink-0 px-1 rounded hover:bg-white/20 inline-flex items-center"
                @click.stop="load(template)"
              >
                <Import class="w-3.5 h-3.5" />
              </span>
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Same mechanism KitGalleryModal.vue already uses - clicking a box
       opens the identical fullscreen preview. -->
  <DocumentPreview v-if="previewDoc" :doc="previewDoc" @close="previewDoc = null" />
</template>

<script setup lang="ts">
// Not a port - no gallery view exists in the source app for browsing saved
// pages visually. Replaces BlockEditor.vue's old "📂 Templates" dropdown
// (a plain text list of name/category/path) with the same real, live-
// thumbnail gallery KitGalleryModal.vue already established for UI Kits -
// requested directly, to make the two consistent instead of one being a
// visual gallery and the other a bare text menu.
//
// "Load" here is a genuine replacement of the whole document (loadPage()),
// not an insert-into-a-container the way a Kit template's own Load is -
// a saved Template *is* a whole document (see database-actions.ts's own
// header comment on the Templates/Kits distinction), so loading one always
// means "start editing this instead", matching exactly what the old
// dropdown's own onLoad() already did.
import { onMounted, ref } from 'vue'
import { X, Import } from '@lucide/vue'
import { useEditorStore } from '../store/editor'
import { getTemplateGallery, loadPage, type TemplateGalleryItem } from '../scripts/database-actions'
import BlockContainerPreview from './preview/BlockContainerPreview.vue'
import DocumentPreview from './DocumentPreview.vue'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'loaded'): void
}>()

const editor = useEditorStore()

const loading = ref(true)
const error = ref('')
const templates = ref<TemplateGalleryItem[]>([])
const previewDoc = ref<any>(null)

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    templates.value = await getTemplateGallery()
  } catch (e: any) {
    error.value = e?.message || 'Failed to load templates'
  } finally {
    loading.value = false
  }
}

function preview(template: TemplateGalleryItem) {
  previewDoc.value = template.node
}

async function load(template: TemplateGalleryItem) {
  await loadPage(editor, template.id)
  emit('loaded')
  emit('close')
}

onMounted(refresh)
</script>
