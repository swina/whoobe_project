<template>
  <div class="shrink-0 h-7 px-3 flex items-center gap-2 bg-slate-200 border-t border-slate-300 text-[10px] font-mono" data-testid="editor-statusbar">
    <span v-if="editor.current" class="shrink-0 max-w-[45%] truncate text-gray-500" :title="trail" data-testid="statusbar-trail">{{ trail }}</span>
    <span v-if="editor.current" class="shrink-0 text-gray-300">|</span>
    <label for="statusbar-custom-css" class="shrink-0 font-semibold text-gray-600">Custom CSS</label>
    <input
      id="statusbar-custom-css"
      type="text"
      class="flex-1 min-w-0 h-5 text-[11px] font-mono border-0 rounded px-1.5 bg-transparent outline-none focus:outline-none focus:ring-0 focus:bg-white hover:bg-slate-100 focus:hover:bg-white disabled:bg-transparent disabled:text-gray-400"
      :disabled="!editor.current"
      :placeholder="editor.current ? 'e.g. flex items-center gap-4 shadow-lg' : 'select an element'"
      :value="editor.current?.css?.css ?? ''"
      spellcheck="false"
      data-testid="statusbar-custom-css"
      @change="onChange"
      @keydown.enter="($event.target as HTMLInputElement).blur()"
    />
  </div>
</template>

<script setup lang="ts">
// Twin of the "Custom Classes" section of the Advanced panel (tailwind-controls/CustomClassesControl.vue): both read and write
// the selected element's `css.css`, so they always show the same value and either can be used. @change (blur / Enter), not
// @input: clean() collapses whitespace and dedupes, which would disrupt typing if it ran on every keystroke.
import { useEditorStore } from '../store/editor'
import { computed } from 'vue'
import { clean, friendlyElementName } from '../helpers'

const editor = useEditorStore()

// element type > semantic tag > #id of the selected element
const trail = computed(() => {
  const el = editor.current as any
  if (!el) return ''
  return `${friendlyElementName(el)} > <${el.semantic || 'div'}> > #${el.id}`
})

function onChange(e: Event) {
  if (!editor.current) return
  editor.current.css.css = clean((e.target as HTMLInputElement).value)
}
</script>
