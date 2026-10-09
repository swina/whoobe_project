<template>
  <BaseModal :open="true" size="xl" @close="$emit('close')">
    <template #header>
      <h2 class="ui-modal-title flex items-center gap-2">{{ title }}</h2>
    </template>
    <div class="space-y-4">
        <div class="p-4 bg-slate-950/40 light:bg-slate-50">
        <!-- w-auto + max-h: a portrait (mobile) thumbnail must fit the screen instead of running off the bottom -->
        <img :src="src" :alt="title" class="mx-auto block w-auto max-w-full max-h-[75vh] rounded-lg border border-slate-800 light:border-slate-200 bg-white" />
      </div>

    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import BaseModal from '../ui/BaseModal.vue'
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
