<template>
  <div class="flex flex-1 min-h-0 flex-col md:flex-row">
    <div class="flex flex-col md:w-1/2 min-h-0 border-b md:border-b-0 md:border-r">
      <div class="px-3 py-1.5 text-[11px] font-semibold text-gray-500 border-b shrink-0">Markdown source <span class="font-normal text-gray-400">(paste it here)</span></div>
      <textarea
        :value="modelValue"
        class="flex-1 min-h-0 p-3 text-xs font-mono resize-none outline-none border-0"
        spellcheck="false"
        placeholder="# Title&#10;&#10;Paste or write Markdown..."
        @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
      ></textarea>
    </div>
    <div class="flex flex-col md:w-1/2 min-h-0">
      <div class="px-3 py-1.5 text-[11px] font-semibold text-gray-500 border-b shrink-0">Preview</div>
      <!-- the element's own classes: what is shown is how the element will look -->
      <div class="flex-1 min-h-0 overflow-y-auto p-3 text-sm" :class="previewClass" v-html="html"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Source editor of the Markdown element (ElementsClass.js's Markdown()): the element keeps the Markdown text; the
// preview here, the canvas and the preview mode show it as HTML. Sanitized like every other rich-text sink.
import { computed } from 'vue'
import { sanitizeRichText as safeHtml } from '@whoobe-cms/schema'
import { renderMarkdown } from '../scripts/field-transforms'

const props = defineProps<{ modelValue: string; previewClass?: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const html = computed(() => safeHtml(renderMarkdown(props.modelValue)))
</script>
