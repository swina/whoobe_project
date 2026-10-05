<template>
  <div class="fixed inset-0 bg-slate-950/80 light:bg-white/80 backdrop-blur-sm flex items-center justify-center p-4 z-50" @click.self="$emit('close')">
    <div class="bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden">
      <div class="flex items-center justify-between px-4 py-3 border-b border-slate-800 light:border-slate-200">
        <span class="text-sm font-semibold text-slate-100 light:text-slate-900 truncate">{{ title }}</span>
        <button class="text-slate-400 light:text-slate-600 hover:text-slate-200 light:hover:text-slate-800 transition text-sm" title="Close (Esc)" @click="$emit('close')">✕</button>
      </div>
      <div class="p-4 bg-slate-950/40 light:bg-slate-50">
        <!-- w-auto + max-h: a portrait (mobile) thumbnail must fit the screen instead of running off the bottom -->
        <img :src="src" :alt="title" class="mx-auto block w-auto max-w-full max-h-[75vh] rounded-lg border border-slate-800 light:border-slate-200 bg-white" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Enlarged view of a page/snippet's captured thumbnail (Pages list column and
// Snippets list/grid) - the stored image is 640px wide (desktop) or a 2x device screen (Tablet/Mobile capture), fitted to the screen.
import { onMounted, onUnmounted } from 'vue'

defineProps<{ src: string; title: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>
