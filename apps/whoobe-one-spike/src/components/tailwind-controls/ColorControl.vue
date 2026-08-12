<template>
  <div class="flex flex-col gap-1">
    <span class="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{{ title }}</span>
    <div class="grid grid-cols-8 gap-1">
      <button
        v-for="swatch in swatches"
        :key="swatch.value"
        type="button"
        :title="swatch.value"
        class="w-5 h-5 rounded-full border-2"
        :class="swatch.previewClass"
        @click="pick(swatch.value)"
      ></button>
      <button type="button" title="Clear" class="w-5 h-5 rounded-full border flex items-center justify-center text-gray-400" @click="pick('')">
        <X class="w-2.5 h-2.5" />
      </button>
    </div>
    <div class="flex items-center gap-1 mt-1">
      <span class="text-[10px] uppercase tracking-wide text-gray-400 font-semibold shrink-0">Opacity</span>
      <button
        v-for="level in OPACITY_LEVELS"
        :key="level"
        type="button"
        class="flex-1 text-[9px] py-0.5 rounded border"
        :class="currentOpacity === level ? 'bg-violet-500 text-white border-violet-500' : 'bg-white text-gray-500 border-gray-300 hover:border-violet-400'"
        :disabled="!currentValue"
        @click="pickOpacity(level)"
      >{{ level }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
// Generalizes BorderColorControl.vue (same swatch-grid UI/scan-and-replace
// logic) into a `prefix` prop so one component covers Text/Background/
// Border color instead of three near-duplicates - see this session's audit:
// tw.classes.js's setColors() never appended a shade at all ('bg-blue' is
// not, and has never been, a valid Tailwind class in any version), which
// is why Text/Background Color never had a working picker to generalize
// from in the first place, and why Border Color's own swatches were built
// directly in the component rather than from setColors()'s (broken)
// `bordercolor`/`textcolor`/`bgcolor` lists - those three tw.classes.js
// entries are still exported (now correctly shaded) for any code that
// wants the raw list, but this component builds its own swatches the same
// way BorderColorControl.vue always did, not by reading them.
//
// Custom per-page theme colors (editor.document.theme.colors, added this
// session - see ThemeModal.vue) are appended after the system swatches,
// applied as Tailwind v4 arbitrary-value classes (`bg-[#3366ff]`) rather
// than named utilities - no `@theme` registration needed, the live
// `@tailwindcss/browser` runtime compiles arbitrary bracket values for any
// class already (see style.css's header comment on why `@source inline()`
// was removed entirely).
//
// Opacity is folded into this control (a 0/25/50/75/100 row operating on
// the `/N` slash modifier of whichever swatch is currently active) rather
// than being its own separate Range control - the old bgOpacity/
// textOpacity/borderOpacity Range entries picked from a list of
// `bg-opacity-*`-style classes Tailwind v3+ no longer generates any CSS
// for at all (removed in favor of exactly this slash-modifier syntax).
import { computed } from 'vue'
import { X } from '@lucide/vue'
import { useEditorStore } from '../../store/editor'
import twclasses from '../../scripts/tw.classes.js'
import { clean } from '../../helpers'

const props = defineProps<{ attr: string; prefix: string; title?: string }>()
const editor = useEditorStore()

const SHADES = [300, 500, 700]
const OPACITY_LEVELS = [0, 25, 50, 75, 100]

// Matches a currently-applied swatch class for this prefix - a system
// `{prefix}-{color}-{shade}`/flat transparent-white-black, or a custom
// `{prefix}-[...]` arbitrary value - with an optional trailing `/N`
// opacity modifier, so picking a new base color or a new opacity level
// both replace the single currently-active class rather than stacking.
const COLOR_CLASS_RE = computed(
  () => new RegExp(`^${props.prefix}-((${(twclasses.colors as string[]).join('|')})-\\d+|\\[[^\\]]+\\]|transparent|white|black)(/\\d+)?$`)
)

const themeColors = computed(() => (editor.document as any)?.theme?.colors ?? [])

const FLAT_SWATCHES = [
  { value: 'white', previewClass: 'bg-white border-gray-300' },
  { value: 'black', previewClass: 'bg-black border-black' },
  { value: 'transparent', previewClass: 'bg-transparent border-gray-300 bg-[repeating-conic-gradient(#d1d5db_0%_25%,white_0%_50%)] bg-[length:8px_8px]' },
]

const swatches = computed(() => {
  const flatSwatches = FLAT_SWATCHES.map((s) => ({ value: `${props.prefix}-${s.value}`, previewClass: s.previewClass }))
  const systemSwatches = (twclasses.colors as string[]).flatMap((color) =>
    SHADES.map((shade) => ({
      value: `${props.prefix}-${color}-${shade}`,
      previewClass: `bg-${color}-${shade}` + (props.prefix === 'border' ? ` border-${color}-${shade}` : ''),
    }))
  )
  const customSwatches = themeColors.value.map((c: { name: string; hex: string }) => ({
    value: `${props.prefix}-[${c.hex}]`,
    previewClass: `bg-[${c.hex}] border-[${c.hex}]`,
  }))
  return [...flatSwatches, ...systemSwatches, ...customSwatches]
})

const currentValue = computed(() => editor.current?.css.css.split(' ').find((cl) => COLOR_CLASS_RE.value.test(cl)) ?? '')

const currentOpacity = computed(() => {
  const match = currentValue.value.match(/\/(\d+)$/)
  return match ? parseInt(match[1], 10) : currentValue.value ? 100 : null
})

function replaceCurrent(newClass: string) {
  if (!editor.current) return
  const withoutOld = editor.current.css.css
    .split(' ')
    .filter((cl) => !COLOR_CLASS_RE.value.test(cl))
    .join(' ')
  editor.current.css.css = clean(`${withoutOld} ${newClass}`)
}

function pick(value: string) {
  replaceCurrent(value)
}

function pickOpacity(level: number) {
  if (!currentValue.value) return
  const base = currentValue.value.replace(/\/\d+$/, '')
  replaceCurrent(level === 100 ? base : `${base}/${level}`)
}
</script>
