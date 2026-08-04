<template>
  <div class="flex flex-col gap-1">
    <span class="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{{ title }}</span>
    <select
      v-model="semanticValue"
      class="w-full px-2 py-1.5 text-xs rounded border border-gray-300 focus:outline-none focus:border-indigo-500"
    >
      <option v-for="tag in semanticTagOptions" :key="tag" :value="tag">&lt;{{ tag }}&gt;</option>
    </select>
  </div>
</template>

<script setup lang="ts">
// Not from tw.groups.js - no source equivalent (same "no source group to
// slot into" situation CustomClassesControl.vue's own header comment
// describes). Requested directly as a second place to reach the same
// setting FloatingToolbar.vue's own "Semantic tag" popover already
// controls (see BlockContainer.vue's `semantic` computed for the full
// story - this app's editing canvas and preview both already render
// whatever real HTML tag `semantic` holds, falling back to a plain `div`).
// Both controls read/write the exact same `editor.current.semantic` field,
// so there's nothing to keep in sync - picking one here shows up in the
// other immediately, and vice versa.
//
// Same `tw.classes.js` `semantics` list FloatingToolbar.vue's own control
// already uses - not a second, parallel list.
import { computed } from 'vue'
import { useEditorStore } from '../../store/editor'
import twclasses from '../../scripts/tw.classes.js'

defineProps<{ attr?: string; title?: string }>()

const editor = useEditorStore()

const semanticTagOptions = twclasses.semantics as string[]

// Same "show the effective tag, not a blank until one's been explicitly
// chosen" reasoning as FloatingToolbar.vue's own identical computed.
const semanticValue = computed({
  get: () => (editor.current as any)?.semantic || 'div',
  set: (value: string) => {
    if (editor.current) (editor.current as any).semantic = value
  },
})
</script>
