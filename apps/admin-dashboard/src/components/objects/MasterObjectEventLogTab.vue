<template>
  <div class="h-full overflow-y-auto p-6 space-y-3 text-xs">
    <h2 class="text-base font-semibold text-slate-100 light:text-slate-900 flex items-center gap-2" data-testid="object-event-log-title">
      <ListChecks class="w-4 h-4" /> Delivery log<template v-if="sub"> - {{ sub.name }}</template>
    </h2>
    <div class="flex items-center gap-3 flex-wrap">
      <select v-model="status" class="field" title="Status" @change="load">
        <option value="">All statuses</option>
        <option v-for="(t, k) in STATUS_TEXT" :key="k" :value="k">{{ t }}</option>
      </select>
      <select v-model="eventType" class="field" title="Event" @change="load">
        <option value="">All events</option>
        <option v-for="c in EVENT_CHOICES" :key="c.type" :value="c.type">{{ c.label }}</option>
      </select>
      <input v-model="recordFilter" type="search" class="field w-44 font-mono" placeholder="Record id..." title="Filter the rows below by record id" />
      <select v-model.number="limit" class="field" title="How many rows" @change="load">
        <option :value="50">Last 50</option>
        <option :value="100">Last 100</option>
        <option :value="200">Last 200</option>
      </select>
      <button type="button" class="btn btn-secondary flex items-center gap-1.5" :disabled="loading" @click="load">
        <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': loading }" /> Refresh
      </button>
      <button type="button" class="btn btn-secondary flex items-center gap-1.5" :disabled="!sub || !sub.endpointId || !sub.routeId" @click="test">
        <Send class="w-3.5 h-3.5" /> Send a test event
      </button>
    </div>
    <div class="flex items-center gap-3 flex-wrap">
      <button type="button" class="btn btn-danger flex items-center gap-1.5" :disabled="!selected.size" @click="removeSelected">
        <Trash2 class="w-3.5 h-3.5" /> Delete selected ({{ selected.size }})
      </button>
      <button v-if="status && isFinished(status)" type="button" class="btn btn-secondary flex items-center gap-1.5" @click="clearStatus">
        <Trash2 class="w-3.5 h-3.5" /> Clear all "{{ STATUS_TEXT[status] }}"
      </button>
      <span class="text-slate-500">The log shows what happened to each delivery, not the content of the event or the answer. It refreshes every 5 seconds. Deliveries still waiting or being retried cannot be deleted.</span>
    </div>
    <p v-if="notice" class="rounded-lg bg-emerald-950/40 border border-emerald-800 p-2 text-emerald-300">{{ notice }}</p>
    <p v-if="error" class="rounded-lg bg-rose-950/40 border border-rose-800 p-2 text-rose-300">{{ error }}</p>
    <p v-else-if="!shown.length && !loading" class="p-8 text-center text-slate-500">{{ rows.length ? 'No row matches the record id.' : 'Nothing yet.' }}</p>
    <table v-else class="w-full text-left text-slate-300 light:text-slate-700">
      <thead class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
        <tr><th class="py-2 pr-3 w-6"><input type="checkbox" :checked="allSelected" :disabled="!selectable.length" title="Select all the finished rows shown" @change="toggleAll" /></th><th class="py-2 pr-3">Status</th><th class="py-2 pr-3">Event</th><th class="py-2 pr-3">Record</th><th class="py-2 pr-3">When</th><th class="py-2 pr-3">Tries</th><th class="py-2 pr-3">Next try</th><th class="py-2 pr-3">Last problem</th><th class="py-2"></th></tr>
      </thead>
      <tbody class="divide-y divide-slate-800/60 light:divide-slate-200/60">
        <tr v-for="d in shown" :key="d.id" class="align-top">
          <td class="py-2 pr-3"><input type="checkbox" :checked="selected.has(d.id)" :disabled="!isFinished(d.status)" @change="toggle(d.id)" /></td>
          <td class="py-2 pr-3"><span class="px-1.5 py-0.5 rounded text-[10px] uppercase" :class="statusTone(d.status)">{{ STATUS_TEXT[d.status] }}</span></td>
          <td class="py-2 pr-3 font-mono">{{ d.event.type.replace('object.', '') }}<span v-if="d.event.test" class="ml-1 px-1 rounded bg-indigo-900/60 text-indigo-300 text-[10px] uppercase font-sans">test</span></td>
          <td class="py-2 pr-3 font-mono text-[11px]">{{ d.event.objectId ? d.event.objectId.slice(0, 8) : '-' }}</td>
          <td class="py-2 pr-3 whitespace-nowrap">
            <div class="font-mono text-[11px]">{{ stamp(d.event.occurredAt) }}</div>
            <div class="text-slate-500 text-[10px]">{{ relativeTime(d.event.occurredAt) }}<span v-if="d.deliveredAt"> · delivered {{ stamp(d.deliveredAt) }}</span></div>
          </td>
          <td class="py-2 pr-3">{{ d.attempts }}</td>
          <td class="py-2 pr-3 whitespace-nowrap">{{ nextAttemptText(d) || '-' }}</td>
          <td class="py-2 pr-3 break-words max-w-[22rem] text-slate-400">{{ d.lastError || '' }}</td>
          <td class="py-2"><button v-if="d.status === 'dead'" type="button" class="btn btn-primary" @click="retry(d)">Retry</button></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
