<template>
  <div class="flex flex-col gap-0.5">
    <span class="text-[10px] uppercase tracking-wide text-gray-400 font-semibold capitalize">{{ title }}</span>
    <select class="text-xs border rounded px-1.5 py-1 bg-white" :value="currentValue" @change="onChange">
      <option value=""></option>
      <option v-for="opt in options" :key="opt" :value="opt">{{ labelFor(attr, opt) }}</option>
    </select>
  </div>
</template>

<script setup lang="ts">
// Port of whoobe-one-studio's tailwind.options.vue (and, since the two
// turned out functionally identical - see tailwind-control.ts's header -
// tailwind.width.vue/tailwind.height.vue too).
import { computed } from 'vue'
import { useEditorStore } from '../../store/editor'
import { optionsFor, currentValueFor, applyValue, labelFor } from '../../scripts/tailwind-control'

const props = defineProps<{ attr: string; title?: string }>()
const editor = useEditorStore()

const options = optionsFor(props.attr)
const currentValue = computed(() => currentValueFor(editor, props.attr))

function onChange(e: Event) {
  applyValue(editor, props.attr, (e.target as HTMLSelectElement).value)
}
</script>
