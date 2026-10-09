<template>
  <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-4">
    <div>
      <h3 class="text-xs font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider">AI Image Generation</h3>
      <p class="text-xs text-slate-500 mt-1">
        Configure a dedicated AI provider for image generation, or leave blank to use your text AI configuration.
      </p>
    </div>

    <div v-if="usingFallback" class="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded-lg px-3 py-2">
      No image-specific provider configured. Currently using the text AI agent settings ({{ existing?.provider ?? '—' }}) as fallback.
    </div>

    <div v-if="loading" class="text-xs text-slate-500 text-center py-4">Loading…</div>

    <form v-else @submit.prevent="save" class="grid grid-cols-2 gap-4">
      <label class="flex flex-col gap-1 text-xs text-slate-400">
        Provider
        <select v-model="form.provider" required
          class="field">
          <option value="">— Leave empty (use text AI config) —</option>
          <option value="openai">OpenAI</option>
          <option value="google">Google (Gemini)</option>
          <option value="openrouter">OpenRouter (openrouter.ai)</option>
          <option value="custom">Custom (OpenAI-compatible endpoint)</option>
        </select>
      </label>

      <label class="flex flex-col gap-1 text-xs text-slate-400">
        Model (image generation)
        <input v-model="form.model" type="text" placeholder="dall-e-3, gemini-2.5-flash-image, black-forest-labs/flux-schnell, flux-dev…"
          class="field" />
      </label>

      <label v-if="showEndpoint" class="flex flex-col gap-1 text-xs text-slate-400 col-span-2">
        Endpoint (required for "Custom", optional otherwise — leave blank for the provider default)
        <input v-model="form.endpoint" type="text" placeholder="https://api.openai.com/v1, https://generativelanguage.googleapis.com/v1beta, https://openrouter.ai/api/v1 or http://localhost:1234/v1"
          class="field" />
      </label>

      <label class="flex flex-col gap-1 text-xs text-slate-400 col-span-2">
        API Key {{ existing?.hasApiKey ? '(leave blank to keep current)' : '(required for cloud providers)' }}
        <input v-model="form.apiKey" type="password" placeholder="••••••••"
          class="field" />
      </label>

      <div class="col-span-2 flex items-center gap-3 pt-2">
        <button type="submit" :disabled="saving" class="btn btn-primary">
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
import { fetchAiImageSettings, saveAiImageSettings, type AiImageSettingsRecord } from '../../utils/ai-settings-api'

const DEFAULT_MODELS: Record<string, string> = {
  google: 'gemini-2.5-flash-image',
}

const authStore = useAuthStore()
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const savedAt = ref(false)
const existing = ref<AiImageSettingsRecord | null>(null)
const usingFallback = ref(false)

const form = reactive({
  provider: '',
  model: '',
  endpoint: '',
  apiKey: '',
})

const showEndpoint = computed(() => form.provider === 'openrouter' || form.provider === 'google' || form.provider === 'custom')

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
    const res = await fetchAiImageSettings(authStore.config.coreApiUrl)
    existing.value = res.settings
    usingFallback.value = res.usingFallback
    if (res.settings) {
      form.provider = res.settings.provider
      form.model = res.settings.model
      form.endpoint = res.settings.endpoint ?? ''
    }
  } catch (e: any) {
    error.value = e?.message || 'Failed to load AI image settings'
  } finally {
    loading.value = false
  }
})

async function save() {
  saving.value = true
  error.value = ''
  savedAt.value = false
  try {
    const updated = await saveAiImageSettings(authStore.config.coreApiUrl, {
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
    error.value = e?.message || 'Failed to save AI image settings'
  } finally {
    saving.value = false
  }
}
</script>