<template>
  <div class="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center" @mousedown.self="$emit('close')">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col overflow-hidden">
      <div class="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <span class="text-xs font-semibold text-gray-600">Translate Page</span>
        <button class="text-xs text-gray-400 hover:text-gray-700" @click="$emit('close')"><X class="w-4 h-4" /></button>
      </div>
      <form @submit.prevent="translate" class="p-3 space-y-3">
        <div class="text-[10px] text-gray-400">
          Creates a new draft page in the target language, in the same page group as "{{ pageTitle || 'this page' }}" (currently <span class="font-medium">{{ currentLocale }}</span>). The draft is unpublished - review and publish it yourself once translated.
        </div>
        <div v-if="info" class="inline-flex items-center gap-1.5 text-[10px] text-gray-500 bg-gray-100 rounded px-2 py-1">
          <Sparkles class="w-3 h-3 text-indigo-500" />
          <template v-if="info.hasApiKey">
            Provider: <span class="font-medium">{{ providerLabel(info.provider) }}</span>
            <span class="text-gray-300">·</span>
            Model: <span class="font-medium">{{ info.model }}</span>
            <span v-if="info.usingFallback" class="text-gray-400">(from AI Agent - set a dedicated one in Settings → AI Translation)</span>
          </template>
          <span v-else class="text-amber-600">Not configured yet — save a provider, model and API key in Settings → AI Translation (or Settings → AI)</span>
        </div>
        <div v-if="info?.hasApiKey" class="text-[10px] text-gray-400">
          If translation keeps coming back empty, that model may be struggling with the task - try a different one in Settings → AI Translation.
        </div>
        <div>
          <label class="block text-[10px] text-gray-500 mb-1">Target locale (BCP-47 code)</label>
          <input
            v-model="locale"
            required
            placeholder="e.g. it, fr, de, es, pt"
            class="w-full text-xs border rounded-lg px-3 py-2 text-gray-700 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div v-if="error" class="text-xs text-rose-600">{{ error }}</div>
        <div class="flex items-center justify-between">
          <span v-if="translating" class="text-xs text-gray-400 inline-flex items-center gap-2">
            <Loader2 class="w-3.5 h-3.5 animate-spin" /> Translating…
          </span>
          <div v-else class="flex items-center gap-2 ml-auto">
            <button type="button" class="text-xs px-3 py-1.5 rounded border text-gray-500 hover:bg-gray-50" @click="$emit('close')">Cancel</button>
            <button type="submit" class="text-xs px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50" :disabled="!locale.trim()">Translate</button>
          </div>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { X, Loader2, Sparkles } from '@lucide/vue'
import { fetchAiTranslateInfo, type AiTranslateInfo } from '../ai-api'
import { translatePage, type WhoobeOnePage } from '../pages-api'

const props = defineProps<{
  pageId: string
  pageTitle?: string | null
  currentLocale: string
}>()

const emit = defineEmits<{ close: []; translated: [page: WhoobeOnePage] }>()

const locale = ref('')
const translating = ref(false)
const error = ref('')
const info = ref<AiTranslateInfo | null>(null)

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
  info.value = await fetchAiTranslateInfo()
})

async function translate() {
  const target = locale.value.trim()
  if (!target || translating.value) return
  if (target === props.currentLocale) {
    error.value = `Page is already in locale "${target}"`
    return
  }
  translating.value = true
  error.value = ''
  try {
    const page = await translatePage(props.pageId, target)
    emit('translated', page)
  } catch (e: any) {
    error.value = e?.message || 'Translation failed'
  } finally {
    translating.value = false
  }
}
</script>
