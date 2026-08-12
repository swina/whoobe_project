<template>
  <div class="flex flex-col gap-1">
    <span class="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{{ title }}</span>
    <div class="grid grid-cols-3 gap-1.5">
      <button
        v-for="preset in PRESETS"
        :key="preset.label"
        type="button"
        :title="preset.label"
        class="h-6 rounded border border-gray-300"
        :class="preset.classes"
        @click="apply(preset.classes)"
      ></button>
    </div>
  </div>
</template>

<script setup lang="ts">
// One-click from/via/to + direction combos, built from the same (now
// correctly shaded) system colors ColorControl.vue's swatches use - see
// tw.groups.js's 'gradient' group and BgGradientControl.vue's own header
// comment for the from/via/to pieces this replaces wholesale in one click.
import { useEditorStore } from '../../store/editor'
import { clean } from '../../helpers'

defineProps<{ attr?: string; title?: string }>()
const editor = useEditorStore()

const PRESETS = [
  { label: 'Sunrise', classes: 'bg-gradient-to-r from-orange-500 to-pink-500' },
  { label: 'Ocean', classes: 'bg-gradient-to-r from-blue-500 to-teal-500' },
  { label: 'Violet', classes: 'bg-gradient-to-br from-indigo-500 to-purple-500' },
  { label: 'Forest', classes: 'bg-gradient-to-r from-green-500 to-lime-500' },
  { label: 'Slate', classes: 'bg-gradient-to-b from-slate-700 to-slate-500' },
  { label: 'Berry', classes: 'bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500' },
]

const GRADIENT_CLASS_RE = /^(bg-gradient-to-[a-z]+|from-.+|via-.+|to-.+)$/

function apply(classes: string) {
  if (!editor.current) return
  const withoutOld = editor.current.css.css
    .split(' ')
    .filter((cl) => !GRADIENT_CLASS_RE.test(cl))
    .join(' ')
  editor.current.css.css = clean(`${withoutOld} ${classes}`)
}
</script>
