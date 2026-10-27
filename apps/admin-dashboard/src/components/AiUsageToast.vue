<template>
  <div v-if="text" role="status" aria-live="polite" data-testid="ai-usage-toast"
    class="fixed bottom-4 right-4 z-[10001] max-w-sm flex items-start gap-2 px-3 py-2 rounded-lg shadow-lg text-xs bg-slate-800 light:bg-white border border-slate-700 light:border-slate-200 text-slate-200 light:text-slate-700">
    <span><strong class="font-semibold">AI:</strong> {{ text }}</span>
    <button type="button" class="text-slate-400 hover:text-slate-200 light:hover:text-slate-900" aria-label="Close" @click="text = ''">×</button>
  </div>
</template>

<script setup lang="ts">
// What the last AI request consumed, shown to the person who made it (docs/plans/ai/ai-usage-plan.md). Fed by aiFetch().
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { AI_USAGE_EVENT, formatAiUsage, type AiUsage } from '../utils/ai-usage-api'

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
