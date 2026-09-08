<template>
  <div class="absolute inset-0 overflow-hidden pointer-events-none">
    <div style="width: 1200px; transform: scale(0.25); transform-origin: top left">
      <SnippetNodeRenderer :node="nodeRecord" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import SnippetNodeRenderer from './SnippetNodeRenderer.vue'

const props = defineProps<{ node: unknown }>()

const nodeRecord = computed(() => (props.node as Record<string, any>) ?? {})
</script>