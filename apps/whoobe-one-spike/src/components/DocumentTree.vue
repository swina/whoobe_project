<template>
  <div class="flex-1 min-h-0 flex flex-col text-[10px] font-normal">
    <div class="flex items-center gap-1.5 px-3 py-2 border-b shrink-0 text-[10px] text-gray-400">
      <span>Tree of</span>
      <span class="font-semibold text-gray-600 capitalize">{{ rootLabel }}</span>
      <span v-if="rootSemantic" class="font-mono text-amber-600/90">{{ rootSemantic }}</span>
    </div>
    <div class="flex-1 min-h-0 overflow-y-auto py-1">
      <div v-if="!editor.document" class="p-3 text-gray-400">No document</div>
      <template v-else>
        <DocumentTreeNode v-if="treeRoot" :node="treeRoot" :depth="0" />
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
// Not a port - the source app's tree always showed the whole document.
// This one shows the *current element's children tree* instead (per
// request): when the selection is a container the tree roots at it, so
// you see exactly what you're editing; a leaf selection shows a hint and
// falls back to the document (a leaf has no children tree to browse);
// nothing selected shows the whole page as before. The header states
// which root is shown, plus the root's own semantic tag when it has one.
import { computed } from 'vue'
import { useEditorStore } from '../store/editor'
import DocumentTreeNode from './DocumentTreeNode.vue'
import { friendlyElementName } from '../helpers'

const editor = useEditorStore()

const current = computed(() => editor.current)
const currentIsContainer = computed(() => (current.value as any)?.type === 'container')
const treeRoot = computed(() => (currentIsContainer.value ? current.value : editor.document))
const rootLabel = computed(() => (currentIsContainer.value ? friendlyElementName(current.value) : 'Page'))
const rootSemantic = computed(() => (treeRoot.value as any)?.semantic ?? '')
const leafHint = computed(() => {
  if (!current.value) return 'No element selected'
  return `"${friendlyElementName(current.value)}" is a leaf element`
})
</script>