<template>
  <div class="space-y-6" data-testid="ai-usage-card">
    <!-- the switch and the periods: settings:manage -->
    <div v-if="canManage" class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-4" data-testid="ai-usage-settings">
      <div>
        <h3 class="font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider text-xs">Recording</h3>
        <p class="text-xs text-slate-500 mt-1">
          Every person always sees the tokens of an AI answer when it arrives; nothing is stored for that. When recording is on, each AI request is also stored
          for the person who made it: the function, provider, model, tokens and the date. Never the prompt, the answer or what was being edited.
        </p>
      </div>
      <div class="px-3 py-2 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs" data-testid="ai-usage-notice">
        A record per person is personal data about your staff and can be used to watch their work. Before turning it on, tell the people concerned what is recorded,
        why and for how long, and check with whoever handles data protection in your organisation: in some countries an agreement with the staff representatives
        or an authorisation is needed for a tool that can monitor workers (in Italy, article 4 of the Statuto dei Lavoratori).
      </div>
      <label class="flex items-center gap-2 text-sm text-slate-200 light:text-slate-800">
        <input type="checkbox" v-model="tracking" data-testid="ai-usage-tracking" /> Record the AI usage of each person
      </label>
      <div class="flex flex-wrap items-center gap-2">
        <span class="w-full sm:w-56 text-sm text-slate-200 light:text-slate-800">Keep each request for</span>
        <input v-model.number="usageDays" type="number" min="1" max="36500" step="1" placeholder="keep" class="field w-28" data-testid="ai-usage-retention" />
        <span class="text-xs text-slate-500">days (the monthly totals stay until the person is deleted)</span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="w-full sm:w-56 text-sm text-slate-200 light:text-slate-800">Keep generated pages and prompts for</span>
        <input v-model.number="generatedDays" type="number" min="1" max="36500" step="1" placeholder="keep" class="field w-28" data-testid="ai-generated-retention" />
        <span class="text-xs text-slate-500">days (the AI history: prompts and answers of pages, snippets, translations, images)</span>
      </div>
      <div class="flex items-center gap-3">
        <button type="button" class="btn btn-primary" :disabled="busy" @click="saveSettings" data-testid="ai-usage-save">Save</button>
        <span v-if="settingsMessage" class="text-xs text-slate-400" data-testid="ai-usage-saved">{{ settingsMessage }}</span>
      </div>
    </div>

    <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 flex flex-wrap items-center justify-between gap-3">
      <p class="text-xs text-slate-500">{{ canRead ? 'What each person used, by function, model and month.' : 'What you used, by function, model and month.' }}</p>
      <button type="button" class="btn btn-secondary" @click="tabs.openSection('ai-usage')" data-testid="ai-usage-open-report">Open the AI usage report</button>
    </div>
    <div v-if="error" class="px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs" data-testid="ai-usage-error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
// Security > AI Usage: the recording switch and the two periods (settings:manage); the report is its own main tab (AiUsageView).
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '../../stores/authStore'
import { useTabsStore } from '../../stores/tabsStore'
import { fetchSecuritySettings, saveSecuritySettings } from '../../utils/security-settings-api'

const authStore = useAuthStore()
const tabs = useTabsStore()
const base = () => authStore.config.coreApiUrl
const canManage = computed(() => authStore.can('settings:manage'))
const canRead = computed(() => authStore.can('ai_usage:read'))

const busy = ref(false)
const error = ref('')
const tracking = ref(false)
const usageDays = ref<number | '' | null>(90)
const generatedDays = ref<number | '' | null>(null)
const settingsMessage = ref('')

async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
  busy.value = true
  error.value = ''
  try { return await fn() } catch (e: any) { error.value = e?.message || 'Failed'; return undefined } finally { busy.value = false }
}

const asDays = (v: number | '' | null | undefined): number | null => (v === '' || v == null ? null : Number(v))

async function loadSettings() {
  const s = await guard(() => fetchSecuritySettings(base()))
  if (!s) return
  tracking.value = s.aiUsageTracking
  usageDays.value = s.aiUsageRetentionDays
  generatedDays.value = s.aiGeneratedRetentionDays
}

async function saveSettings() {
  const s = await guard(() => saveSecuritySettings(base(), {
    aiUsageTracking: tracking.value, aiUsageRetentionDays: asDays(usageDays.value), aiGeneratedRetentionDays: asDays(generatedDays.value),
  }))
  if (!s) return
  tracking.value = s.aiUsageTracking
  usageDays.value = s.aiUsageRetentionDays
  generatedDays.value = s.aiGeneratedRetentionDays
  settingsMessage.value = s.aiUsageTracking ? 'Saved: AI usage is recorded from now on.' : 'Saved: AI usage is not recorded.'
}

onMounted(() => {
  if (canManage.value) void loadSettings()
})
</script>
