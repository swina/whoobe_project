<template>
  <div class="flex flex-col h-full gap-4">
    <div class="shrink-0 flex items-start justify-between gap-4">
      <div>
        <h2 class="text-xl font-bold text-slate-100 light:text-slate-900">Audit log</h2>
        <p class="text-xs text-slate-400 light:text-slate-600">
          Who changed a user, a role, a website, a setting or an integration, when, and what it was before. Successful administrative actions only;
          secrets are never written (a changed credential shows as <i>changed</i>). Rows cannot be edited or deleted here: the log is kept for
          the retention period the operator has set (<code>AUDIT_RETENTION_DAYS</code>, a year by default).
        </p>
      </div>
      <div class="flex gap-2 shrink-0">
        <button type="button" class="btn btn-secondary flex items-center gap-1.5" :disabled="loading" @click="refresh">
          <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': loading }" /> Refresh
        </button>
        <button type="button" class="btn btn-secondary flex items-center gap-1.5" :disabled="exporting" title="Download the rows that match the filters as a CSV file" @click="exportCsv">
          <Download class="w-3.5 h-3.5" /> {{ exporting ? 'Preparing...' : 'Export CSV' }}
        </button>
      </div>
    </div>

    <div class="shrink-0 grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
      <label class="block">
        <span class="block mb-1 text-slate-400">Action</span>
        <select v-model="action" class="field w-full">
          <option v-for="c in ACTION_CHOICES" :key="c.value" :value="c.value">{{ c.label }}</option>
        </select>
      </label>
      <label class="block">
        <span class="block mb-1 text-slate-400">Done by (user id)</span>
        <input v-model.trim="actor" class="field w-full font-mono" placeholder="any" />
      </label>
      <label class="block">
        <span class="block mb-1 text-slate-400">Target id</span>
        <input v-model.trim="targetId" class="field w-full font-mono" placeholder="any" />
      </label>
      <label class="block">
        <span class="block mb-1 text-slate-400">From</span>
        <input v-model="fromDay" type="date" class="field w-full" />
      </label>
      <label class="block">
        <span class="block mb-1 text-slate-400">To</span>
        <input v-model="toDay" type="date" class="field w-full" />
      </label>
    </div>

    <p v-if="error" class="shrink-0 rounded-xl bg-rose-950/40 border border-rose-800 p-3 text-xs text-rose-300">{{ error }}</p>
    <div v-if="loading && !entries.length" class="shrink-0 p-12 text-center text-xs text-slate-500">Loading...</div>
    <div v-else-if="!entries.length && !error" class="shrink-0 rounded-2xl bg-slate-900/40 light:bg-white/40 border border-slate-800/80 light:border-slate-200/80 p-12 text-center text-xs text-slate-500">
      Nothing recorded for these filters.
    </div>

    <div v-else-if="entries.length" class="flex-1 min-h-0 overflow-y-auto rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200">
      <table class="w-full text-left text-xs text-slate-300 light:text-slate-700">
        <thead class="sticky top-0 z-10 bg-slate-950/80 light:bg-white/80 border-b border-slate-800 light:border-slate-200 text-[11px] font-semibold text-slate-400 light:text-slate-600 uppercase tracking-wider">
          <tr>
            <th class="py-3 px-4 w-44">When</th>
            <th class="py-3 px-4">Who</th>
            <th class="py-3 px-4">Action</th>
            <th class="py-3 px-4">On</th>
            <th class="py-3 px-4">Address</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/60 light:divide-slate-200/60">
          <template v-for="e in entries" :key="e.id">
            <tr class="align-top cursor-pointer hover:bg-slate-800/30" @click="toggle(e.id)">
              <td class="py-2 px-4 font-mono whitespace-nowrap">{{ whenText(e.at) }}</td>
              <td class="py-2 px-4">{{ actorText(e) }}</td>
              <td class="py-2 px-4">
                <span class="px-1.5 py-0.5 rounded text-[10px]" :class="TONE[actionTone(e.action)]">{{ actionLabel(e.action) }}</span>
              </td>
              <td class="py-2 px-4 break-all">{{ targetText(e) }}</td>
              <td class="py-2 px-4 font-mono">{{ e.ip || '-' }}</td>
            </tr>
            <tr v-if="open.has(e.id)">
              <td colspan="5" class="px-4 pb-3 bg-slate-950/40 light:bg-slate-50">
                <div v-if="changeRows(e).length" class="pt-2">
                  <table class="w-full text-[11px]">
                    <thead class="text-slate-500"><tr><th class="py-1 pr-4 text-left w-56">Field</th><th class="py-1 pr-4 text-left">Before</th><th class="py-1 text-left">After</th></tr></thead>
                    <tbody>
                      <tr v-for="r in changeRows(e)" :key="r.field" class="align-top">
                        <td class="py-1 pr-4 font-mono text-slate-400">{{ r.field }}</td>
                        <td class="py-1 pr-4 font-mono break-all text-rose-300/90">{{ r.before }}</td>
                        <td class="py-1 font-mono break-all" :class="r.secret ? 'text-amber-300' : 'text-emerald-300/90'">{{ r.after }}<span v-if="r.secret" class="ml-1 font-sans text-slate-500">(a credential: the value is not recorded)</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p v-else class="pt-2 text-slate-500">No field is recorded for this action.</p>
                <p class="mt-2 text-[10px] text-slate-500 font-mono break-all">
                  entry {{ e.id }}<template v-if="e.actorId"> · actor {{ e.actorId }}</template><template v-if="e.targetId"> · target {{ e.targetId }}</template><template v-if="e.requestId"> · request {{ e.requestId }}</template>
                </p>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <div v-if="total > 0" class="shrink-0 flex items-center justify-between text-xs text-slate-400">
      <span>{{ offset + 1 }}-{{ Math.min(offset + entries.length, total) }} of {{ total }}</span>
      <span class="flex gap-2">
        <button type="button" class="btn btn-secondary" :disabled="offset === 0 || loading" @click="page(-1)">Newer</button>
        <button type="button" class="btn btn-secondary" :disabled="offset + PAGE >= total || loading" @click="page(1)">Older</button>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
