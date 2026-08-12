<template>
  <ChevronLeft v-if="name === 'chevron-left'" class="w-full h-full" />
  <ChevronRight v-else-if="name === 'chevron-right'" class="w-full h-full" />
  <ArrowLeft v-else-if="name === 'arrow-left'" class="w-full h-full" />
  <ArrowRight v-else-if="name === 'arrow-right'" class="w-full h-full" />
  <!-- Lucide has no separate left/right "triangle" icon - `Play` already is
       one (a filled triangle pointing right), so "left" is just that same
       icon mirrored with a Tailwind transform rather than a second shape. -->
  <Play v-else-if="name === 'triangle-left'" class="w-full h-full rotate-180" />
  <Play v-else-if="name === 'triangle-right'" class="w-full h-full" />
  <House v-else-if="name === 'home'" class="w-full h-full" />
  <Dot v-else-if="name === 'dot'" class="w-full h-full" />
  <Circle v-else class="w-full h-full" />
</template>

<script setup lang="ts">
// Real icon rendering, not a hand-rolled SVG set (an earlier version of
// this file was exactly that - a handful of inline <svg> shapes, because
// at the time this was the only real icon rendering anywhere in this app;
// ElementsClass.js's `Icon()`/`Iconify()` element types didn't draw
// anything at all, since replaced by a real LucideIcon element type - see
// ElementsClass.js's own LucideIcon() builder and BlockElementPreview.vue's
// iconComponent). `@lucide/vue` is already this monorepo's own established
// icon library (apps/admin-dashboard imports it the exact same
// way - named components, sized via a plain Tailwind `class`), so this
// swaps the hand-rolled shapes for real Lucide ones instead of inventing a
// second, competing icon system just for this component.
//
// The public `name` prop/type is unchanged from the hand-rolled version -
// callers (BlockSliderPreview.vue, FloatingToolbar.vue's icon pickers)
// don't need to know or care that the actual rendering swapped underneath.
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Circle, Dot, House, Play } from '@lucide/vue'

export type SliderNavIconName =
  | 'chevron-left'
  | 'chevron-right'
  | 'arrow-left'
  | 'arrow-right'
  | 'triangle-left'
  | 'triangle-right'
  | 'home'
  | 'dot'
  | 'circle'

defineProps<{
  name: SliderNavIconName
}>()
</script>
