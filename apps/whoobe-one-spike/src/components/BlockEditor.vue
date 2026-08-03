<template>
  <div class="h-full flex flex-col bg-gray-100 text-black">
    <div class="shrink-0 h-10 px-4 flex items-center gap-2 bg-white border-b shadow-sm text-sm">
      <span class="font-semibold text-gray-700">Whoobe One - Phase 0 spike</span>
      <span class="text-gray-400">|</span>
      <span class="text-gray-500">
        selected: <b>{{ editor.current ? editor.current.element + ' (' + editor.current.id + ')' : 'none' }}</b>
      </span>
      <div class="flex-1"></div>

      <span v-if="saveState" class="text-[11px] text-gray-400 mr-1">{{ saveState }}</span>

      <div class="relative">
        <button :class="topbarBtnClass" @click="toggleLoadMenu">📂 Load</button>
        <div
          v-if="showLoadMenu"
          class="absolute right-0 mt-1 w-56 bg-white border rounded-md shadow-lg z-50 py-1 text-xs"
        >
          <div v-if="!savedPages.length" class="px-3 py-2 text-gray-400">No saved pages yet</div>
          <button
            v-for="p in savedPages"
            :key="p.id"
            class="w-full text-left px-3 py-1.5 hover:bg-gray-100"
            @click="onLoad(p.id)"
          >
            {{ p.name }} <span class="text-gray-400">({{ p.category }})</span>
          </button>
        </div>
      </div>
      <button :class="topbarBtnClass" @click="onSave">💾 Save</button>
      <button :class="topbarBtnClass" @click="exportDocument(editor)">⬇ Export</button>
      <button :class="topbarBtnClass" @click="fileInput?.click()">⬆ Import</button>
      <input ref="fileInput" type="file" accept="application/json" class="hidden" @change="onImportFile" />
      <button :class="topbarBtnClass" @click="editor.setPreview('fullscreen')">👁 Preview</button>
    </div>

    <div class="flex-1 min-h-0 flex">
      <!-- @click.self, not plain @click: a plain @click here would also
           fire on the way up from a click already handled deeper in the
           tree (e.g. BlockContainer's own @click.self selecting a
           container) - a click event keeps bubbling after being handled,
           it doesn't stop just because something deeper acted on it. That
           was a real bug: select a container by clicking its background,
           and this handler would immediately clear the selection right
           back to null in the same click. @click.self only fires when
           this exact div was the actual click target - i.e. genuinely
           outside the whole document tree. -->
      <div class="flex-1 min-h-0 overflow-auto p-6" @click.self="editor.setCurrent(null)">
        <BlockContainer v-if="editor.document" :doc="editor.document" :level="0" />
      </div>

      <!-- Right sidebar: a tab switcher between the "add element" palette
           and the Tailwind customizer, mirroring the source's own right-
           side toolbar (Elements/Tailwind/CSS/Attributes/... tabs) rather
           than the earlier single-purpose always-elements sidebar. -->
      <div class="shrink-0 flex flex-col border-l bg-white">
        <div class="flex border-b text-xs shrink-0">
          <button
            class="flex-1 px-3 py-2 font-semibold"
            :class="sidebarTab === 'elements' ? 'text-indigo-600 border-b-2 border-indigo-600 -mb-px' : 'text-gray-400 hover:text-gray-600'"
            @click="sidebarTab = 'elements'"
          >
            Elements
          </button>
          <button
            class="flex-1 px-3 py-2 font-semibold"
            :class="sidebarTab === 'customize' ? 'text-indigo-600 border-b-2 border-indigo-600 -mb-px' : 'text-gray-400 hover:text-gray-600'"
            @click="sidebarTab = 'customize'"
          >
            Customize
          </button>
          <button
            class="flex-1 px-3 py-2 font-semibold"
            :class="sidebarTab === 'tree' ? 'text-indigo-600 border-b-2 border-indigo-600 -mb-px' : 'text-gray-400 hover:text-gray-600'"
            @click="sidebarTab = 'tree'"
          >
            Tree
          </button>
        </div>
        <!-- Real BlockElements.vue port (categorized, drag-to-add) - see
             BlockElementsPalette.vue. Dragging out of it works exactly like
             the old flat palette row did (same data-type="template"/
             data-template attributes, same dragula-source-container class),
             so the shared dragula instance/drop handler below need no
             changes. -->
        <BlockElementsPalette v-if="sidebarTab === 'elements'" />
        <TailwindCustomizer v-else-if="sidebarTab === 'customize'" />
        <DocumentTree v-else />
      </div>
    </div>

    <FloatingToolbar />

    <DocumentPreview v-if="editor.preview" :doc="editor.document" @close="editor.setPreview(false)" />

    <div v-if="message" class="shrink-0 px-4 py-1.5 bg-emerald-600 text-white text-xs">{{ message }}</div>
  </div>
</template>

