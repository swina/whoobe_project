<template>
  <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-4">
    <div>
      <h3 class="text-xs font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider">Figma Integration</h3>
      <p class="text-xs text-slate-500 mt-1">
        Personal Access Token for the Figma REST API. Used by the Whoobe One editor to import frames as pages or snippets.
        <a href="https://www.figma.com/developers/api#access-tokens" target="_blank" class="text-indigo-400 hover:text-indigo-300 underline">Get your token</a>.
      </p>
    </div>

    <div v-if="loading" class="text-xs text-slate-500 text-center py-4">Loading...</div>

    <form v-else @submit.prevent="save" class="grid grid-cols-2 gap-4">
      <label class="flex flex-col gap-1 text-xs text-slate-400 col-span-2">
        Access Token
        <input
          v-model="form.accessToken"
          type="password"
          :placeholder="hasToken ? 'Leave blank to keep current' : 'figd_…'"
          class="w-full bg-slate-800 light:bg-white border border-slate-600 light:border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 font-mono"
        />
        <span v-if="hasToken" class="text-[10px] text-slate-500">A token is currently configured. Leave blank to keep it unchanged.</span>
      </label>

      <label class="flex flex-col gap-1 text-xs text-slate-400 col-span-2">
        Team ID (optional)
        <input
          v-model="form.teamId"
          placeholder="e.g. 1234567"
          class="w-full bg-slate-800 light:bg-white border border-slate-600 light:border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 font-mono"
        />
      </label>

      <div class="col-span-2 flex items-center gap-3 pt-2">
        <button type="submit" :disabled="saving" class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50">
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
        <span v-if="savedAt" class="text-xs text-emerald-400">Saved.</span>
        <span v-if="error" class="text-xs text-rose-400">{{ error }}</span>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useAuthStore } from '../../stores/authStore'
import { fetchFigmaSettings, saveFigmaSettings } from '../../utils/figma-settings-api'

const authStore = useAuthStore()
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const savedAt = ref(false)
const hasToken = ref(false)

const form = reactive({
  accessToken: '',
  teamId: '',
})

onMounted(async () => {
  try {
    const settings = await fetchFigmaSettings(authStore.config.coreApiUrl)
    if (settings) {
      hasToken.value = settings.hasToken
      form.teamId = settings.teamId || ''
    }
  } catch (e: any) {
    error.value = e?.message || 'Failed to load Figma settings'
  } finally {
    loading.value = false
  }
})

async function save() {
  saving.value = true
  error.value = ''
  savedAt.value = false
  try {
    const updated = await saveFigmaSettings(authStore.config.coreApiUrl, {
      accessToken: form.accessToken || undefined,
      teamId: form.teamId || null,
    })
    hasToken.value = updated.hasToken
    form.accessToken = ''
    savedAt.value = true
  } catch (e: any) {
    error.value = e?.message || 'Failed to save Figma settings'
  } finally {
    saving.value = false
  }
}
</script>