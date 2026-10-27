<template>
  <div v-if="text" role="status" aria-live="polite" data-testid="ai-usage-toast"
    class="fixed bottom-4 right-4 z-[100001] max-w-sm flex items-start gap-2 px-3 py-2 rounded-lg shadow-lg text-xs bg-white border border-gray-200 text-gray-700">
    <span><strong class="font-semibold">AI:</strong> {{ text }}</span>
    <button type="button" class="text-gray-400 hover:text-gray-700" aria-label="Close" @click="text = ''">×</button>
  </div>
</template>

<script setup lang="ts">
// What the last AI request consumed, shown to the person who made it (docs/plans/ai/ai-usage-plan.md). Fed by aiFetch().
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { AI_USAGE_EVENT, formatAiUsage, type AiUsage } from '../ai-usage'

const text = ref('')
let timer: ReturnType<typeof setTimeout> | undefined

function show(e: Event) {
  text.value = formatAiUsage((e as CustomEvent<AiUsage>).detail)
  clearTimeout(timer)
  timer = setTimeout(() => { text.value = '' }, 10_000)
}

onMounted(() => window.addEventListener(AI_USAGE_EVENT, show))
onBeforeUnmount(() => { window.removeEventListener(AI_USAGE_EVENT, show); clearTimeout(timer) })
</script>
