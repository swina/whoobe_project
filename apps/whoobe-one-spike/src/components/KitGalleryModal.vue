<template>
  <div class="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center p-6" @click.self="$emit('close')">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden">
      <div class="flex items-center justify-between px-4 py-2 border-b shrink-0">
        <div class="text-sm">
          <span class="font-semibold text-gray-700">{{ kit?.name || 'Loading…' }}</span>
          <span v-if="kit" class="text-gray-400 ml-2 text-xs">{{ kit.category }}</span>
        </div>
        <button class="flex items-center gap-1 text-gray-400 hover:text-gray-700 text-xs" @click="$emit('close')"><X class="w-3.5 h-3.5" /> Close</button>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto p-4 bg-gray-50">
        <div v-if="loading" class="text-xs text-gray-400 text-center py-10">Loading…</div>
        <div v-else-if="error" class="text-xs text-rose-500 text-center py-10">{{ error }}</div>
        <div v-else-if="!kit?.templates.length" class="text-xs text-gray-400 text-center py-10">No templates in this kit.</div>
        <div v-else class="grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))">
          <button
            v-for="template in kit.templates"
            :key="template.id"
            type="button"
            title="Click to preview"
            class="relative w-full h-[300px] rounded-lg border border-gray-200 bg-white overflow-hidden hover:border-indigo-400"
            @click="preview(template)"
          >
            <!-- A real, live thumbnail - not a placeholder icon: the
                 template's own root node rendered through the same
                 read-only preview components DocumentPreview.vue uses,
                 scaled down and clipped to fit a fixed 300x300 box. -->
            <div class="absolute inset-0 overflow-hidden pointer-events-none">
              <div style="width: 1200px; transform: scale(0.25); transform-origin: top left">
                <BlockContainerPreview :doc="template.node" />
              </div>
            </div>
            <div class="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[11px] px-2 py-1 flex items-center justify-between gap-1">
              <span class="truncate">{{ template.name }}</span>
              <span
                role="button"
                title="Load into the currently selected container"
                class="shrink-0 px-1 rounded hover:bg-white/20 inline-flex items-center"
                @click.stop="loadTemplate(template)"
              >
                <Import class="w-3.5 h-3.5" />
              </span>
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Same mechanism the sidebar list's own "👁 Preview" button already
       uses (KitsPanel.vue) - clicking a gallery box opens the identical
       fullscreen preview, just triggered from a different (visual, not
       list-row) starting point. -->
  <DocumentPreview v-if="previewDoc" :doc="previewDoc" @close="previewDoc = null" />
</template>

<script setup lang="ts">
// Not a port - no gallery view exists in the source app for browsing a
// kit's templates visually (only ever the static JSON files themselves).
// Each box is a genuine live render of that template (BlockContainerPreview
// .vue, the same component DocumentPreview.vue's own fullscreen preview is
// built from), not a fake icon-and-label placeholder - shrunk to fit via
// a fixed-width (1200px) inner wrapper scaled down with a CSS transform
// and clipped by the box's own overflow-hidden, a standard "real DOM,
// scaled and cropped" thumbnail technique. The box only ever shows
// whatever falls within its own top-left 300x300 area after scaling - a
// representative crop, not a proportionally-fit whole-page thumbnail,
// which is an acceptable tradeoff for "what does this template look
// like" at a glance, not a pixel-perfect preview (that's what clicking
// through to the real fullscreen preview is for).
import { onMounted, ref } from 'vue'
import { Import, X } from '@lucide/vue'
import { useEditorStore } from '../store/editor'
import {
  getKitWithTemplates,
  loadKitTemplateIntoEditor,
  type KitGallery,
  type KitGalleryTemplate,
} from '../scripts/database-actions'
import BlockContainerPreview from './preview/BlockContainerPreview.vue'
import DocumentPreview from './DocumentPreview.vue'

const props = defineProps<{
  kitId: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'loaded'): void
}>()

const editor = useEditorStore()

const loading = ref(true)
const error = ref('')
const kit = ref<KitGallery | null>(null)
const previewDoc = ref<any>(null)

async function load() {
  loading.value = true
  error.value = ''
  try {
    kit.value = await getKitWithTemplates(props.kitId)
  } catch (e: any) {
    error.value = e?.message || 'Failed to load kit'
  } finally {
    loading.value = false
  }
}

function preview(template: KitGalleryTemplate) {
  previewDoc.value = template.node
}

/** Same behavior/reasoning as KitsPanel.vue's own "⬇ Load" button - inserts
 * into whatever container is currently selected in the editor, not a
 * document replacement (see database-actions.ts's loadKitTemplateInto
 * Editor()). Closes the gallery on success so the user lands back on the
 * canvas to see what was just added, same as picking from the list does. */
async function loadTemplate(template: KitGalleryTemplate) {
  const result = await loadKitTemplateIntoEditor(editor, props.kitId, template.id)
  if (result === 'loaded') {
    emit('loaded')
    emit('close')
    return
  }
  if (result === 'no-container-selected') {
    window.alert('Select a container in the document first - the template loads into whatever container is currently selected.')
    return
  }
  window.alert('That template could not be found.')
}

onMounted(load)
</script>
