<template>
  <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-4">
    <div v-if="loading" class="text-xs text-slate-400">Loading PWA configuration...</div>

    <template v-else>
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider text-xs">PWA / Mobile App</h3>
          <p class="text-xs text-slate-500">Configure Progressive Web App settings for your websites.</p>
        </div>
        <label class="flex items-center gap-2 cursor-pointer">
          <span class="text-xs text-slate-400">Enabled</span>
          <input type="checkbox" v-model="enabled" class="toggle" />
        </label>
      </div>

      <form v-if="enabled" @submit.prevent="save" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <label class="flex flex-col gap-1">
            <span class="text-xs text-slate-400">App Name (short)</span>
            <input v-model="config.shortName" class="bg-slate-800 light:bg-white border border-slate-700 light:border-slate-300 rounded px-3 py-2 text-xs text-slate-200 light:text-slate-800" placeholder="MyApp" maxlength="12" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-slate-400">Website</span>
            <select v-model="selectedWebsiteId" class="bg-slate-800 light:bg-white border border-slate-700 light:border-slate-300 rounded px-3 py-2 text-xs text-slate-200 light:text-slate-800">
              <option value="">Select a website...</option>
              <option v-for="w in websites" :key="w.id" :value="w.id">{{ w.name }}</option>
            </select>
          </label>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <label class="flex flex-col gap-1">
            <span class="text-xs text-slate-400">Display Mode</span>
            <select v-model="config.display" class="bg-slate-800 light:bg-white border border-slate-700 light:border-slate-300 rounded px-3 py-2 text-xs text-slate-200 light:text-slate-800">
              <option value="standalone">Standalone</option>
              <option value="fullscreen">Fullscreen</option>
              <option value="minimal-ui">Minimal UI</option>
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-slate-400">Orientation</span>
            <select v-model="config.orientation" class="bg-slate-800 light:bg-white border border-slate-700 light:border-slate-300 rounded px-3 py-2 text-xs text-slate-200 light:text-slate-800">
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
              <option value="any">Any</option>
            </select>
          </label>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <label class="flex flex-col gap-1">
            <span class="text-xs text-slate-400">Background Color</span>
            <div class="flex gap-2">
              <input v-model="config.backgroundColor" type="color" class="w-10 h-10 rounded cursor-pointer border border-slate-700" />
              <input v-model="config.backgroundColor" class="flex-1 bg-slate-800 light:bg-white border border-slate-700 light:border-slate-300 rounded px-3 py-2 text-xs font-mono text-slate-200 light:text-slate-800" />
            </div>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-slate-400">Theme Color</span>
            <div class="flex gap-2">
              <input v-model="config.themeColor" type="color" class="w-10 h-10 rounded cursor-pointer border border-slate-700" />
              <input v-model="config.themeColor" class="flex-1 bg-slate-800 light:bg-white border border-slate-700 light:border-slate-300 rounded px-3 py-2 text-xs font-mono text-slate-200 light:text-slate-800" />
            </div>
          </label>
        </div>

        <fieldset class="border border-slate-700 light:border-slate-300 rounded p-4 space-y-3">
          <legend class="text-xs font-semibold text-slate-400 px-1">Push Notifications Provider</legend>
          <div class="flex gap-4">
            <label class="flex items-center gap-2">
              <input type="radio" v-model="pushProvider" value="self" />
              <span class="text-xs text-slate-300">Self-hosted (VAPID)</span>
            </label>
            <label class="flex items-center gap-2">
              <input type="radio" v-model="pushProvider" value="onesignal" />
              <span class="text-xs text-slate-300">OneSignal</span>
            </label>
            <label class="flex items-center gap-2">
              <input type="radio" v-model="pushProvider" value="firebase" />
              <span class="text-xs text-slate-300">Firebase</span>
            </label>
          </div>

          <template v-if="pushProvider === 'self'">
            <div class="text-xs text-slate-500">VAPID keys are auto-generated on save. The public key is included in the PWA manifest.</div>
          </template>

          <template v-if="pushProvider === 'onesignal'">
            <label class="flex flex-col gap-1">
              <span class="text-xs text-slate-400">OneSignal App ID</span>
              <input v-model="onesignalAppId" class="bg-slate-800 light:bg-white border border-slate-700 light:border-slate-300 rounded px-3 py-2 text-xs font-mono text-slate-200 light:text-slate-800" placeholder="..." />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-xs text-slate-400">REST API Key</span>
              <input v-model="onesignalApiKey" type="password" class="bg-slate-800 light:bg-white border border-slate-700 light:border-slate-300 rounded px-3 py-2 text-xs font-mono text-slate-200 light:text-slate-800" placeholder="..." />
            </label>
          </template>

          <template v-if="pushProvider === 'firebase'">
            <div class="grid grid-cols-2 gap-3">
              <label class="flex flex-col gap-1">
                <span class="text-xs text-slate-400">Project ID</span>
                <input v-model="firebaseProjectId" class="bg-slate-800 light:bg-white border border-slate-700 light:border-slate-300 rounded px-3 py-2 text-xs font-mono" />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-xs text-slate-400">Web API Key</span>
                <input v-model="firebaseApiKey" class="bg-slate-800 light:bg-white border border-slate-700 light:border-slate-300 rounded px-3 py-2 text-xs font-mono" />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-xs text-slate-400">Sender ID</span>
                <input v-model="firebaseSenderId" class="bg-slate-800 light:bg-white border border-slate-700 light:border-slate-300 rounded px-3 py-2 text-xs font-mono" />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-xs text-slate-400">App ID</span>
                <input v-model="firebaseAppId" class="bg-slate-800 light:bg-white border border-slate-700 light:border-slate-300 rounded px-3 py-2 text-xs font-mono" />
              </label>
            </div>
            <label class="flex flex-col gap-1">
              <span class="text-xs text-slate-400">Service Account JSON</span>
              <textarea v-model="firebaseServiceAccount" class="bg-slate-800 light:bg-white border border-slate-700 light:border-slate-300 rounded px-3 py-2 text-xs font-mono text-slate-200 light:text-slate-800" rows="4" placeholder="Paste the service account JSON..."></textarea>
            </label>
          </template>
        </fieldset>

        <div class="flex items-center gap-3 pt-2">
          <button type="submit" :disabled="saving" class="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50">
            {{ saving ? 'Saving...' : 'Save PWA Configuration' }}
          </button>
          <span v-if="savedAt" class="text-xs text-emerald-400">Saved at {{ savedAt }}</span>
          <span v-if="error" class="text-xs text-rose-400">{{ error }}</span>
        </div>
      </form>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { fetchWebsites, fetchWebsiteById, updateWebsite } from '../../utils/websites-api'
