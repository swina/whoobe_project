<template>
  <button
    type="button"
    class="px-2 py-1 rounded text-[10px] font-semibold border capitalize"
    :class="active ? 'bg-indigo-600 text-white border-indigo-600' : 'text-gray-500 border-gray-200 hover:border-gray-300'"
    @click="toggle"
  >
    {{ title || attr }}
  </button>
</template>

<script setup lang="ts">
// Port of whoobe-one-studio's tailwind.button.vue - a single toggled class
// named exactly `attr` itself (e.g. attr="italic" toggles the `italic`
// utility class directly), not a pick-one-of-many list. The source shows
// a Material Icon glyph (format_italic, format_underline, etc.) - no icon
// font is wired in this spike, so the control's own `title` (already
// present in every tw.groups.js Button entry - "italic", "underline",
// "strikethrough"...) is shown as plain text instead.
import { computed } from 'vue'
import { useEditorStore } from '../../store/editor'
import { hasClass, toggleClass } from '../../scripts/tailwind-control'

const props = defineProps<{ attr: string; title?: string }>()
const editor = useEditorStore()

const active = computed(() => hasClass(editor, props.attr))

function toggle() {
  toggleClass(editor, props.attr)
}
</script>
