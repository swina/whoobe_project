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
      <button type="button" title="Clear" class="w-5 h-5 rounded-full border flex items-center justify-center text-[8px] text-gray-400" @click="pick('')">
        ✕
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
// Port of whoobe-one-studio's tailwind.border.color.vue (only the border
// variant of the source's three near-identical color controls - tw.groups.
// js's own config has "Color"/textcolor and "Color"/bgcolor commented out,
// only "BorderColor"/bordercolor is actually active; this port matches
// that, rather than building all three). The source's own picker is
// common/Palette.vue, a full popup with 9 shades per color plus a
// separate hover-state color - simplified here to a fixed, always-visible
// swatch grid at 3 shades per color, inline rather than a popup.
//
// Every swatch class (`border-{color}-{shade}`, plus `bg-{color}-{shade}`
// for the swatch's own preview fill) is built via string interpolation,
// not a literal anywhere in this file. Used to need an `@source
// inline(...)` declaration in style.css for exactly this reason (the same
// fix this session needed once before, for the ported alpha-01
// ColorPalette.vue in apps/whoobe-studio) - no longer necessary at all
// since this app switched to Tailwind's runtime/browser build (see main.
// ts): it watches the live DOM directly and generates CSS for whatever
// classes actually appear, dynamically-constructed or not.
import { useEditorStore } from '../../store/editor'
import twclasses from '../../scripts/tw.classes.js'
import { clean } from '../../helpers'

const props = defineProps<{ attr: string; title?: string }>()
const editor = useEditorStore()

const SHADES = [300, 500, 700]
const COLOR_CLASS_RE = new RegExp(`^border-(${(twclasses.colors as string[]).join('|')})-\\d+$`)

const swatches = (twclasses.colors as string[]).flatMap((color) =>
  SHADES.map((shade) => ({
    value: `border-${color}-${shade}`,
    previewClass: `border-${color}-${shade} bg-${color}-${shade}`,
  }))
)

function pick(value: string) {
  if (!editor.current) return
  const withoutOld = editor.current.css.css
    .split(' ')
    .filter((cl) => !COLOR_CLASS_RE.test(cl))
    .join(' ')
  editor.current.css.css = clean(`${withoutOld} ${value}`)
}
</script>