// The delivery log of one object-event subscription, in its own main tab (opened from the Object events list).
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ListChecks, RefreshCw, Send, Trash2 } from '@lucide/vue'
import { useAuthStore } from '../../stores/authStore'
import { useTabsStore } from '../../stores/tabsStore'
import {
  clearDeliveries, listDeliveries, listSubscriptions, retryDelivery, sendTestEvent,
  type DeliveryStatus, type ObjectEventDelivery, type ObjectEventSubscription, type ObjectEventType,
} from '../../utils/object-events-api'
import { EVENT_CHOICES, STATUS_TEXT, nextAttemptText, relativeTime, statusTone } from '../../utils/object-events-ui'

const props = defineProps<{ subscriptionId: string; tabId: string }>()
const authStore = useAuthStore()
const tabsStore = useTabsStore()
const coreUrl = () => authStore.config.coreApiUrl

const sub = ref<ObjectEventSubscription | null>(null)
const rows = ref<ObjectEventDelivery[]>([])
const status = ref<'' | DeliveryStatus>('')
const eventType = ref<'' | ObjectEventType>('')
const recordFilter = ref('')
const limit = ref(50)
const selected = ref<Set<string>>(new Set())
const loading = ref(false)
const error = ref('')
const notice = ref('')
let timer: ReturnType<typeof setInterval> | undefined

async function load() {
  loading.value = true
  try {
    if (!sub.value) {
      sub.value = (await listSubscriptions(coreUrl())).find((s) => s.id === props.subscriptionId) ?? null
      if (sub.value) tabsStore.setTabLabel(props.tabId, `${sub.value.name} ‣ log`)
    }
    rows.value = await listDeliveries(coreUrl(), props.subscriptionId, status.value || undefined, limit.value, eventType.value || undefined)
    const ids = new Set(rows.value.map((d) => d.id))
    selected.value = new Set([...selected.value].filter((id) => ids.has(id)))
    error.value = sub.value ? '' : 'This subscription no longer exists.'
  } catch (e: any) { error.value = e?.message || 'Could not read the log' } finally { loading.value = false }
}
const stamp = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })
// Only a finished delivery (delivered, dead, stopped) can be removed from the log.
const isFinished = (st: string) => st === 'delivered' || st === 'dead' || st === 'stopped'
const shown = computed(() => {
  const q = recordFilter.value.trim().toLowerCase()
  return q ? rows.value.filter((d) => (d.event.objectId ?? '').toLowerCase().includes(q)) : rows.value
})
const selectable = computed(() => shown.value.filter((d) => isFinished(d.status)))
const allSelected = computed(() => selectable.value.length > 0 && selectable.value.every((d) => selected.value.has(d.id)))
function toggle(id: string) {
  const next = new Set(selected.value)
  if (!next.delete(id)) next.add(id)
  selected.value = next
}
function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(selectable.value.map((d) => d.id))
}
async function removeSelected() {
  const ids = [...selected.value]
  if (!ids.length || !confirm(`Delete ${ids.length} ${ids.length === 1 ? 'row' : 'rows'} from this log? The events themselves are not affected.`)) return
  try {
    const n = await clearDeliveries(coreUrl(), props.subscriptionId, { ids })
    selected.value = new Set()
    flash(`${n} ${n === 1 ? 'row' : 'rows'} deleted.`)
    await load()
  } catch (e: any) { error.value = e?.message || 'Could not delete' }
}
async function clearStatus() {
  if (!status.value || !isFinished(status.value)) return
  if (!confirm(`Delete every "${STATUS_TEXT[status.value]}" row of this log, not only the ones shown?`)) return
  try {
    const n = await clearDeliveries(coreUrl(), props.subscriptionId, { status: status.value as 'delivered' | 'dead' | 'stopped' })
    flash(`${n} ${n === 1 ? 'row' : 'rows'} deleted.`)
    await load()
  } catch (e: any) { error.value = e?.message || 'Could not delete' }
}
function flash(text: string) { notice.value = text; setTimeout(() => { if (notice.value === text) notice.value = '' }, 4000) }

async function test() {
  if (!sub.value) return
  try {
    await sendTestEvent(coreUrl(), sub.value.id)
    flash(`A test event was queued for "${sub.value.name}". It is sent within a few seconds.`)
    setTimeout(load, 1500)
  } catch (e: any) { error.value = e?.message || 'Could not queue the test' }
}
async function retry(d: ObjectEventDelivery) {
  try { await retryDelivery(coreUrl(), d.id); await load() } catch (e: any) { error.value = e?.message || 'Could not retry' }
}

onMounted(() => { void load(); timer = setInterval(load, 5000) })
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
</script>