// Read-only view of the audit log of administrative actions (docs/plans/system/audit-log-plan.md). Needs `audit:read`; the server refuses
// everyone else and says so here. Nothing in this view can change a row.
import { computed, onMounted, ref, watch } from 'vue'
import { Download, RefreshCw } from '@lucide/vue'
import { useAuthStore } from '../stores/authStore'
import { downloadAuditCsv, listAuditLog, type AuditEntry, type AuditFilters } from '../utils/audit-log-api'
import { ACTION_CHOICES, actionLabel, actionTone, actorText, changeRows, dayEnd, dayStart, targetText, whenText } from '../utils/audit-log-ui'

const PAGE = 50
const TONE = {
  create: 'bg-emerald-900/50 text-emerald-300',
  delete: 'bg-rose-900/50 text-rose-300',
  change: 'bg-slate-700/60 text-slate-200',
} as const

const authStore = useAuthStore()
const coreUrl = () => authStore.config.coreApiUrl

const entries = ref<AuditEntry[]>([])
const total = ref(0)
const offset = ref(0)
const loading = ref(false)
const exporting = ref(false)
const error = ref('')
const open = ref(new Set<string>())

const action = ref('')
const actor = ref('')
const targetId = ref('')
const fromDay = ref('')
const toDay = ref('')

const filters = computed<AuditFilters>(() => ({
  action: action.value, actor: actor.value, targetId: targetId.value, from: dayStart(fromDay.value), to: dayEnd(toDay.value),
}))

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    const r = await listAuditLog(coreUrl(), { ...filters.value, limit: PAGE, offset: offset.value })
    entries.value = r.entries
    total.value = r.total
    open.value = new Set()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

function page(direction: 1 | -1) {
  offset.value = Math.max(0, offset.value + direction * PAGE)
  void refresh()
}

function toggle(id: string) {
  const next = new Set(open.value)
  if (!next.delete(id)) next.add(id)
  open.value = next
}

async function exportCsv() {
  exporting.value = true
  error.value = ''
  try {
    const blob = await downloadAuditCsv(coreUrl(), filters.value)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    exporting.value = false
  }
}

// a change of filter starts again from the newest rows
watch(filters, () => { offset.value = 0; void refresh() })
onMounted(refresh)
</script>
