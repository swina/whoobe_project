<template>
  <div class="flex flex-col gap-1">
    <span class="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{{ title }}</span>
    <select class="w-full text-xs border rounded px-1.5 py-1" :value="editor.current?.font ?? ''" @change="pick(($event.target as HTMLSelectElement).value)">
      <option value="">Default</option>
      <option v-for="font in fontList" :key="font" :value="font" :style="{ fontFamily: font.replaceAll('+', ' ') }">{{ font.replaceAll('+', ' ') }}</option>
    </select>
  </div>
</template>

<script setup lang="ts">
// Not routed through tw.classes.js/tailwind-control.ts at all, unlike
// every other control here - font selection was never a Tailwind class in
// this app (tw.classes.js's own `fontfamily` list, and tw.groups.js's
// `attr: 'textfont'` referencing it, were both entirely dead/unwired -
// see TailwindCustomizer.vue's own header comment). The real mechanism,
// already read by every renderer (BlockElement.vue/BlockContainer.vue/
// BlockSlider.vue + their *Preview.vue counterparts:
// `font-family:"${el.font.replaceAll('+',' ')}"`), is the plain
// `element.font` string field - so this control just sets that directly.
//
// Font names round-trip in Google-Fonts-URL form ('+' for spaces, e.g.
// "Alfa+Slab+One") everywhere in this app (editor.fonts, theme.fonts, the
// build-time VITE_FONT_FAMILIES list) - only converted to a real CSS
// value (spaces) at the point each renderer builds its inline style, so
// this control stores/emits that same '+' form, converting to spaces only
// for on-screen display.
//
// Font source: this page's own curated list (editor.document.theme.fonts,
// see ThemeModal.vue) if it has been customized, else the build-time
// default list (editor.fonts) - same fallback ThemeModal.vue itself seeds
// from on first open.
import { computed } from 'vue'
import { useEditorStore } from '../../store/editor'

defineProps<{ attr?: string; title?: string }>()
const editor = useEditorStore()

const fontList = computed(() => {
  const pageFonts = (editor.document as any)?.theme?.fonts as string[] | undefined
  if (pageFonts?.length) return pageFonts
  const webFonts = editor.websiteTheme?.fonts as string[] | undefined
  if (webFonts?.length) return webFonts
  return editor.fonts
})

function pick(value: string) {
  if (!editor.current) return
  editor.current.font = value
}
</script>
