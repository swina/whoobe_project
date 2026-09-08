<template>
  <div class="absolute inset-0 overflow-hidden pointer-events-none">
    <div style="width: 1200px; transform: scale(0.25); transform-origin: top left">
      <SnippetNodeRenderer :node="node" />
    </div>
  </div>
</template>

<script setup lang="ts">
import SnippetNodeRenderer from './SnippetNodeRenderer.vue'

defineProps<{ node: unknown }>()
</script>