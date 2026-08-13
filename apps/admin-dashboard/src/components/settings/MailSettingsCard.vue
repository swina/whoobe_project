<template>
  <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-4">
    <div>
      <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider text-xs">Outgoing Mail</h3>
      <p class="text-xs text-slate-500 mt-1">
        SMTP config used for Form notification emails (docs/plans/forms/cms-forms.md). One global config, applied to every site.
      </p>
    </div>

    <div v-if="loading" class="text-xs text-slate-500 text-center py-4">Loading…</div>

    <form v-else @submit.prevent="save" class="grid grid-cols-2 gap-4">
      <label class="col-span-2 flex flex-col gap-1 text-xs text-slate-400">
        Host
        <input v-model="form.host" type="text" required placeholder="smtp.example.com" class="px-3 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
      </label>

      <label class="flex flex-col gap-1 text-xs text-slate-400">
        Port
        <input v-model.number="form.port" type="number" required placeholder="587" class="px-3 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
      </label>

      <label class="flex items-center gap-2 text-xs text-slate-400 self-end pb-2">
        <input v-model="form.secure" type="checkbox" class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 light:bg-slate-50 border-slate-800 light:border-slate-200" />
        Use TLS (secure)
      </label>

      <label class="flex flex-col gap-1 text-xs text-slate-400">
        User (optional)
        <input v-model="form.user" type="text" placeholder="smtp username" class="px-3 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
      </label>

      <label class="flex flex-col gap-1 text-xs text-slate-400">
        Password {{ existing?.hasPassword ? '(leave blank to keep current)' : '(optional)' }}
        <input v-model="form.password" type="password" placeholder="••••••••" class="px-3 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
      </label>

      <label class="flex flex-col gap-1 text-xs text-slate-400">
        From address
        <input v-model="form.fromAddress" type="email" required placeholder="no-reply@example.com" class="px-3 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
      </label>

      <label class="flex flex-col gap-1 text-xs text-slate-400">
        From name (optional)
        <input v-model="form.fromName" type="text" placeholder="Whoobe CMS" class="px-3 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
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
import { onMounted, reactive, ref } from 'vue'
import { getDefaultCoreApiUrl } from '../../utils/auth-api'
import { fetchMailSettings, saveMailSettings, type MailSettingsRecord } from '../../utils/mail-settings-api'

const loading = ref(true)
const saving = ref(false)
const error = ref('')
const savedAt = ref(false)
const existing = ref<MailSettingsRecord | null>(null)

const form = reactive({
  host: '',
  port: 587,
  secure: false,
  user: '',
  password: '',
  fromAddress: '',
  fromName: '',
})

onMounted(async () => {
  try {
    const settings = await fetchMailSettings(getDefaultCoreApiUrl())
    existing.value = settings
    if (settings) {
      form.host = settings.host
      form.port = settings.port
      form.secure = settings.secure
      form.user = settings.user ?? ''
      form.fromAddress = settings.fromAddress
      form.fromName = settings.fromName ?? ''
    }
  } catch (e: any) {
    error.value = e?.message || 'Failed to load mail settings'
  } finally {
    loading.value = false
  }
})

async function save() {
  saving.value = true
  error.value = ''
  savedAt.value = false
  try {
    const updated = await saveMailSettings(getDefaultCoreApiUrl(), {
      host: form.host,
      port: form.port,
      secure: form.secure,
      user: form.user || null,
      // Blank means "leave as-is" - the server never received the real
      // password back to resubmit, so an empty field must not be sent as
      // an intent to clear it.
      password: form.password || undefined,
      fromAddress: form.fromAddress,
      fromName: form.fromName || null,
    })
    existing.value = updated
    form.password = ''
    savedAt.value = true
  } catch (e: any) {
    error.value = e?.message || 'Failed to save mail settings'
  } finally {
    saving.value = false
  }
}
</script>
