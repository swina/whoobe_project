<template>
  <ColorControl :attr="attr" prefix="border" :title="title" />
</template>

<script setup lang="ts">
// Thin wrapper, not the real implementation anymore - ColorControl.vue
// generalizes what used to live here directly (see its own header comment)
// into a `prefix` prop so Text/Background/Border/Gradient color all share
// one component instead of three-plus near-duplicates. Kept as its own
// file/component name (rather than pointing TailwindCustomizer.vue's
// `BorderColor` componentMap entry straight at ColorControl) only so
// tw.groups.js's existing `{ name: 'BorderColor', attr: 'bordercolor' }`
// entry needs no rename.
import ColorControl from './ColorControl.vue'

defineProps<{ attr: string; title?: string }>()
</script>
