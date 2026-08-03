<template>
  <div class="flex flex-col gap-1">
    <textarea
      class="w-full text-xs font-mono border rounded p-2 h-24 resize-y"
      placeholder="e.g. flex items-center gap-4 shadow-lg"
      :value="editor.current?.css.css"
      @change="onChange"
    ></textarea>
    <p class="text-[10px] text-gray-400">Space-separated Tailwind utility classes, applied directly - not CSS.</p>
  </div>
</template>

<script setup lang="ts">
// Not a port - no equivalent exists in the source app (its closest thing,
// BlockCss.vue, is unported "access to CSS and style... and semantic",
// a different, broader scope). A plain textarea directly on the selected
// node's raw `css.css` string, as an escape hatch alongside the
// structured Options/Range/Checkbox/Button/BorderColor pickers - those
// only ever cover one attribute at a time from a known list; this lets
// the user type or paste any class(es) at all.
//
// @change (fires on blur), not @input (fires every keystroke) - clean()
// collapses whitespace and dedupes, which would be disruptive to re-run
// on every keystroke while the user is still typing.
import { useEditorStore } from '../../store/editor'
import { clean } from '../../helpers'

// attr/title aren't used - declared only so TailwindCustomizer.vue's
// uniform :attr/:title bindings (passed to every control the same way)
// don't fall through as stray raw HTML attributes on the textarea below.
defineProps<{ attr?: string; title?: string }>()

const editor = useEditorStore()

function onChange(e: Event) {
  if (!editor.current) return
  editor.current.css.css = clean((e.target as HTMLTextAreaElement).value)
}
</script>
