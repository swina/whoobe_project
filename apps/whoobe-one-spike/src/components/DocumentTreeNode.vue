<template>
  <div class="flex flex-col">
    <button
      type="button"
      class="w-full flex items-center gap-1 py-1 pr-2 text-left truncate"
      :class="isSelected ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'"
      :style="{ paddingLeft: `${0.5 + depth * 0.75}rem` }"
      @click.stop="select"
    >
      <span v-if="hasChildren" class="w-3 shrink-0 text-gray-400" @click.stop="toggleOpen">{{ open ? '▾' : '▸' }}</span>
      <span v-else class="w-3 shrink-0"></span>
      <span class="capitalize truncate">{{ label }}</span>
    </button>
    <template v-if="hasChildren && open">
      <DocumentTreeNode v-for="child in node.blocks" :key="child.id" :node="child" :depth="depth + 1" />
    </template>
  </div>
</template>

<script setup lang="ts">
// Port of whoobe-one-studio's src/components/blocks/components/BlockTree.
// vue - a read-only structural outline of the document; clicking any row
// selects that node, same `editor.current` the canvas/floating toolbar/
// Tailwind customizer all already read from and react to.
//
// One real bug fixed, not reproduced: the source's own row click handler
// dispatches `setCurrent(current)` - "current" being the *prop* passed
// into that recursion level (i.e. always the nearest ancestor container),
// never the row's own clicked node. Combined with plain (non-stopped)
// click bubbling through every ancestor row's own handler on the way up,
// clicking any leaf in the source ends up re-selecting whichever ancestor
// row's handler happens to run last - never the actual node clicked, which
// defeats the entire point of a tree picker. Fixed here by selecting
// `node` itself (this row's own prop) and using @click.stop, so a click
// only ever selects the exact row it landed on.
//
// Self-recursive with no explicit import: Vue 3 SFCs using <script setup>
// can reference themselves in the template by their inferred (filename-
// derived) component name - the source's Options-API equivalent needed an
// explicit `name: 'BlockTree'` option for the same recursion to work.
import { computed, ref } from 'vue'
import type Element from '../scripts/ElementsClass.js'
import { useEditorStore } from '../store/editor'

type WhoobeElement = InstanceType<typeof Element>

const props = defineProps<{
  node: WhoobeElement
  depth: number
}>()

const editor = useEditorStore()

const open = ref(true)
const hasChildren = computed(() => !!props.node.blocks?.length)
const isSelected = computed(() => editor.current?.id === props.node.id)
const label = computed(() => {
  const n = props.node as any
  return n.semantic || n.tag || n.element || 'div'
})

function select() {
  editor.setCurrent(props.node)
}

function toggleOpen() {
  open.value = !open.value
}
</script>
