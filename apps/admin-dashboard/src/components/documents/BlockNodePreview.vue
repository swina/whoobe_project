<template>
  <div class="space-y-2">
    <div
      v-if="node.type === 'typography'"
      class="text-sm text-slate-200"
    >
      <component :is="node.tag || 'div'">{{ node.content }}</component>
    </div>

    <img
      v-else-if="node.type === 'media' && node.tag !== 'video'"
      :src="node.props?.src"
      :alt="node.props?.alt || node.name"
      class="max-w-xs rounded-lg border border-slate-800"
    />

    <video
      v-else-if="node.type === 'media' && node.tag === 'video'"
      :src="typeof node.props?.src === 'string' ? node.props.src : node.props?.src?.path"
      controls
      class="max-w-xs rounded-lg border border-slate-800"
    />

    <div v-else-if="node.type === 'widget'" class="text-xs text-slate-400 font-mono px-2 py-1 rounded bg-slate-950 border border-slate-800 inline-block">
      Relation → {{ node.dataBinding?.objectId || node.props?.relationIds?.join(', ') || 'unknown' }}
    </div>

    <div v-else class="space-y-2">
      <div class="flex items-center gap-2 text-[11px] text-slate-500 font-mono uppercase tracking-wider">
        <span class="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">{{ node.type }}</span>
        <span v-if="node.name">{{ node.name }}</span>
        <span
          v-if="node.props?.unmappedBrickType"
          class="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 normal-case"
          title="No brick-specific mapping registered yet - showing raw fields"
        >
          unmapped brick: {{ node.props.unmappedBrickType }}
        </span>
      </div>

      <div v-if="node.children?.length" class="pl-4 border-l border-slate-800 space-y-3">
        <BlockNodePreview v-for="child in node.children" :key="child.id" :node="child" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { WhoobeBlockNode } from '@pimcore-custom/core'

defineOptions({ name: 'BlockNodePreview' })

defineProps<{
  node: WhoobeBlockNode
}>()
</script>
