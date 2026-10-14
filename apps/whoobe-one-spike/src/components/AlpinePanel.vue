<template>
  <div class="flex-1 min-h-0 overflow-y-auto flex flex-col text-[10px] font-normal">
    <div v-if="!editor.current" class="p-3 text-gray-400">Select an element to edit its AlpineJS directives</div>
    <div v-else class="p-2 bg-gray-200 flex-1">
      <AlpineControl />
    </div>
  </div>
</template>

<script setup lang="ts">
// Sidebar tool "AlpineJS" (BlockEditor.vue): presets and the directives of the selected element. Moved out of the
// Advanced panel; the control itself is advanced/AlpineControl.vue.
import { useEditorStore } from '../store/editor'
import AlpineControl from './advanced/AlpineControl.vue'

const editor = useEditorStore()
</script>
