<template>
  <div class="flex flex-col h-full gap-6">
    <div class="shrink-0 flex items-center justify-between gap-4">
      <div>
        <h2 class="text-xl font-bold text-slate-100 light:text-slate-900">Object events</h2>
        <p class="text-xs text-slate-400 light:text-slate-600">
          Tell an external service (an automation engine, a back-end) when a Data Object is created, changed, published or deleted. Each
          subscription sends a small JSON event to an Integrations endpoint and route. The event carries ids and the <i>names</i> of the changed
          fields, never their values: the service reads the record through the API if it needs it.
        </p>
        <p class="mt-1 text-xs text-slate-500">
          Delivery is retried (1 min, 5 min, 30 min, 2 h, 12 h) and then marked <i>gave up</i>; it can be retried by hand. A service can receive the same
          event twice: use the event id as the idempotency key.
        </p>
      </div>
      <div class="flex gap-2 shrink-0">
        <button type="button" class="btn btn-secondary flex items-center gap-1.5" :disabled="loading" @click="refresh">
          <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': loading }" /> Refresh
        </button>
        <button type="button" class="btn btn-primary flex items-center gap-1.5" @click="wizardOpen = true">
          <Plug class="w-3.5 h-3.5" /> Connect a flow
        </button>
        <button type="button" class="btn btn-secondary flex items-center gap-1.5" @click="openEditor()">
          <Plus class="w-3.5 h-3.5" /> New subscription
        </button>
      </div>
    </div>

    <p v-if="error" class="shrink-0 rounded-xl bg-rose-950/40 border border-rose-800 p-3 text-xs text-rose-300">{{ error }}</p>
    <p v-if="notice" class="shrink-0 rounded-xl bg-emerald-950/40 border border-emerald-800 p-3 text-xs text-emerald-300">{{ notice }}</p>
    <div v-if="loading && !subs.length" class="shrink-0 p-12 text-center text-xs text-slate-500">Loading...</div>
    <div v-else-if="!subs.length && !error" class="shrink-0 rounded-2xl bg-slate-900/40 light:bg-white/40 border border-slate-800/80 light:border-slate-200/80 p-12 text-center text-xs text-slate-500">
      No subscription yet. Use <b>Connect a flow</b> to start an automation when a Data Object changes.
    </div>

    <div v-else-if="subs.length" class="flex-1 min-h-0 overflow-y-auto rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200">
      <table class="w-full text-left text-xs text-slate-300 light:text-slate-700">
        <thead class="sticky top-0 z-10 bg-slate-950/80 light:bg-white/80 border-b border-slate-800 light:border-slate-200 text-[11px] font-semibold text-slate-400 light:text-slate-600 uppercase tracking-wider backdrop-blur-sm">
          <tr>
            <th class="py-3 px-4">Subscription</th>
            <th class="py-3 px-4">Class</th>
            <th class="py-3 px-4">Events</th>
            <th class="py-3 px-4">Sent to</th>
            <th class="py-3 px-4">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/60 light:divide-slate-200/60">
          <tr v-for="s in subs" :key="s.id" class="align-top">
            <td class="py-2.5 px-4">
              <div class="font-medium text-slate-200 light:text-slate-800">{{ s.name }}</div>
              <div class="mt-0.5 flex flex-wrap gap-1">
                <span v-if="!s.enabled" class="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 text-[10px] uppercase">paused</span>
                <span v-if="s.signingSecretRef" class="px-1.5 py-0.5 rounded bg-sky-900/60 text-sky-300 text-[10px] uppercase" :title="`Signed with the key in ${s.signingSecretRef}`">signed</span>
                <span v-if="!s.endpointId || !s.routeId" class="px-1.5 py-0.5 rounded bg-rose-900/60 text-rose-300 text-[10px] uppercase" title="The endpoint or route was deleted: choose another">no target</span>
              </div>
            </td>
            <td class="py-2.5 px-4">{{ className(s.classId) }}</td>
            <td class="py-2.5 px-4">
              <span v-for="e in s.events" :key="e" class="inline-block mr-1 mb-1 px-1.5 py-0.5 rounded bg-slate-800 light:bg-slate-200 font-mono text-[10px]">{{ e.replace('object.', '') }}</span>
            </td>
            <td class="py-2.5 px-4 font-mono break-all">
              {{ target(s) }}
              <template v-if="switchOf(s)">
                <span class="ml-1 px-1.5 py-0.5 rounded text-[10px] uppercase font-sans" :class="switchOf(s)!.mode === 'test' ? 'bg-amber-900/60 text-amber-300' : 'bg-emerald-900/60 text-emerald-300'">{{ switchOf(s)!.mode }}</span>
                <button type="button" class="ml-1 btn btn-link text-[10px] font-sans" :title="`Send to the ${switchOf(s)!.mode === 'test' ? 'live' : 'test'} address instead`" @click="switchMode(s)">switch to {{ switchOf(s)!.mode === 'test' ? 'live' : 'test' }}</button>
              </template>
            </td>
            <td class="py-2.5 px-4">
              <div class="flex items-center gap-1">
                <button type="button" class="btn btn-link" title="Delivery log" @click="openLog(s)"><ListChecks class="w-3.5 h-3.5" /></button>
                <button type="button" class="btn btn-link" title="Send a test event now" :disabled="!s.endpointId || !s.routeId" @click="test(s)"><Send class="w-3.5 h-3.5" /></button>
                <button type="button" class="btn btn-link" title="Edit" @click="openEditor(s)"><Pencil class="w-3.5 h-3.5" /></button>
                <button type="button" class="btn btn-link" :title="s.enabled ? 'Pause: no event is queued while paused' : 'Resume'" @click="toggle(s)">
                  <Pause v-if="s.enabled" class="w-3.5 h-3.5" /><Play v-else class="w-3.5 h-3.5" />
                </button>
                <button type="button" class="btn btn-link-danger" title="Delete (its delivery log goes too)" @click="remove(s)"><Trash2 class="w-3.5 h-3.5" /></button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <ObjectEventsWizard v-if="wizardOpen" @close="wizardOpen = false" @done="wizardOpen = false; refresh()" />

    <!-- The editor -->
    <BaseModal v-if="form" :open="true" size="lg" persistent @close="form = null">
      <template #header>
        <h2 class="ui-modal-title flex items-center gap-2"><Radio class="w-4 h-4" /> {{ editingId ? 'Edit subscription' : 'New subscription' }}</h2>
      </template>
      <div class="space-y-4 text-xs">
        <label class="block">
          <span class="block mb-1 text-slate-400">Name</span>
          <input v-model="form.name" class="field w-full" placeholder="e.g. New contacts to the CRM flow" maxlength="120" />
        </label>
        <div class="grid grid-cols-2 gap-3">
          <label class="block">
            <span class="block mb-1 text-slate-400">Class</span>
            <select v-model="form.classId" class="field w-full">
              <option value="">Every class</option>
              <option v-for="c in classesStore.classes" :key="c.id" :value="c.id">{{ c.label || c.name }}</option>
            </select>
          </label>
          <label class="flex items-end gap-2 pb-1.5 text-slate-300">
            <input v-model="form.enabled" type="checkbox" /> Active (untick to pause)
          </label>
        </div>

        <fieldset>
          <legend class="mb-1 text-slate-400">Send an event when a record is</legend>
          <label v-for="c in EVENT_CHOICES" :key="c.type" class="flex items-start gap-2 py-0.5">
            <input v-model="form.events" type="checkbox" :value="c.type" class="mt-0.5" />
            <span><b>{{ c.label }}</b> <span class="text-slate-500">- {{ c.hint }}</span></span>
          </label>
        </fieldset>

        <div class="grid grid-cols-2 gap-3">
          <label class="block">
            <span class="block mb-1 text-slate-400">Integrations endpoint</span>
            <select v-model="form.endpointId" class="field w-full" @change="form.routeId = ''; loadRoutes()">
              <option value="" disabled>Choose...</option>
              <option v-for="e in gatewayStore.activeEndpoints" :key="e.id" :value="e.id">{{ e.name }}</option>
            </select>
          </label>
          <label class="block">
            <span class="block mb-1 text-slate-400">Route (POST, PUT or PATCH, fixed path)</span>
            <select v-model="form.routeId" class="field w-full" :disabled="!form.endpointId">
              <option value="" disabled>{{ form.endpointId ? (routes.length ? 'Choose...' : 'No usable route') : 'Choose an endpoint first' }}</option>
              <option v-for="r in routes" :key="r.id" :value="r.id">{{ r.method }} {{ r.path }}</option>
            </select>
          </label>
        </div>
        <p class="text-slate-500">
          The call goes through the Integrations gateway: its credentials, address checks and allow-list apply. For a service on this machine
          or network the gateway may need <code class="font-mono">OUTBOUND_ALLOW_HOSTS</code>.
        </p>

        <details class="rounded-lg border border-slate-800 light:border-slate-200 p-3">
          <summary class="cursor-pointer text-slate-300">Advanced: signature and loop guard</summary>
          <div class="mt-3 space-y-3">
            <label class="block">
              <span class="block mb-1 text-slate-400">Signing key (name of an environment variable of the gateway)</span>
              <input v-model="form.signingSecretRef" class="field w-full font-mono" :placeholder="`${SECRET_PREFIX}ENGINE`" />
              <span class="block mt-1 text-slate-500">
                The key itself is never stored here. The call then carries <code class="font-mono">X-Whoobe-Signature: sha256=...</code> (HMAC of
                <code class="font-mono">timestamp.body</code>) and <code class="font-mono">X-Whoobe-Timestamp</code>; refuse stamps older than 5 minutes.
              </span>
            </label>
            <label class="block">
              <span class="block mb-1 text-slate-400">Ignore changes made by (user or API client ids)</span>
              <textarea v-model="form.ignoreActors" rows="2" class="field w-full font-mono" placeholder="the API client the automation writes back with" />
              <span class="block mt-1 text-slate-500">Stops a loop: a record the automation itself writes does not start it again.</span>
            </label>
          </div>
        </details>
        <p v-if="formError" class="rounded-lg bg-rose-950/40 border border-rose-800 p-2 text-rose-300">{{ formError }}</p>
      </div>
      <template #footer>
        <button type="button" class="btn btn-secondary" @click="form = null">Cancel</button>
        <button type="button" class="btn btn-primary" :disabled="saving" @click="save">{{ saving ? 'Saving...' : 'Save' }}</button>
      </template>
    </BaseModal>

    <!-- The delivery log -->
    <BaseModal v-if="logFor" :open="true" size="xl" @close="closeLog">
      <template #header>
        <h2 class="ui-modal-title flex items-center gap-2"><ListChecks class="w-4 h-4" /> Delivery log - {{ logFor.name }}</h2>
      </template>
      <div class="space-y-3 text-xs">
        <div class="flex items-center gap-3">
          <select v-model="logStatus" class="field" @change="loadLog">
            <option value="">All</option>
            <option v-for="(t, k) in STATUS_TEXT" :key="k" :value="k">{{ t }}</option>
          </select>
          <button type="button" class="btn btn-secondary flex items-center gap-1.5" :disabled="logLoading" @click="loadLog">
            <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': logLoading }" /> Refresh
          </button>
          <button type="button" class="btn btn-secondary flex items-center gap-1.5" :disabled="!logFor.endpointId || !logFor.routeId" @click="test(logFor)">
            <Send class="w-3.5 h-3.5" /> Send a test event
          </button>
          <span class="text-slate-500">The log shows what happened to each delivery, not the content of the event or the answer. It refreshes every 5 seconds.</span>
        </div>
        <p v-if="logError" class="rounded-lg bg-rose-950/40 border border-rose-800 p-2 text-rose-300">{{ logError }}</p>
        <p v-else-if="!logRows.length && !logLoading" class="p-8 text-center text-slate-500">Nothing yet.</p>
        <table v-else class="w-full text-left text-slate-300 light:text-slate-700">
          <thead class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            <tr><th class="py-2 pr-3">Status</th><th class="py-2 pr-3">Event</th><th class="py-2 pr-3">Record</th><th class="py-2 pr-3">When</th><th class="py-2 pr-3">Tries</th><th class="py-2 pr-3">Next try</th><th class="py-2 pr-3">Last problem</th><th class="py-2"></th></tr>
          </thead>
          <tbody class="divide-y divide-slate-800/60 light:divide-slate-200/60">
            <tr v-for="d in logRows" :key="d.id" class="align-top">
              <td class="py-2 pr-3"><span class="px-1.5 py-0.5 rounded text-[10px] uppercase" :class="statusTone(d.status)">{{ STATUS_TEXT[d.status] }}</span></td>
              <td class="py-2 pr-3 font-mono">{{ d.event.type.replace('object.', '') }}<span v-if="d.event.test" class="ml-1 px-1 rounded bg-indigo-900/60 text-indigo-300 text-[10px] uppercase font-sans">test</span></td>
              <td class="py-2 pr-3 font-mono text-[11px]">{{ d.event.objectId ? d.event.objectId.slice(0, 8) : '-' }}</td>
              <td class="py-2 pr-3 whitespace-nowrap" :title="new Date(d.event.occurredAt).toLocaleString()">{{ relativeTime(d.event.occurredAt) }}</td>
              <td class="py-2 pr-3">{{ d.attempts }}</td>
              <td class="py-2 pr-3 whitespace-nowrap">{{ nextAttemptText(d) || '-' }}</td>
              <td class="py-2 pr-3 break-words max-w-[22rem] text-slate-400">{{ d.lastError || '' }}</td>
              <td class="py-2"><button v-if="d.status === 'dead'" type="button" class="btn btn-primary" @click="retry(d)">Retry</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
