<template>
  <div class="flex flex-col gap-0.5">
    <span class="text-[10px] uppercase tracking-wide text-gray-400 font-semibold capitalize">
      {{ title }} <span class="text-gray-500 normal-case lowercase">{{ options[index].trim() || 'none' }}</span>
    </span>
    <input type="range" min="0" :max="options.length - 1" :value="index" @input="onInput" />
  </div>
</template>

<script setup lang="ts">
// Port of whoobe-one-studio's tailwind.range.vue - a slider over the
// index of tw.classes.js's option list for this attr (e.g. padding/
// margin/border/opacity/z-index), not over the raw pixel value directly.
import { computed } from 'vue'
import { useEditorStore } from '../../store/editor'
import { optionsFor, currentValueFor, applyValue } from '../../scripts/tailwind-control'

const props = defineProps<{ attr: string; title?: string }>()
const editor = useEditorStore()

const options = optionsFor(props.attr)
const index = computed(() => {
  const i = options.indexOf(currentValueFor(editor, props.attr))
  return i === -1 ? 0 : i
})

function onInput(e: Event) {
  const i = parseInt((e.target as HTMLInputElement).value, 10)
  applyValue(editor, props.attr, options[i])
}
</script>
