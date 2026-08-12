<template>
  <ColorControl :attr="attr" :prefix="attr" :title="title" />
</template>

<script setup lang="ts">
// Thin wrapper around ColorControl.vue, same pattern as BorderColorControl.
// vue - the only reason this exists as its own file rather than pointing
// tw.groups.js's `{ name: 'BgGradient', attr: 'from'|'via'|'to' }` entries
// straight at ColorControl is so that component name stays meaningful.
// `attr` doubles as the Tailwind class prefix here (`from`/`via`/`to` are
// themselves valid utility prefixes - `from-red-500`, `via-red-500`,
// `to-red-500` - unlike `textcolor`/`bgcolor`/`bordercolor`, which are
// tw.groups.js's *attribute* names, not real Tailwind prefixes).
//
// Never rendered without a direction: tw.groups.js's 'gradient' group also
// has an `Options`/`gradient` entry (already worked before this session,
// via the generic OptionsControl.vue) picking `bg-gradient-to-*` - a real
// gradient needs that plus at least a `from`/`to` pair, same as vanilla
// Tailwind; this control has no opinion on that, it only ever manages its
// own single from/via/to swatch.
import ColorControl from './ColorControl.vue'

defineProps<{ attr: string; title?: string }>()
</script>