<script setup lang="ts">
// Port of whoobe-one-studio's src/components/blocks/BlockEditor.vue,
// trimmed to Phase 0 scope (see docs/plans/cms/whoobe-one-studio-vue3-port-
// plan.md §5): the floating-toolbar positioning system, autosave, and
// dialog-bus wiring are all deferred (Phase 2+) - this keeps just enough
// chrome to add/select/edit/reorder/delete nodes, which is what Phase 0
// exists to prove works at all under Vue 3.
//
// The single dragula instance lives here (not one per BlockContainer, see
// that file's comment) and is the part of this spike carrying the most
// real risk: dragula physically moves the dragged DOM node into the target
// container as part of its own drag UX, *before* our 'drop' handler runs.
// If we then also push a data node into the target's reactive array, Vue's
// own re-render creates a *new* DOM node for it, leaving dragula's
// manually-moved original node behind as a duplicate. The fix (a
// well-known Vue+dragula integration pattern): undo dragula's DOM move
// ourselves in the 'drop' handler before mutating state, so Vue's reactive
// re-render is the only thing that ever decides final DOM order - true
// whether the dropped item is an existing node being reordered or a brand
// new one being created from the palette below.
import { onMounted, onUnmounted, ref } from 'vue'
import dragula from 'dragula'
import Element from '../scripts/ElementsClass.js'
import BlockContainer from './BlockContainer.vue'
import FloatingToolbar from './FloatingToolbar.vue'
import BlockElementsPalette from './BlockElementsPalette.vue'
import TailwindCustomizer from './TailwindCustomizer.vue'
import DocumentTree from './DocumentTree.vue'
import DocumentPreview from './DocumentPreview.vue'
import { useEditorStore } from '../store/editor'
import { clean, findNodeById, removeNodeById, applyImagePlaceholder } from '../helpers'
import { editorBus } from '../bus'
import { exportDocument, importDocument } from '../scripts/editor-actions'
import { savePage, listPages, loadPage, type SavedPageSummary } from '../scripts/database-actions'

const editor = useEditorStore()
const message = ref('')
const topbarBtnClass = 'px-2 py-1 rounded-md text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-white'
const sidebarTab = ref<'elements' | 'customize' | 'tree'>('elements')

function flash(text: string) {
  message.value = text
  window.setTimeout(() => (message.value = ''), 1500)
}

// Phase 2: real Dexie-backed save/load (database-actions.ts, wrapping the
// already-ported-but-dormant-since-Phase-0 DatabaseClass.js) and JSON
// export/import (editor-actions.ts). `showLoadMenu`/`savedPages` back a
// tiny dropdown rather than a full gallery UI (Templates.vue/PagesGallery.
// vue are Phase 3 scope).
const saveState = ref('')
const showLoadMenu = ref(false)
const savedPages = ref<SavedPageSummary[]>([])
const fileInput = ref<HTMLInputElement | null>(null)

async function onSave() {
  saveState.value = 'saving…'
  await savePage(editor)
  saveState.value = 'saved ' + new Date().toLocaleTimeString()
}

async function refreshSavedPages() {
  savedPages.value = await listPages()
}

async function toggleLoadMenu() {
  showLoadMenu.value = !showLoadMenu.value
  if (showLoadMenu.value) await refreshSavedPages()
}

async function onLoad(id: string) {
  await loadPage(editor, id)
  showLoadMenu.value = false
  flash('Loaded')
}

async function onImportFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  await importDocument(editor, file)
  if (fileInput.value) fileInput.value.value = ''
  flash('Imported')
}

// Alt+N (hotkeys.ts) has emitted this since Phase 1 with nothing
// listening - this is the first real listener, matching hotkeys.ts's own
// comment that the preview hotkey "stays inert until the feature it
// targets is actually built".
function onPreviewEvent(mode: string) {
  editor.setPreview(mode)
}
onMounted(() => editorBus.on('preview', onPreviewEvent))
onUnmounted(() => editorBus.off('preview', onPreviewEvent))

onMounted(() => {
  const drake = dragula({
    isContainer: (el) => !!el?.classList.contains('dragula-container') || !!el?.classList.contains('dragula-source-container'),
    // Whitelist (only "element"/"template" direct children are draggable),
    // not a "!== container" blacklist - BlockContainer's selector tab
    // button is also a direct child of a .dragula-container div, and it
    // must never be picked up as a drag source.
    moves: (el) => {
      const type = el?.getAttribute('data-type')
      return type === 'element' || type === 'template'
    },
    accepts: (el, target, source) => {
      if (!el || !target) return false
      // The palette is a fixed menu, never a real drop target.
      if (target.classList.contains('dragula-source-container')) return false
      if (target === source) return false
      const type = el.getAttribute('data-type')
      return type === 'element' || type === 'template'
    },
    // Items dragged out of the palette are copied - the original stays put
    // (it's a menu, not inventory) - while real elements dragged between
    // real containers are moved, same as before.
    copy: (_el, source) => !!source?.classList.contains('dragula-source-container'),
  })

  drake.on('drop', (el, target) => {
    if (!editor.document || !target) return
    // Undo dragula's own DOM move/copy first - see file header comment.
    // Vue's reactive re-render (triggered by the state mutation below) is
    // what actually determines the element's final DOM position.
    if (el.parentNode === target) target.removeChild(el)

    const targetId = target.getAttribute('data-id')
    if (!targetId) return
    const targetNode = findNodeById(editor.document, targetId)
    if (!targetNode) return

    const templateName = el.getAttribute('data-template')
    if (templateName) {
      // A palette drag: construct a brand new node rather than moving an
      // existing one. Position isn't drop-precise (always appended) - a
      // reasonable Phase 0 simplification, not attempted here since the
      // question this spike exists to answer is "can drag-to-add work at
      // all", not "is the exact drop index pixel-perfect".
      const created = new Element().createElement(templateName, templateName === 'Flexbox' ? { direction: 'col' } : {})
      if (!created) return
      created.css.css = clean(created.css.css)
      applyImagePlaceholder(created)
      targetNode.blocks.push(created)
      editor.setCurrent(created)
      flash(`Added ${templateName}`)
      return
    }

    const id = el.getAttribute('data-id')
    if (!id) return
    const node = removeNodeById(editor.document, id)
    if (node) {
      targetNode.blocks.push(node)
      editorBus.emit('editorMessage', 'Block moved')
      flash('Moved')
    }
  })
})
</script>
