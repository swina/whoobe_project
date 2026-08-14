<template>
  <div class="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center" @click.self="$emit('close')">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-xl flex flex-col overflow-hidden">
      <div class="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <span class="text-xs font-semibold text-gray-600">AI Generate {{ kind === 'snippet' ? 'Snippet' : 'Page' }}</span>
        <button class="text-xs text-gray-400 hover:text-gray-700" @click="$emit('close')"><X class="w-4 h-4" /></button>
      </div>
      <form @submit.prevent="generate" class="p-3 space-y-3">
        <div class="text-[10px] text-gray-400">
          Describe the {{ kind === 'snippet' ? 'snippet' : 'page' }} to generate. The AI agent is configured in the admin dashboard (Settings → AI).
        </div>
        <div v-if="info" class="inline-flex items-center gap-1.5 text-[10px] text-gray-500 bg-gray-100 rounded px-2 py-1">
          <Sparkles class="w-3 h-3 text-indigo-500" />
          <template v-if="info.hasApiKey">
            Provider: <span class="font-medium">{{ providerLabel(info.provider) }}</span>
            <span class="text-gray-300">·</span>
            Model: <span class="font-medium">{{ info.model }}</span>
          </template>
          <span v-else class="text-amber-600">Not configured yet — save provider, model and API key in Settings → AI</span>
        </div>
        <textarea
          v-model="prompt"
          rows="4"
          required
          :placeholder="kind === 'snippet' ? 'e.g. A hero section with a heading, subtitle and two call-to-action buttons…' : 'e.g. A landing page for a fictional coffee roastery, with header, hero, product grid, testimonials and footer…'"
          class="w-full text-xs border rounded-lg px-3 py-2 text-gray-700 focus:outline-none focus:border-indigo-500"
        />
        <div v-if="error" class="text-xs text-rose-600">{{ error }}</div>
        <div class="flex items-center justify-between">
          <span v-if="generating" class="text-xs text-gray-400 inline-flex items-center gap-2">
            <Loader2 class="w-3.5 h-3.5 animate-spin" /> Generating…
          </span>
          <div v-else class="flex items-center gap-2 ml-auto">
            <button type="button" class="text-xs px-3 py-1.5 rounded border text-gray-500 hover:bg-gray-50" @click="$emit('close')">Cancel</button>
            <button type="submit" class="text-xs px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50" :disabled="!prompt.trim()">Generate</button>
          </div>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { X, Loader2, Sparkles } from '@lucide/vue'
import { generateAi, fetchAiInfo, AiApiError, type AiGenerateContext, type AiInfo } from '../ai-api'

const props = defineProps<{
  kind: 'snippet' | 'page'
  context?: AiGenerateContext
}>()

const emit = defineEmits<{ close: []; generated: [payload: unknown] }>()

const prompt = ref('')
const generating = ref(false)
const error = ref('')
const info = ref<AiInfo | null>(null)

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
  google: 'Google (Gemini)',
  zen: 'OpenCode Zen',
  openrouter: 'OpenRouter',
  custom: 'Custom',
}

function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider
}

onMounted(async () => {
  info.value = await fetchAiInfo()
})

async function generate() {
  if (!prompt.value.trim() || generating.value) return
  generating.value = true
  error.value = ''
  try {
    const payload = await generateAi(props.kind, prompt.value.trim(), props.context ?? {})
    emit('generated', payload)
  } catch (e: any) {
    if (e instanceof AiApiError && e.status === 401) {
      error.value = 'Not authenticated — log into the admin dashboard in this browser first, then try again.'
    } else {
      error.value = e?.message || 'AI generation failed'
    }
  } finally {
    generating.value = false
  }
}
</script>