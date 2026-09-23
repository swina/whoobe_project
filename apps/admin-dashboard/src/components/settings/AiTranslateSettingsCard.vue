<template>
  <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-4">
    <div>
      <h3 class="text-xs font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider">AI Translation</h3>
      <p class="text-xs text-slate-500 mt-1">
        Configure a dedicated AI provider for the page editor's "Translate" action, or leave blank to use your AI Agent configuration.
        Translation has a different reliability profile than page/snippet generation on the same model - a model that's fine for one can return empty or malformed output for the other, so it's worth picking independently. Some free models known to translate well: Google's <code class="text-slate-300">gemini-2.0-flash</code> (Google provider, free tier via AI Studio), or via OpenRouter's free tier <code class="text-slate-300">qwen/qwen-2.5-72b-instruct:free</code> or <code class="text-slate-300">meta-llama/llama-3.3-70b-instruct:free</code> - free-tier models can be rate-limited or flaky, so if one keeps returning empty responses, try another before assuming translation itself is broken.
      </p>
    </div>

    <div v-if="usingFallback" class="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded-lg px-3 py-2">
      No translation-specific provider configured. Currently using the AI Agent settings ({{ existing?.provider ?? '—' }}) as fallback.
    </div>

    <div v-if="loading" class="text-xs text-slate-500 text-center py-4">Loading…</div>

    <form v-else @submit.prevent="save" class="grid grid-cols-2 gap-4">
      <label class="flex flex-col gap-1 text-xs text-slate-400">
        Provider
        <select v-model="form.provider" required
          class="px-3 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800">
          <option value="">— Leave empty (use AI Agent config) —</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="google">Google (Gemini)</option>
          <option value="zen">OpenCode Zen (opencode.ai)</option>
          <option value="openrouter">OpenRouter (openrouter.ai)</option>
          <option value="custom">Custom (OpenAI-compatible endpoint)</option>
        </select>
      </label>

      <label class="flex flex-col gap-1 text-xs text-slate-400">
        Model (translation)
        <input v-model="form.model" type="text" placeholder="gemini-2.0-flash, qwen/qwen-2.5-72b-instruct:free, deepseek-v4-flash-free…"
          class="px-3 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
      </label>

      <label v-if="showEndpoint" class="flex flex-col gap-1 text-xs text-slate-400 col-span-2">
        Endpoint (required for "Custom", optional otherwise — leave blank for the provider default)
        <input v-model="form.endpoint" type="text" placeholder="https://api.openai.com/v1, https://opencode.ai/zen/v1, https://openrouter.ai/api/v1 or http://localhost:1234/v1"
          class="px-3 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
      </label>

      <label class="flex flex-col gap-1 text-xs text-slate-400 col-span-2">
        API Key {{ existing?.hasApiKey ? '(leave blank to keep current)' : '(required for cloud providers)' }}
        <input v-model="form.apiKey" type="password" placeholder="••••••••"
          class="px-3 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
      </label>

      <div class="col-span-2 flex items-center gap-3 pt-2">
        <button type="submit" :disabled="saving" class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white">
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <span v-if="savedAt" class="text-xs text-emerald-400">Saved.</span>
        <span v-if="error" class="text-xs text-rose-400">{{ error }}</span>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useAuthStore } from '../../stores/authStore'
import { fetchAiTranslateSettings, saveAiTranslateSettings, type AiTranslateSettingsRecord } from '../../utils/ai-settings-api'

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-20250514',
  google: 'gemini-2.0-flash',
  zen: 'deepseek-v4-flash-free',
  openrouter: 'qwen/qwen-2.5-72b-instruct:free',
}

const authStore = useAuthStore()
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const savedAt = ref(false)
const existing = ref<AiTranslateSettingsRecord | null>(null)
const usingFallback = ref(false)

const form = reactive({
  provider: '',
  model: '',
  endpoint: '',
  apiKey: '',
})

const showEndpoint = computed(() => form.provider === 'zen' || form.provider === 'openrouter' || form.provider === 'google' || form.provider === 'custom')

watch(
  () => form.provider,
  (provider) => {
    const suggested = DEFAULT_MODELS[provider]
    if (suggested && form.model === '') {
      form.model = suggested
    }
  }
)

onMounted(async () => {
  try {
    const res = await fetchAiTranslateSettings(authStore.config.coreApiUrl)
    existing.value = res.settings
    usingFallback.value = res.usingFallback
    if (res.settings) {
      form.provider = res.settings.provider
      form.model = res.settings.model
      form.endpoint = res.settings.endpoint ?? ''
    }
  } catch (e: any) {
    error.value = e?.message || 'Failed to load AI translation settings'
  } finally {
    loading.value = false
  }
})

async function save() {
  saving.value = true
  error.value = ''
  savedAt.value = false
  try {
    const updated = await saveAiTranslateSettings(authStore.config.coreApiUrl, {
      provider: form.provider,
      model: form.model,
      endpoint: form.endpoint.trim() || null,
      apiKey: form.apiKey || undefined,
    })
    existing.value = updated
    usingFallback.value = false
    form.apiKey = ''
    savedAt.value = true
  } catch (e: any) {
    error.value = e?.message || 'Failed to save AI translation settings'
  } finally {
    saving.value = false
  }
}
</script>