import type { WebsiteRecord } from '../../utils/websites-api'

const authStore = useAuthStore()
const toastStore = useToastStore()

const loading = ref(true)
const saving = ref(false)
const savedAt = ref<string | null>(null)
const error = ref<string | null>(null)

const enabled = ref(false)
const selectedWebsiteId = ref('')
const websites = ref<WebsiteRecord[]>([])

const config = ref<Record<string, any>>({
  shortName: '',
  display: 'standalone',
  orientation: 'portrait',
  backgroundColor: '#ffffff',
  themeColor: '#4f46e5',
  startUrl: '/',
  push: { provider: 'self' },
})

const pushProvider = computed({
  get: () => (config.value.push as Record<string, any>)?.provider ?? 'self',
  set: (v) => {
    config.value.push = { ...(config.value.push as Record<string, any> ?? {}), provider: v }
  },
})

const onesignalAppId = computed({
  get: () => (config.value.push as Record<string, any>)?.onesignalAppId ?? '',
  set: (v) => { config.value.push = { ...(config.value.push ?? {}), onesignalAppId: v } },
})
const onesignalApiKey = computed({
  get: () => (config.value.push as Record<string, any>)?.onesignalApiKey ?? '',
  set: (v) => { config.value.push = { ...(config.value.push ?? {}), onesignalApiKey: v } },
})
const firebaseProjectId = computed({
  get: () => (config.value.push as Record<string, any>)?.firebaseProjectId ?? '',
  set: (v) => { config.value.push = { ...(config.value.push ?? {}), firebaseProjectId: v } },
})
const firebaseApiKey = computed({
  get: () => (config.value.push as Record<string, any>)?.firebaseApiKey ?? '',
  set: (v) => { config.value.push = { ...(config.value.push ?? {}), firebaseApiKey: v } },
})
const firebaseSenderId = computed({
  get: () => (config.value.push as Record<string, any>)?.firebaseSenderId ?? '',
  set: (v) => { config.value.push = { ...(config.value.push ?? {}), firebaseSenderId: v } },
})
const firebaseAppId = computed({
  get: () => (config.value.push as Record<string, any>)?.firebaseAppId ?? '',
  set: (v) => { config.value.push = { ...(config.value.push ?? {}), firebaseAppId: v } },
})
const firebaseServiceAccount = computed({
  get: () => (config.value.push as Record<string, any>)?.firebaseServiceAccount ?? '',
  set: (v) => { config.value.push = { ...(config.value.push ?? {}), firebaseServiceAccount: v } },
})

watch(selectedWebsiteId, async (id) => {
  if (!id) return
  try {
    const website = await fetchWebsiteById(authStore.config.coreApiUrl, id)
    enabled.value = (website as any).pwaEnabled ?? false
    config.value = { ...config.value, ...((website as any).pwaConfig ?? {}) }
  } catch { /* ignore */ }
})

onMounted(async () => {
  try {
    websites.value = await fetchWebsites(authStore.config.coreApiUrl)
  } catch { /* ignore */ }
  loading.value = false
})

async function save() {
  if (!selectedWebsiteId.value) {
    error.value = 'Please select a website first'
    return
  }
  saving.value = true
  error.value = null
  try {
    await updateWebsite(authStore.config.coreApiUrl, selectedWebsiteId.value, {
      pwaEnabled: enabled.value,
      pwaConfig: config.value,
    })
    savedAt.value = new Date().toLocaleTimeString()
    toastStore.show('PWA configuration saved')
  } catch (e: any) {
    error.value = e?.message || 'Failed to save'
  } finally {
    saving.value = false
  }
}
</script>