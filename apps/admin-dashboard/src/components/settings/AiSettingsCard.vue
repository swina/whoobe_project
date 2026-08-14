<template>
  <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-4">
    <div>
      <h3 class="text-xs font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider">AI Agent</h3>
      <p class="text-xs text-slate-500 mt-1">
        LLM provider used by the "AI Generate Snippet / Page" buttons in the Whoobe One composer (docs/plans/ai/ai-pages-snippets-generator.md). One global config, applied to every site. The API key is stored server-side only and is never sent back to this form.
      </p>
    </div>

    <div v-if="loading" class="text-xs text-slate-500 text-center py-4">Loading…</div>

    <form v-else @submit.prevent="save" class="grid grid-cols-2 gap-4">
      <label class="flex flex-col gap-1 text-xs text-slate-400">
        Provider
        <select v-model="form.provider" required
          class="px-3 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800">
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="google">Google (Gemini)</option>
          <option value="zen">OpenCode Zen (opencode.ai)</option>
          <option value="openrouter">OpenRouter (openrouter.ai)</option>
          <option value="custom">Custom (OpenAI-compatible endpoint)</option>
        </select>
      </label>

      <label class="flex flex-col gap-1 text-xs text-slate-400">
        Model (AI agent)
        <input v-model="form.model" type="text" required placeholder="gpt-4o-mini, claude-sonnet-4-20250514, gemini-2.0-flash, deepseek-v4-flash-free, deepseek/deepseek-chat…"
          class="px-3 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
      </label>

      <label class="flex flex-col gap-1 text-xs text-slate-400 col-span-2">
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
import { onMounted, reactive, ref, watch } from 'vue'
import { useAuthStore } from '../../stores/authStore'
import { fetchAiSettings, saveAiSettings, type AiSettingsRecord } from '../../utils/ai-settings-api'

const DEFAULT_MODELS: Record<string, string> = {
  zen: 'deepseek-v4-flash-free',
  openrouter: 'deepseek/deepseek-chat',
}
const INITIAL_MODEL = 'gpt-4o-mini'

const authStore = useAuthStore()
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const savedAt = ref(false)
const existing = ref<AiSettingsRecord | null>(null)

const form = reactive({
  provider: 'openai',
  model: INITIAL_MODEL,
  endpoint: '',
  apiKey: '',
})

watch(
  () => form.provider,
  (provider) => {
    const suggested = DEFAULT_MODELS[provider]
    if (suggested && (form.model === INITIAL_MODEL || form.model === '')) {
      form.model = suggested
    }
  }
)

onMounted(async () => {
  try {
    const settings = await fetchAiSettings(authStore.config.coreApiUrl)
    existing.value = settings
    if (settings) {
      form.provider = settings.provider
      form.model = settings.model
      form.endpoint = settings.endpoint ?? ''
    }
  } catch (e: any) {
    error.value = e?.message || 'Failed to load AI settings'
  } finally {
    loading.value = false
  }
})

async function save() {
  saving.value = true
  error.value = ''
  savedAt.value = false
  try {
    const updated = await saveAiSettings(authStore.config.coreApiUrl, {
      provider: form.provider,
      model: form.model,
      endpoint: form.endpoint.trim() || null,
      // Blank means "leave as-is" - the server never received the real key
      // back to resubmit, so an empty field must not be sent as an intent
      // to clear it.
      apiKey: form.apiKey || undefined,
    })
    existing.value = updated
    form.apiKey = ''
    savedAt.value = true
  } catch (e: any) {
    error.value = e?.message || 'Failed to save AI settings'
  } finally {
    saving.value = false
  }
}
</script>