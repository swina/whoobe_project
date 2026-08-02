<template>
  <div v-if="node.props?.unmappedBrickType" class="text-[10px] font-mono text-amber-500 mb-1 flex items-center gap-1">
    <span>⚠</span>
    <span>unmapped brick: {{ node.props.unmappedBrickType }}</span>
  </div>

  <component
    :is="node.tag || defaultTag"
    :style="node.style"
    :class="node.props?.cssClass"
    :href="node.tag === 'a' ? node.props?.href : undefined"
  >
    <span v-if="node.type === 'typography'" v-html="node.content" />

    <img
      v-else-if="node.type === 'media' && node.tag !== 'video'"
      :src="node.props?.src"
      :alt="node.props?.alt || node.name"
      style="max-width: 100%"
    />

    <video
      v-else-if="node.type === 'media' && node.tag === 'video'"
      :src="typeof node.props?.src === 'string' ? node.props.src : node.props?.src?.path"
      :autoplay="node.props?.autoplay"
      :loop="node.props?.loop"
      :muted="node.props?.muted"
      :playsinline="node.props?.playsinline"
      :controls="node.props?.controls ?? true"
      style="max-width: 100%"
    />

    <span v-else-if="node.type === 'widget'" class="text-xs text-slate-400 font-mono">
      Relation → {{ node.dataBinding?.objectId || node.props?.relationIds?.join(', ') || 'unknown' }}
    </span>

    <template v-else>
      <BlockNodePreview v-for="child in node.children" :key="child.id" :node="child" />
    </template>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { WhoobeBlockNode } from '@pimcore-custom/core'

defineOptions({ name: 'BlockNodePreview' })

const props = defineProps<{
  node: WhoobeBlockNode
}>()

// Renders each node with its own real tag/style/class so the preview
// visually matches the migrated Twig layout (e.g. header-brick's
// background-image section) instead of a schematic type/name badge tree.
const defaultTagByType: Record<string, string> = {
  container: 'div',
  grid: 'div',
  areablock: 'section',
  snippet: 'div',
  widget: 'div',
}

const defaultTag = computed(() => defaultTagByType[props.node.type] || 'div')
</script>
