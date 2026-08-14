<template>
  <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-4">
    <div>
      <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider text-xs">Outgoing Mail</h3>
      <p class="text-xs text-slate-500 mt-1">
        SMTP config used for Form notification emails (docs/plans/forms/cms-forms.md). One global config, applied to every site.
      </p>
    </div>

    <div class="flex gap-1 border-b border-slate-800 light:border-slate-200">
      <button
        v-for="tab in tabs" :key="tab.key"
        type="button"
        class="px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition"
        :class="activeTab === tab.key ? 'border-indigo-500 text-indigo-300' : 'border-transparent text-slate-500 hover:text-slate-300 light:text-slate-700'"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-if="loading" class="text-xs text-slate-500 text-center py-4">Loading…</div>

    <template v-else>
      <!-- Settings -->
      <form v-show="activeTab === 'settings'" @submit.prevent="save" class="grid grid-cols-2 gap-4">
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

      <!-- Email Test -->
      <form v-show="activeTab === 'test'" @submit.prevent="sendTest" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <label class="flex flex-col gap-1 text-xs text-slate-400">
            From
            <input v-model="testForm.from" type="text" placeholder="no-reply@example.com" class="px-3 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
          </label>

          <label class="flex flex-col gap-1 text-xs text-slate-400">
            To
            <input v-model="testForm.to" type="text" required placeholder="recipient@example.com" class="px-3 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
          </label>

          <label class="flex flex-col gap-1 text-xs text-slate-400">
            CC
            <input v-model="testForm.cc" type="text" placeholder="cc@example.com" class="px-3 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
          </label>

          <label class="flex flex-col gap-1 text-xs text-slate-400">
            Subject
            <input v-model="testForm.subject" type="text" required placeholder="Test email" class="px-3 py-1.5 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800" />
          </label>

          <label class="col-span-2 flex flex-col gap-1 text-xs text-slate-400">
            Body (text or HTML)
            <textarea v-model="testForm.body" rows="6" required placeholder="Hello, this is a test email…  or <strong>HTML</strong> content" class="w-full px-3 py-2 rounded-lg bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-sm text-slate-200 light:text-slate-800 resize-none font-mono"></textarea>
          </label>
        </div>

        <div class="flex items-center gap-3 pt-2">
          <button type="submit" :disabled="testSending" class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white">
            {{ testSending ? 'Sending…' : 'Send Test Email' }}
          </button>
          <span v-if="testResult === 'ok'" class="text-xs text-emerald-400">Sent.</span>
          <span v-if="testError" class="text-xs text-rose-400">{{ testError }}</span>
        </div>
      </form>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { getDefaultCoreApiUrl } from '../../utils/auth-api'
import { fetchMailSettings, saveMailSettings, sendTestMail, type MailSettingsRecord } from '../../utils/mail-settings-api'

const loading = ref(true)
const saving = ref(false)
const error = ref('')
const savedAt = ref(false)
const existing = ref<MailSettingsRecord | null>(null)

const tabs: { key: 'settings' | 'test'; label: string }[] = [
  { key: 'settings', label: 'Settings' },
  { key: 'test', label: 'Email Test' },
]
const activeTab = ref<'settings' | 'test'>('settings')

const testSending = ref(false)
const testResult = ref<'ok' | null>(null)
const testError = ref('')
const testForm = reactive({
  from: '',
  to: '',
  cc: '',
  subject: '',
  body: '',
})

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
      // Default the test sender to the configured from address.
      testForm.from = settings.fromAddress
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

async function sendTest() {
  testSending.value = true
  testResult.value = null
  testError.value = ''
  try {
    const body = testForm.body.trim()
    if (!body) {
      testError.value = 'Body is required'
      return
    }
    // HTML-looking content goes as html, otherwise as plain text.
    const looksLikeHtml = /<[a-z/][^>]*>/i.test(body)
    await sendTestMail(getDefaultCoreApiUrl(), {
      from: testForm.from.trim() || undefined,
      to: testForm.to.trim(),
      cc: testForm.cc.trim() || undefined,
      subject: testForm.subject.trim(),
      html: looksLikeHtml ? body : undefined,
      text: looksLikeHtml ? undefined : body,
    })
    testResult.value = 'ok'
  } catch (e: any) {
    testError.value = e?.message || 'Failed to send test email'
  } finally {
    testSending.value = false
  }
}
</script>
