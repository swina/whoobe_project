<template>
  <div class="flex flex-col h-full gap-6 overflow-y-auto" data-testid="ai-usage">
    <div class="shrink-0">
      <h2 class="text-xl font-bold text-slate-100 light:text-slate-900">AI Usage</h2>
      <p class="text-xs text-slate-400 light:text-slate-600">
        Tokens used by the AI functions, per person: counts only, never prompts or answers. Recording is switched on and off in Security &gt; AI Usage.
      </p>
    </div>

    <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-4">
      <div class="flex flex-wrap items-end gap-3">
        <div v-if="canRead" class="flex gap-1">
          <button v-for="v in views" :key="v.key" type="button" @click="view = v.key"
            :class="['px-3 py-1.5 rounded-lg text-xs font-semibold transition', view === v.key ? 'bg-slate-800 light:bg-slate-200 text-slate-100 light:text-slate-900' : 'text-slate-500 hover:text-slate-300']"
            :data-testid="`ai-usage-view-${v.key}`">{{ v.name }}</button>
        </div>
        <label class="text-xs text-slate-400">From <input v-model="from" type="date" class="field" data-testid="ai-usage-from" /></label>
        <label class="text-xs text-slate-400">To <input v-model="to" type="date" class="field" data-testid="ai-usage-to" /></label>
        <button type="button" class="btn btn-secondary" :disabled="busy" @click="load" data-testid="ai-usage-load">Show</button>
      </div>

      <p v-if="report && !report.tracking" class="text-xs text-slate-400" data-testid="ai-usage-off">
        Recording is off: nothing new is stored.<span v-if="report.total.requests"> The rows below were recorded while it was on.</span>
      </p>
      <p v-else-if="report" class="text-xs text-slate-500">
        Each request is kept {{ report.retentionDays ? `${report.retentionDays} days` : 'until deleted' }}; the monthly totals stay.
      </p>
      <div v-if="error" class="px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs" data-testid="ai-usage-error">{{ error }}</div>

      <template v-if="report">
        <p class="text-sm text-slate-200 light:text-slate-800" data-testid="ai-usage-total">
          {{ fmt(report.total.requests) }} request(s), {{ fmt(report.total.inputTokens) }} tokens in, {{ fmt(report.total.outputTokens) }} tokens out<span v-if="report.total.errors">, {{ fmt(report.total.errors) }} failed</span>.
        </p>

        <!-- every user: ai_usage:read -->
        <div v-if="view === 'all' && !selectedUser">
          <div class="flex items-center justify-between mb-1">
            <h4 class="text-xs font-medium text-slate-300 light:text-slate-700">By person</h4>
            <button type="button" class="text-xs text-indigo-400 hover:underline" @click="csvByUser">CSV</button>
          </div>
          <p class="text-xs text-slate-500 mb-2">Opening a person's requests is written to the audit log.</p>
          <div class="overflow-x-auto"><table class="w-full text-xs" data-testid="ai-usage-by-user">
            <thead><tr class="text-left text-slate-500"><th class="py-1">Person</th><th class="text-right">Requests</th><th class="text-right">Failed</th><th class="text-right">Tokens in</th><th class="text-right">Tokens out</th><th></th></tr></thead>
            <tbody>
              <tr v-for="u in report.byUser" :key="u.userId" class="border-t border-slate-800 light:border-slate-200 text-slate-300 light:text-slate-700">
                <td class="py-1">{{ u.displayName || u.email || u.userId }} <span v-if="u.displayName" class="text-slate-500">{{ u.email }}</span></td>
                <td class="text-right">{{ fmt(u.requests) }}</td><td class="text-right">{{ fmt(u.errors) }}</td>
                <td class="text-right">{{ fmt(u.inputTokens) }}</td><td class="text-right">{{ fmt(u.outputTokens) }}</td>
                <td class="text-right"><button type="button" class="text-indigo-400 hover:underline" @click="openUser(u)" :data-testid="`ai-usage-user-${u.email}`">Requests</button></td>
              </tr>
              <tr v-if="!report.byUser.length"><td colspan="6" class="py-2 text-slate-500">Nothing recorded in this period.</td></tr>
            </tbody>
          </table></div>
        </div>
        <div v-if="selectedUser" class="flex items-center gap-3">
          <button type="button" class="text-xs text-indigo-400 hover:underline" @click="closeUser">← Everyone</button>
          <span class="text-sm text-slate-200 light:text-slate-800">{{ selectedUser.displayName || selectedUser.email }}</span>
        </div>

        <div v-if="view !== 'monthly'" class="grid gap-4 sm:grid-cols-2">
          <div v-for="g in groups" :key="g.title">
            <h4 class="text-xs font-medium text-slate-300 light:text-slate-700 mb-1">{{ g.title }}</h4>
            <table class="w-full text-xs">
              <tbody>
                <tr v-for="r in g.rows" :key="r.key" class="border-t border-slate-800 light:border-slate-200 text-slate-300 light:text-slate-700">
                  <td class="py-1">{{ g.label(r.key) }}</td><td class="text-right">{{ fmt(r.requests) }}</td>
                  <td class="text-right">{{ fmt(r.inputTokens) }} / {{ fmt(r.outputTokens) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-if="report.calls && view !== 'monthly'">
          <div class="flex items-center justify-between mb-1">
            <h4 class="text-xs font-medium text-slate-300 light:text-slate-700">Requests</h4>
            <button type="button" class="text-xs text-indigo-400 hover:underline" @click="csvCalls">CSV</button>
          </div>
          <div class="overflow-x-auto"><table class="w-full text-xs" data-testid="ai-usage-calls">
            <thead><tr class="text-left text-slate-500"><th class="py-1">When</th><th>Function</th><th>Model</th><th class="text-right">Tokens in</th><th class="text-right">Tokens out</th><th class="text-right">Status</th></tr></thead>
            <tbody>
              <tr v-for="(c, i) in report.calls" :key="i" class="border-t border-slate-800 light:border-slate-200 text-slate-300 light:text-slate-700">
                <td class="py-1">{{ new Date(c.createdAt).toLocaleString() }}</td><td>{{ kindLabel(c.kind) }}</td><td>{{ c.provider }} / {{ c.model }}</td>
                <td class="text-right">{{ c.inputTokens === null ? '-' : fmt(c.inputTokens) }}</td><td class="text-right">{{ c.outputTokens === null ? '-' : fmt(c.outputTokens) }}</td>
                <td class="text-right">{{ c.status }}</td>
              </tr>
            </tbody>
          </table></div>
        </div>
      </template>

      <div v-if="monthlyRows.length && (view === 'monthly' || view === 'mine')">
        <div class="flex items-center justify-between mb-1">
          <h4 class="text-xs font-medium text-slate-300 light:text-slate-700">By month</h4>
          <button type="button" class="text-xs text-indigo-400 hover:underline" @click="csvMonthly">CSV</button>
        </div>
        <div class="overflow-x-auto"><table class="w-full text-xs" data-testid="ai-usage-monthly">
          <thead><tr class="text-left text-slate-500"><th class="py-1">Month</th><th v-if="view === 'monthly'">Person</th><th>Function</th><th>Model</th><th class="text-right">Requests</th><th class="text-right">Tokens in</th><th class="text-right">Tokens out</th></tr></thead>
          <tbody>
            <tr v-for="(m, i) in monthlyRows" :key="i" class="border-t border-slate-800 light:border-slate-200 text-slate-300 light:text-slate-700">
              <td class="py-1">{{ m.month }}</td><td v-if="view === 'monthly'">{{ m.displayName || m.email }}</td><td>{{ kindLabel(m.kind) }}</td><td>{{ m.provider }} / {{ m.model }}</td>
              <td class="text-right">{{ fmt(m.requests) }}</td><td class="text-right">{{ fmt(m.inputTokens) }}</td><td class="text-right">{{ fmt(m.outputTokens) }}</td>
            </tr>
          </tbody>
        </table></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// The AI usage report (docs/plans/ai/ai-usage-plan.md), a main tab: everyone sees their own requests, ai_usage:read every user's.
import { computed, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '../stores/authStore'
import {
  fetchAiUsage, fetchAiUsageMonthly, fetchOwnAiUsage, downloadCsv,
  type AiUsageReport, type AiUsageMonthRow, type AiUsageUserTotals, type AiUsageGroupTotals,
} from '../utils/ai-usage-api'

const authStore = useAuthStore()
const base = () => authStore.config.coreApiUrl
const canRead = computed(() => authStore.can('ai_usage:read'))

type View = 'all' | 'monthly' | 'mine'
const views: { key: View; name: string }[] = [
  { key: 'all', name: 'Everyone' },
  { key: 'monthly', name: 'By month' },
  { key: 'mine', name: 'Mine' },
]
const view = ref<View>(canRead.value ? 'all' : 'mine')

const day = (d: Date) => d.toISOString().slice(0, 10)
const to = ref(day(new Date()))
const from = ref(day(new Date(Date.now() - 29 * 86_400_000)))

const busy = ref(false)
const error = ref('')
const report = ref<AiUsageReport | null>(null)
const monthlyRows = ref<AiUsageMonthRow[]>([])
const selectedUser = ref<AiUsageUserTotals | null>(null)

const fmt = (n: number) => Number(n ?? 0).toLocaleString()
const KIND_LABELS: Record<string, string> = {
  page: 'Page', snippet: 'Snippet', text: 'Text of an element', 'website-structure': 'Website structure',
  'wizard-texts': 'Wizard texts', 'page-translation': 'Page translation', image: 'Image',
}
const kindLabel = (k: string) => KIND_LABELS[k] ?? k

const groups = computed<{ title: string; rows: AiUsageGroupTotals[]; label: (k: string) => string }[]>(() => report.value ? [
  { title: 'By function', rows: report.value.byKind, label: kindLabel },
  { title: 'By model', rows: report.value.byModel, label: (k) => k },
] : [])

async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
  busy.value = true
  error.value = ''
  try { return await fn() } catch (e: any) { error.value = e?.message || 'Failed'; return undefined } finally { busy.value = false }
}

async function load() {
  const range = { from: from.value, to: to.value }
  if (view.value === 'mine') {
    const r = await guard(() => fetchOwnAiUsage(base(), range))
    if (r) { report.value = r; monthlyRows.value = r.monthly }
  } else if (view.value === 'monthly') {
    const r = await guard(() => fetchAiUsageMonthly(base(), { from: from.value.slice(0, 7), to: to.value.slice(0, 7) }))
    if (r) { report.value = null; monthlyRows.value = r.rows }
  } else {
    const r = await guard(() => fetchAiUsage(base(), { ...range, userId: selectedUser.value?.userId }))
    if (r) report.value = r
  }
}

function openUser(u: AiUsageUserTotals) { selectedUser.value = u; void load() }
function closeUser() { selectedUser.value = null; void load() }
watch(view, () => { selectedUser.value = null; report.value = null; monthlyRows.value = []; void load() })

function csvByUser() {
  if (!report.value) return
  downloadCsv(`ai-usage-${from.value}-${to.value}.csv`, ['email', 'name', 'requests', 'failed', 'calls', 'input_tokens', 'output_tokens'],
    report.value.byUser.map((u) => [u.email, u.displayName, u.requests, u.errors, u.calls, u.inputTokens, u.outputTokens]))
}
function csvCalls() {
  if (!report.value?.calls) return
  downloadCsv(`ai-usage-requests-${from.value}-${to.value}.csv`, ['date', 'function', 'provider', 'model', 'calls', 'input_tokens', 'output_tokens', 'status'],
    report.value.calls.map((c) => [c.createdAt, c.kind, c.provider, c.model, c.calls, c.inputTokens, c.outputTokens, c.status]))
}
function csvMonthly() {
  downloadCsv(`ai-usage-monthly-${from.value.slice(0, 7)}-${to.value.slice(0, 7)}.csv`, ['month', 'email', 'name', 'function', 'provider', 'model', 'requests', 'calls', 'input_tokens', 'output_tokens'],
    monthlyRows.value.map((m) => [m.month, m.email, m.displayName, m.kind, m.provider, m.model, m.requests, m.calls, m.inputTokens, m.outputTokens]))
}

onMounted(() => { void load() })
</script>
