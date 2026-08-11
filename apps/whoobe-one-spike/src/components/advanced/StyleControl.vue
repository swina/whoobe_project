<template>
  <div class="flex flex-col gap-1">
    <textarea
      class="w-full text-xs font-mono border rounded p-2 h-24 resize-y"
      placeholder="e.g. color: #333; padding: 4px 8px;"
      :value="editor.current?.style"
      @change="onChange"
    ></textarea>
    <p class="text-[10px] text-gray-400">Raw CSS declarations, applied directly as this element's inline style.</p>
  </div>
</template>

<script setup lang="ts">
// Not a port of a single file - the reference's BlockCss.vue bundles CSS/
// Container CSS/Style/Semantic into one panel, but this app already has
// dedicated controls for the other three (CustomClassesControl.vue,
// SemanticControl.vue) - this is just the missing `style` piece, following
// CustomClassesControl.vue's own textarea/@change pattern exactly, bound to
// `element.style` instead of `element.css.css`.
import { useEditorStore } from '../../store/editor'

const editor = useEditorStore()

function onChange(e: Event) {
  if (!editor.current) return
  editor.current.style = (e.target as HTMLTextAreaElement).value
}
</script>