// Subscriptions to object events and their delivery log (docs/plans/datamodel/data-objects-automations.md, object-events-phase0.md).
// Admin only (`object_events:manage`): the server refuses everyone else and says so here. The call itself is made by the Integrations
// gateway, so the editor picks an existing endpoint and route instead of asking for a URL.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ListChecks, Pause, Pencil, Play, Plug, Plus, Radio, RefreshCw, Send, Trash2 } from '@lucide/vue'
import BaseModal from '../components/ui/BaseModal.vue'
import ObjectEventsWizard from '../components/objects/ObjectEventsWizard.vue'
import { useAuthStore } from '../stores/authStore'
import { useDataClassesStore } from '../stores/dataClassesStore'
import { useGatewayStore } from '../stores/gatewayStore'
import { listRoutes, type GatewayRoute } from '../utils/gateway-api'
import {
  createSubscription, deleteSubscription, listDeliveries, listSubscriptions, retryDelivery, sendTestEvent, updateSubscription,
  type DeliveryStatus, type ObjectEventDelivery, type ObjectEventSubscription,
} from '../utils/object-events-api'
import { modeSwitch } from '../utils/object-events-wizard'
import {
  EVENT_CHOICES, SECRET_PREFIX, STATUS_TEXT, emptyForm, formFromSubscription, formProblem, nextAttemptText, relativeTime, statusTone, toInput, usableRoute,
  type SubscriptionForm,
} from '../utils/object-events-ui'

