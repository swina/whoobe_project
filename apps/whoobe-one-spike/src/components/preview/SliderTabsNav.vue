<template>
  <div :class="navClass">
    <button
      v-for="(slide, index) in slides"
      :key="slide.id"
      type="button"
      :class="current === index ? activeTabClass : tabClass"
      @click="$emit('select', index)"
    >
      {{ (slide as any).tabLabel || `Slide ${index + 1}` }}
    </button>
  </div>
</template>

<script setup lang="ts">
// Extracted out of BlockSliderPreview.vue rather than inlined twice, since
// `slider.tabsPosition` ('above'/'below', see ElementsClass.js's Slider()
// comment) needs this exact same row rendered at two different places in
// that component's template depending on the setting - a shared child
// component avoids maintaining two copies of the same markup in sync.
//
// `navClass`/`tabClass`/`activeTabClass` are the ONLY classes applied to
// each element here - no hardcoded default string sits alongside them
// (BlockSliderPreview.vue's `DEFAULT_SLIDER_SETTINGS` supplies the actual
// default look when a Slider node has no `slider.tabClass` etc. of its own,
// so these props are never genuinely empty in practice). Each tab gets
// EITHER `tabClass` OR `activeTabClass`, never both together - not a
// stylistic choice: an earlier version applied `itemClass` to every tab
// and layered `activeItemClass` on top only for the active one, which hit
// a real bug the first time anyone actually tried it (see ElementsClass.
// js's Slider() comment for the concrete example) - two Tailwind utilities
// covering the *same* CSS property (e.g. a built-in `bg-white` and a
// custom `bg-indigo-800` both trying to set `background-color`) resolve by
// Tailwind's own internal generated-stylesheet order, not by which class
// appears later in this `class` attribute, so the "layered" active-state
// override could silently lose to the base state's own background/text/
// border classes depending on values neither the user nor this code
// chose. Giving the active tab a single, complete class string of its own
// removes the conflict outright instead of trying to win it.
import type Element from '../../scripts/ElementsClass.js'

type WhoobeElement = InstanceType<typeof Element>

defineProps<{
  slides: WhoobeElement[]
  current: number
  navClass?: string
  tabClass?: string
  activeTabClass?: string
}>()

defineEmits<{
  (e: 'select', index: number): void
}>()
</script>
