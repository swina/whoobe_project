<template>
  <div class="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center p-4" @click.self="$emit('close')">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl flex flex-col overflow-hidden">
      <div class="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <span class="text-xs font-semibold text-gray-700 truncate">{{ title }}</span>
        <div class="flex items-center gap-3 shrink-0">
          <slot name="actions" />
          <button class="flex items-center gap-1 text-gray-400 hover:text-gray-700 text-xs" @click="$emit('close')"><X class="w-3.5 h-3.5" /> Close</button>
        </div>
      </div>
      <div class="p-3 bg-gray-50">
        <img :src="src" :alt="title" class="w-full rounded border border-gray-200 bg-white" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Enlarged view of a snippet's captured thumbnail in the editor's Snippets
// panel - the editor-side counterpart of admin-dashboard's own
// components/common/ThumbnailModal.vue (separate app, so a separate copy,
// styled like this app's other light overlays). The optional `actions` slot
// lets the caller put e.g. an "Insert" button in the header.
import { onMounted, onUnmounted } from 'vue'
import { X } from '@lucide/vue'

defineProps<{ src: string; title: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>