const authStore = useAuthStore()
const classesStore = useDataClassesStore()
const gatewayStore = useGatewayStore()
const coreUrl = () => authStore.config.coreApiUrl

const subs = ref<ObjectEventSubscription[]>([])
const loading = ref(false)
const error = ref('')
const notice = ref('')

const form = ref<SubscriptionForm | null>(null)
const editingId = ref('')
const formError = ref('')
const saving = ref(false)
const routes = ref<GatewayRoute[]>([])
const wizardOpen = ref(false)
// the routes of each endpoint a subscription uses, to offer the Test / Live switch of a pair of addresses
const endpointRoutes = ref<Record<string, GatewayRoute[]>>({})

const logFor = ref<ObjectEventSubscription | null>(null)
const logRows = ref<ObjectEventDelivery[]>([])
const logStatus = ref<'' | DeliveryStatus>('')
const logLoading = ref(false)
const logError = ref('')
let logTimer: ReturnType<typeof setInterval> | undefined

const className = (id: string | null) => (id ? (classesStore.classes.find((c) => c.id === id)?.label || classesStore.classes.find((c) => c.id === id)?.name || 'unknown class') : 'Every class')
function target(s: ObjectEventSubscription): string {
  const e = gatewayStore.endpoints.find((x) => x.id === s.endpointId)
  return e ? e.name : '-'
}
function switchOf(s: ObjectEventSubscription) {
  if (!s.endpointId || !s.routeId) return null
  const list = endpointRoutes.value[s.endpointId] ?? []
  const cur = list.find((r) => r.id === s.routeId)
  return cur ? modeSwitch(cur, list) : null
}
async function switchMode(s: ObjectEventSubscription) {
  const sw = switchOf(s)
  if (!sw) return
  try { await updateSubscription(coreUrl(), s.id, { routeId: sw.other.id }); await refresh(); flash(`"${s.name}" now sends to the ${sw.mode === 'test' ? 'live' : 'test'} address.`) } catch (e: any) { error.value = e?.message || 'Could not switch' }
}
function flash(text: string) { notice.value = text; setTimeout(() => { if (notice.value === text) notice.value = '' }, 4000) }

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    const [list] = await Promise.all([listSubscriptions(coreUrl()), gatewayStore.refreshEndpoints().catch(() => undefined), classesStore.refreshDataClasses()])
    subs.value = list
    const ids = [...new Set(list.map((x) => x.endpointId).filter((x): x is string => !!x))]
    const loaded: Record<string, GatewayRoute[]> = {}
    await Promise.all(ids.map(async (id) => { loaded[id] = await listRoutes(id).catch(() => []) }))
    endpointRoutes.value = loaded
  } catch (e: any) {
    error.value = e?.message || 'Could not load the subscriptions'
  } finally {
    loading.value = false
  }
}

