<template>
  <div class="flex-1 min-h-0 overflow-y-auto text-[10px] font-normal">
    <div v-if="!snippetsStore.items.length" class="p-3 text-xs text-gray-400">
      No snippets yet. Select an element on the canvas and use its "Save as snippet" action (the link icon's neighbor in the floating toolbar) to create one.
    </div>
    <template v-for="category in categories" :key="category">
      <button
        type="button"
        class="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold capitalize text-gray-600 hover:bg-violet-500 hover:text-white border-b border-slate-300" :class="{ 'bg-violet-500 text-white': openGroup === category }"
        @click="openGroup = openGroup === category ? null : category"
      >
        {{ category }}
        <ChevronDown v-if="openGroup === category" class="w-3.5 h-3.5 text-gray-400" />
        <ChevronRight v-else class="w-3.5 h-3.5 text-gray-400" />
      </button>
      <div v-if="openGroup === category" class="grid grid-cols-3 gap-1.5 p-2 border-b border-slate-300 bg-gray-50 dragula-source-container max-h-[134px] overflow-y-auto overflow-x-hidden">
        <div
          v-for="snippet in snippetsFor(category)"
          :key="snippet.id"
          data-type="template"
          :data-snippet-id="snippet.id"
          :title="snippet.name"
          class="relative group/chip flex flex-col items-center justify-center gap-1 h-14 rounded-md bg-white border border-emerald-200 text-[10px] text-gray-500 text-center px-1 cursor-grab select-none hover:border-emerald-400 hover:text-emerald-700"
        >
          <img
            v-if="snippet.thumbnail"
            :src="snippet.thumbnail"
            alt=""
            draggable="false"
            title="Click to preview"
            class="w-full h-7 object-cover object-top rounded-sm border border-gray-200 cursor-zoom-in"
            @click.stop="previewSnippet = snippet"
          />
          <span v-else-if="snippet.icon" class="text-lg leading-none">{{ snippet.icon }}</span>
          <Package v-else class="w-5 h-5" />
          <span class="truncate w-full">{{ snippet.name }}</span>
          <button
            v-if="snippet.notes"
            type="button"
            title="View usage notes"
            class="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-indigo-500 text-white flex items-center justify-center"
            @mousedown.stop
            @click.stop="notesSnippet = snippet"
          >
            <Info class="w-2.5 h-2.5" />
          </button>
          <button
            type="button"
            title="Insert into the current element"
            class="absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center opacity-0 group-hover/chip:opacity-100"
            @mousedown.stop
            @click.stop="insertSnippet(snippet)"
          >
            <Import class="w-2.5 h-2.5" />
          </button>
          <button
            type="button"
            title="Delete snippet"
            class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover/chip:opacity-100"
            @mousedown.stop
            @click.stop="removeSnippet(snippet.id)"
          >
            <X class="w-2.5 h-2.5" />
          </button>
        </div>
      </div>
    </template>

    <ThumbnailModal v-if="previewSnippet?.thumbnail" :src="previewSnippet.thumbnail" :title="previewSnippet.name" @close="previewSnippet = null">
      <template #actions>
        <button class="flex items-center gap-1 text-emerald-600 hover:text-emerald-800 text-xs font-semibold" @click="insertSnippet(previewSnippet)">
          <Import class="w-3.5 h-3.5" /> Insert
        </button>
      </template>
    </ThumbnailModal>

    <!-- Usage notes overlay - the snippets-list counterpart of
         AdvancedPanel.vue's Info section, for a snippet not yet dropped
         into the canvas. -->
    <div v-if="notesSnippet" class="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center" @click.self="notesSnippet = null">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-sm flex flex-col overflow-hidden">
        <div class="flex items-center justify-between px-3 py-2 border-b shrink-0">
          <span class="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
            <span v-if="notesSnippet.icon">{{ notesSnippet.icon }}</span>
            {{ notesSnippet.name }}
          </span>
          <button class="flex items-center gap-1 text-gray-400 hover:text-gray-700 text-xs" @click="notesSnippet = null"><X class="w-3.5 h-3.5" /> Close</button>
        </div>
        <p class="p-4 text-xs text-gray-600 whitespace-pre-wrap">{{ notesSnippet.notes }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Snippets' own top-level sidebar tab, split out of BlockElementsPalette.vue
// (which used to merge saved snippets into the built-in Elements accordion
// by category, sharing "containers"/"text"/"media"/"form" sections with
// Grid/Flexbox/etc - see git history on that file for the prior design and
// its own reasoning). Snippets now get a separate category namespace,
// grouped only by whatever categories exist among saved snippets - no union
// with editor.elements's built-in group labels.
//
// Everything else is unchanged from the old merged behavior: same chip
// markup/attributes (data-type="template"/data-snippet-id,
// dragula-source-container on the grid) so BlockEditor.vue's single shared
// dragula instance and drop handler need no changes to pick these up (see
// that handler's data-snippet-id branch), same delete-in-place button, same
// one-category-open-at-a-time accordion.
//
// A chip shows the snippet's captured thumbnail when it has one, else its
// icon. An open category's grid is capped at two rows (6 snippets) and
// scrolls, so a category with many snippets doesn't push the rest of the
// accordion off screen.
import { computed, onMounted, ref, watch } from 'vue'
import { ChevronDown, ChevronRight, Import, Info, Package, X } from '@lucide/vue'
import { useSnippetsStore } from '../store/snippets'
import { useEditorStore } from '../store/editor'
import { insertSnippetNode } from '../scripts/editor-actions'
import { editorBus } from '../bus'
import ThumbnailModal from './ThumbnailModal.vue'
import type { WhoobeOneSnippet } from '../snippets-api'

const snippetsStore = useSnippetsStore()
const editor = useEditorStore()
const previewSnippet = ref<WhoobeOneSnippet | null>(null)
const openGroup = ref<string | null>(null)
const notesSnippet = ref<WhoobeOneSnippet | null>(null)

const categories = computed(() =>
  Array.from(new Set(snippetsStore.items.map((s) => s.category))).sort((a, b) => a.localeCompare(b))
)

// Auto-open the first category once snippets load, same "land on something
// useful" behavior BlockElementsPalette.vue's hardcoded default ('containers')
// gave for free - snippet categories are user-defined, so there's no fixed
// name to default to instead.
watch(
  categories,
  (list) => {
    if (openGroup.value === null && list.length > 0) openGroup.value = list[0]
  },
  { immediate: true }
)

function snippetsFor(category: string) {
  return snippetsStore.items.filter((s) => s.category === category)
}

// "Insert" button (chip hover / preview modal): same result as dragging the
// chip onto the canvas, but into the currently selected element (or after
// it, or at the document root - see insertSnippetNode()).
function insertSnippet(snippet: WhoobeOneSnippet) {
  if (insertSnippetNode(editor, snippet)) {
    editorBus.emit('editorMessage', `Added "${snippet.name}"`)
    previewSnippet.value = null
  } else {
    editorBus.emit('editorMessage', 'Open a page or snippet first')
  }
}

async function removeSnippet(id: string) {
  if (!window.confirm('Delete this snippet?')) return
  try {
    await snippetsStore.remove(id)
  } catch (e: any) {
    window.alert(e?.message || 'Failed to delete snippet')
  }
}

onMounted(() => {
  snippetsStore.refresh()
})
</script>
