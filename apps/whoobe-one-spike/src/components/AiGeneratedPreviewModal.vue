<template>
  <div class="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center p-6" @click.self="$emit('close')">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden">
      <div class="flex items-center gap-2 px-3 py-2 border-b shrink-0">
        <span
          class="text-[9px] px-1 py-0.5 rounded font-semibold uppercase tracking-wide"
          :class="record.kind === 'page' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'"
        >
          {{ record.kind }}
        </span>
        <span class="text-xs font-mono text-gray-400">{{ record.provider }} · {{ record.model }}</span>
        <div class="flex-1"></div>
        <button type="button" class="text-gray-400 hover:text-gray-700" title="Close" @click="$emit('close')">
          <X class="w-4 h-4" />
        </button>
      </div>
      <p class="px-3 py-2 text-xs text-gray-600 border-b shrink-0 line-clamp-2">{{ record.prompt }}</p>
      <div class="flex-1 min-h-0 overflow-auto bg-gray-100">
        <BlockContainerPreview v-if="tree" :doc="tree" />
      </div>
      <div class="flex items-center gap-2 px-3 py-2 border-t shrink-0">
        <span class="text-xs text-gray-400">Imports into the currently selected element (or the page root if none).</span>
        <div class="flex-1"></div>
        <button type="button" class="text-xs px-3 py-1.5 rounded border text-gray-600 hover:bg-gray-50" @click="$emit('close')">
          Close
        </button>
        <button
          type="button"
          class="text-xs px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700"
          title="Insert this content into the current element"
          @click="emit('import', record)"
        >
          <Download class="w-3 h-3 inline-block mr-1" />Import into current element
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { X, Download } from '@lucide/vue'
import type { AiGeneratedRecord } from '../ai-api'
import BlockContainerPreview from './preview/BlockContainerPreview.vue'
import type Element from '../scripts/ElementsClass.js'
import { normalizeGeneratedTree, applyImagePlaceholder } from '../helpers'

// Not a port - the source app has no equivalent (AI generation didn't exist
// there at all). Read-only preview of a whoobe_ai_generated payload: the
// same renderer DocumentPreview uses (BlockContainerPreview), fed a deep
// clone normalized exactly like an import would (so legacy payloads with
// builder-name types / missing element / invented image URLs preview
// correctly). The Import button re-emits the record so the parent can
// insert it into the current element.

const props = defineProps<{ record: AiGeneratedRecord }>()
const emit = defineEmits<{ close: []; import: [record: AiGeneratedRecord] }>()

const tree = computed(() => {
  const clone = JSON.parse(JSON.stringify(props.record.payload))
  const normalized = normalizeGeneratedTree(clone) as InstanceType<typeof Element>
  applyImagePlaceholder(normalized)
  return normalized
})
</script>
