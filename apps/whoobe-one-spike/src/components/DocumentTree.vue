<template>
  <div class="flex-1 min-h-0 flex flex-col text-[10px] font-normal">
    <div class="flex items-center gap-1.5 px-3 py-2 border-b shrink-0 text-[10px] text-gray-400">
      <span>Tree of</span>
      <span class="font-semibold text-gray-600 capitalize">{{ rootLabel }}</span>
      <span v-if="rootSemantic" class="font-mono text-amber-600/90">{{ rootSemantic }}</span>
      <!-- the whole page (the selection is highlighted and kept in view), or only the selected container's branch -->
      <span class="ml-auto flex rounded border border-gray-200 overflow-hidden" role="group" aria-label="What the tree shows">
        <button type="button" data-testid="tree-scope-page" class="px-1.5 py-0.5" :class="scope === 'page' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-500 hover:bg-gray-100'" title="Show the whole page" @click="setScope('page')">Page</button>
        <button type="button" data-testid="tree-scope-selection" class="px-1.5 py-0.5 border-l border-gray-200" :class="scope === 'selection' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-500 hover:bg-gray-100'" title="Show only the selected container" @click="setScope('selection')">Selection</button>
      </span>
    </div>
    <div class="flex-1 min-h-0 overflow-y-auto py-1">
      <div v-if="!editor.document" class="p-3 text-gray-400">No document</div>
      <template v-else>
        <div v-if="treeRoot" role="tree">
          <DocumentTreeNode :key="(treeRoot as any).id" :node="treeRoot" :depth="0" />
        </div>
        <div v-else class="p-3 text-gray-400">
          {{ leafHint }} — select a container to browse its children.
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
// Sidebar tab wrapper around DocumentTreeNode.vue (the actual recursive
// row rendering) - kept as its own thin file so the tab switcher in
// BlockEditor.vue can mount/unmount it exactly like BlockElementsPalette.
// vue and TailwindCustomizer.vue, its two sibling tabs.
//
// Not a port. What the tree shows is the user's choice (the "Page" / "Selection" switch, remembered): the whole page, with the
// selected element highlighted, its branch opened and its row kept in view (the default - a tree you can only see a branch of
// cannot be used to move something out of that branch); or, as before, only the branch of the selected container (a leaf
// selection falls back to the page). The header says which root is shown and its semantic tag.
import { computed, ref } from 'vue'
import { useEditorStore } from '../store/editor'
import DocumentTreeNode from './DocumentTreeNode.vue'
import { friendlyElementName } from '../helpers'

const editor = useEditorStore()

const SCOPE_KEY = 'whoobe-one:tree-scope'
function readScope(): 'page' | 'selection' {
  try { return localStorage.getItem(SCOPE_KEY) === 'selection' ? 'selection' : 'page' } catch { return 'page' }
}
const scope = ref<'page' | 'selection'>(readScope())
function setScope(next: 'page' | 'selection') {
  scope.value = next
  try { localStorage.setItem(SCOPE_KEY, next) } catch { /* private window: the choice lasts until reload */ }
}

const current = computed(() => editor.current)
const currentIsContainer = computed(() => (current.value as any)?.type === 'container')
const branchOnly = computed(() => scope.value === 'selection' && currentIsContainer.value)
const treeRoot = computed(() => (branchOnly.value ? current.value : editor.document))
const rootLabel = computed(() => (branchOnly.value ? friendlyElementName(current.value) : 'Page'))
const rootSemantic = computed(() => (treeRoot.value as any)?.semantic ?? '')
const leafHint = computed(() => {
  if (!current.value) return 'No element selected'
  return `"${friendlyElementName(current.value)}" is a leaf element`
})
</script>