<template>
  <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-4" data-testid="upload-settings">
    <div>
      <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider text-xs">Form uploads</h3>
      <p class="text-xs text-slate-500">What visitors may send through the Upload field of a form: per website. Files go to a private folder of the asset library, are checked on their content, and are renamed.</p>
    </div>

    <label class="flex flex-col gap-1 max-w-sm">
      <span class="text-xs text-slate-400">Website</span>
      <select v-model="websiteId" class="field" data-testid="upload-website" @change="load">
        <option value="">Select a website...</option>
        <option v-for="w in websites" :key="w.id" :value="w.id">{{ w.name }}</option>
      </select>
    </label>

    <div v-if="loading" class="text-xs text-slate-400">Loading...</div>
    <p v-if="error" class="text-xs text-rose-400" data-testid="upload-error">{{ error }}</p>

    <form v-if="form" class="space-y-4" @submit.prevent="save">
      <label class="flex items-center gap-2 cursor-pointer">
        <input v-model="form.enabled" type="checkbox" class="toggle" data-testid="upload-enabled" />
        <span class="text-xs text-slate-300 light:text-slate-700">Allow file uploads in this website's forms</span>
      </label>

      <fieldset :disabled="!form.enabled" class="space-y-4 disabled:opacity-50">
        <div class="space-y-1">
          <span class="text-xs text-slate-400">Allowed file types</span>
          <div class="flex flex-wrap gap-x-4 gap-y-1.5" data-testid="upload-extensions">
            <label v-for="ext in availableExtensions" :key="ext" class="flex items-center gap-1.5 text-xs text-slate-300 light:text-slate-700">
              <input type="checkbox" :checked="form.allowedExtensions.includes(ext)" :data-testid="`upload-ext-${ext}`" @change="toggleExt(ext, ($event.target as HTMLInputElement).checked)" />
              .{{ ext }}
            </label>
          </div>
          <p class="text-[11px] text-slate-500">Only types whose content can be verified are offered. Web pages, SVG, scripts and programs can never be allowed. The content of every file must match its type.</p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label class="flex flex-col gap-1">
            <span class="text-xs text-slate-400">Largest file (MB)</span>
            <input v-model.number="maxMb" type="number" min="0.1" :max="ceilingMb" step="0.1" class="field" data-testid="upload-max-mb" />
            <span class="text-[11px] text-slate-500">Up to {{ ceilingMb }} MB.</span>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-slate-400">Files per submission</span>
            <input v-model.number="form.maxFiles" type="number" min="1" :max="ceilings?.maxFiles" step="1" class="field" data-testid="upload-max-files" />
            <span class="text-[11px] text-slate-500">Up to {{ ceilings?.maxFiles }}.</span>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-slate-400">Daily total (MB)</span>
            <input v-model.number="dailyMb" type="number" min="1" :max="ceilingDailyMb" step="1" class="field" data-testid="upload-daily-mb" />
            <span class="text-[11px] text-slate-500">All forms of the website, per day. Up to {{ ceilingDailyMb }} MB.</span>
          </label>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label class="flex flex-col gap-1">
            <span class="text-xs text-slate-400">Default target folder (asset library)</span>
            <input v-model="form.targetFolder" class="field font-mono" placeholder="private/forms" data-testid="upload-folder" />
            <span class="text-[11px] text-slate-500">A form can use its own folder. Private (under <code>private/</code>) unless a public folder is allowed below.</span>
          </label>
          <label class="flex items-start gap-2 text-xs text-slate-300 light:text-slate-700 sm:mt-5">
            <input v-model="form.allowPublicFolder" type="checkbox" class="mt-0.5" data-testid="upload-allow-public" />
            <span>Allow a public folder as target <span class="block text-[11px] text-slate-500">Anyone with the link could then read the uploaded files. Leave off for CVs, documents and anything personal.</span></span>
          </label>
        </div>
        <p v-if="publicFolderChosen" class="text-xs text-amber-400 bg-amber-900/10 border border-amber-900/30 rounded p-2" data-testid="upload-public-warning">
          The target folder is public: uploaded files will be readable by anyone who knows their address.
        </p>
      </fieldset>

      <div class="flex items-center gap-3">
        <button type="submit" class="btn btn-primary" :disabled="saving" data-testid="upload-save">{{ saving ? 'Saving...' : 'Save' }}</button>
        <span v-if="savedAt" class="text-xs text-slate-500">Saved {{ savedAt }}</span>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { fetchWebsites } from '../../utils/websites-api'
import type { WebsiteRecord } from '../../utils/websites-api'
import { fetchUploadSettings, saveUploadSettings, type UploadSettings, type UploadSettingsResponse } from '../../utils/upload-settings-api'

const MB = 1024 * 1024
const authStore = useAuthStore()
const toastStore = useToastStore()

const websites = ref<WebsiteRecord[]>([])
const websiteId = ref('')
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const savedAt = ref('')
const form = ref<UploadSettings | null>(null)
const ceilings = ref<UploadSettingsResponse['ceilings'] | null>(null)
const availableExtensions = ref<string[]>([])

const ceilingMb = computed(() => Math.floor((ceilings.value?.maxFileBytes ?? 0) / MB))
const ceilingDailyMb = computed(() => Math.floor((ceilings.value?.dailyBytes ?? 0) / MB))
const maxMb = computed({
  get: () => (form.value ? Math.round((form.value.maxFileBytes / MB) * 10) / 10 : 0),
  set: (v: number) => { if (form.value) form.value.maxFileBytes = Math.round(v * MB) },
})
const dailyMb = computed({
  get: () => (form.value ? Math.round(form.value.dailyBytes / MB) : 0),
  set: (v: number) => { if (form.value) form.value.dailyBytes = Math.round(v * MB) },
})
const publicFolderChosen = computed(() => !!form.value && form.value.allowPublicFolder && !/^\/?private(\/|$)/i.test(form.value.targetFolder))

function toggleExt(ext: string, on: boolean) {
  if (!form.value) return
  const set = new Set(form.value.allowedExtensions)
  if (on) set.add(ext)
  else set.delete(ext)
  form.value.allowedExtensions = [...set].sort()
}

async function load() {
  form.value = null
  error.value = ''
  savedAt.value = ''
  if (!websiteId.value) return
  loading.value = true
  try {
    const r = await fetchUploadSettings(authStore.config.coreApiUrl, websiteId.value)
    form.value = { ...r.uploads }
    ceilings.value = r.ceilings
    availableExtensions.value = r.availableExtensions
  } catch (e: any) {
    error.value = e?.message || 'Failed to load the upload settings'
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!form.value || !websiteId.value) return
  saving.value = true
  error.value = ''
  try {
    form.value = { ...(await saveUploadSettings(authStore.config.coreApiUrl, websiteId.value, form.value)) }
    savedAt.value = new Date().toLocaleTimeString()
    toastStore.show('Upload settings saved')
  } catch (e: any) {
    error.value = e?.message || 'Failed to save the upload settings'
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    websites.value = await fetchWebsites(authStore.config.coreApiUrl)
    if (websites.value.length === 1) { websiteId.value = websites.value[0].id; await load() }
  } catch (e: any) {
    error.value = e?.message || 'Failed to load the websites'
  }
})
</script>
