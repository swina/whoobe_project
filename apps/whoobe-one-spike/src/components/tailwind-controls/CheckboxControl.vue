<template>
  <label class="flex items-center gap-1.5 text-xs text-gray-600 capitalize">
    <input type="checkbox" :checked="!!currentValue" @change="onChange" />
    {{ title }}
  </label>
</template>

<script setup lang="ts">
// Port of whoobe-one-studio's tailwind.checkbox.vue - applies
// tw.classes.js's options[0] for this attr when checked (e.g. `mauto` ->
// `m-auto`, a single-entry list), clears it when unchecked.
import { computed } from 'vue'
import { useEditorStore } from '../../store/editor'
import { optionsFor, currentValueFor, applyValue } from '../../scripts/tailwind-control'

const props = defineProps<{ attr: string; title?: string }>()
const editor = useEditorStore()

const options = optionsFor(props.attr)
const currentValue = computed(() => currentValueFor(editor, props.attr))

function onChange(e: Event) {
  applyValue(editor, props.attr, (e.target as HTMLInputElement).checked ? options[0] : '')
}
</script>
