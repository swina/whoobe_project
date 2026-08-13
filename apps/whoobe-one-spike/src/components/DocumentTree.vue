<template>
  <div class="flex-1 min-h-0 overflow-y-auto text-xs py-1">
    <div v-if="!editor.document" class="p-3 text-gray-400">No document</div>
    <DocumentTreeNode v-else :node="editor.document" :depth="0" />
  </div>
</template>

<script setup lang="ts">
// Sidebar tab wrapper around DocumentTreeNode.vue (the actual recursive
// row rendering) - kept as its own thin file so the tab switcher in
// BlockEditor.vue can mount/unmount it exactly like BlockElementsPalette.
// vue and TailwindCustomizer.vue, its two sibling tabs.
import { useEditorStore } from '../store/editor'
import DocumentTreeNode from './DocumentTreeNode.vue'

const editor = useEditorStore()
</script>