async function loadRoutes(keep = '') {
  routes.value = []
  if (!form.value?.endpointId) return
  try {
    routes.value = (await listRoutes(form.value.endpointId)).filter(usableRoute)
    if (keep && !routes.value.some((r) => r.id === keep)) form.value.routeId = ''
  } catch { /* the select stays empty and says so */ }
}

async function openEditor(s?: ObjectEventSubscription) {
  formError.value = ''
  editingId.value = s?.id ?? ''
  form.value = s ? formFromSubscription(s) : emptyForm()
  await loadRoutes(form.value.routeId)
}

async function save() {
  if (!form.value) return
  formError.value = formProblem(form.value)
  if (formError.value) return
  saving.value = true
  try {
    const input = toInput(form.value)
    if (editingId.value) await updateSubscription(coreUrl(), editingId.value, input)
    else await createSubscription(coreUrl(), input)
    form.value = null
    await refresh()
  } catch (e: any) {
    formError.value = e?.message || 'Could not save'
  } finally {
    saving.value = false
  }
}

async function toggle(s: ObjectEventSubscription) {
  try { await updateSubscription(coreUrl(), s.id, { enabled: !s.enabled }); await refresh() } catch (e: any) { error.value = e?.message || 'Could not change it' }
}
async function remove(s: ObjectEventSubscription) {
  if (!confirm(`Delete "${s.name}" and its delivery log? Events already waiting for it are not sent.`)) return
  try { await deleteSubscription(coreUrl(), s.id); await refresh() } catch (e: any) { error.value = e?.message || 'Could not delete' }
}
async function test(s: ObjectEventSubscription) {
  try {
    await sendTestEvent(coreUrl(), s.id)
    flash(`A test event was queued for "${s.name}". It is sent within a few seconds.`)
    if (logFor.value?.id === s.id) setTimeout(loadLog, 1500)
  } catch (e: any) { error.value = e?.message || 'Could not queue the test' }
}

async function loadLog() {
  if (!logFor.value) return
  logLoading.value = true
  try {
    logRows.value = await listDeliveries(coreUrl(), logFor.value.id, logStatus.value || undefined)
    logError.value = ''
  } catch (e: any) { logError.value = e?.message || 'Could not read the log' } finally { logLoading.value = false }
}
function openLog(s: ObjectEventSubscription) {
  logFor.value = s
  logStatus.value = ''
  logRows.value = []
  void loadLog()
  logTimer = setInterval(loadLog, 5000)
}
function closeLog() {
  logFor.value = null
  if (logTimer) clearInterval(logTimer)
}
async function retry(d: ObjectEventDelivery) {
  try { await retryDelivery(coreUrl(), d.id); await loadLog() } catch (e: any) { logError.value = e?.message || 'Could not retry' }
}

onMounted(refresh)
onBeforeUnmount(() => { if (logTimer) clearInterval(logTimer) })
</script>
