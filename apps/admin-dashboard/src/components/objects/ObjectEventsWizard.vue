<template>
  <BaseModal :open="true" size="xl" persistent @close="emit('close')">
    <template #header>
      <h2 class="ui-modal-title flex items-center gap-2"><Plug class="w-4 h-4" /> {{ result ? 'Flow connected' : 'Connect a flow' }}</h2>
    </template>

    <!-- 1-3: the questions -->
    <div v-if="!result" class="space-y-5 text-xs">
      <p class="text-slate-400">
        Four answers set up everything: the Integrations endpoint and routes, the subscription and, if the flow writes back, a restricted API client.
        Whoobe does not run the flow and does not prefer an engine: use the one you chose.
      </p>

      <section class="space-y-3">
        <h3 class="font-semibold text-slate-200 light:text-slate-800">1. What happens in Whoobe</h3>
        <div class="grid grid-cols-2 gap-3">
          <label class="block">
            <span class="block mb-1 text-slate-400">Class</span>
            <select v-model="classId" class="field w-full" @change="suggestName">
              <option value="">Every class</option>
              <option v-for="c in classesStore.classes" :key="c.id" :value="c.id">{{ c.label || c.name }}</option>
            </select>
          </label>
          <label class="block">
            <span class="block mb-1 text-slate-400">Name of the connection</span>
            <input v-model="name" class="field w-full" maxlength="100" placeholder="e.g. New contacts to the CRM flow" @input="nameTouched = true" />
          </label>
        </div>
        <fieldset>
          <legend class="mb-1 text-slate-400">Start the flow when</legend>
          <label v-for="p in PRESETS" :key="p.key" class="flex items-start gap-2 py-0.5">
            <input v-model="presets" type="checkbox" :value="p.key" class="mt-0.5" />
            <span><b>{{ p.label }}</b> <span class="text-slate-500">- {{ p.hint }}</span></span>
          </label>
          <details class="mt-1">
            <summary class="cursor-pointer text-slate-400">More events</summary>
            <label v-for="c in MORE_EVENTS" :key="c.type" class="flex items-start gap-2 py-0.5 ml-3">
              <input v-model="extra" type="checkbox" :value="c.type" class="mt-0.5" />
              <span><b>{{ c.label }}</b> <span class="text-slate-500">- {{ c.hint }}</span></span>
            </label>
          </details>
        </fieldset>
      </section>

      <section class="space-y-3">
        <h3 class="font-semibold text-slate-200 light:text-slate-800">2. Where is the flow</h3>
        <div class="grid grid-cols-[1fr_12rem] gap-3">
          <label class="block">
            <span class="block mb-1 text-slate-400">Webhook URL (the one your engine shows for the flow's trigger)</span>
            <input v-model="url" class="field w-full font-mono" placeholder="http://localhost:8090/api/v1/webhooks/..." spellcheck="false" />
          </label>
          <label class="block">
            <span class="block mb-1 text-slate-400">Engine</span>
            <select v-model="engineChoice" class="field w-full">
              <option value="auto">Detect from the URL</option>
              <option value="nodered">Node-RED</option>
              <option value="generic">Other</option>
            </select>
          </label>
        </div>
        <p v-if="urlError" class="text-rose-300">{{ urlError }}</p>
        <div v-else-if="parsed" class="rounded-lg border border-slate-800 light:border-slate-200 p-3 space-y-1 text-slate-300 light:text-slate-700">
          <div>Recognised: <b>{{ ENGINE_LABEL[parsed.engine] }}</b> at <span class="font-mono">{{ parsed.baseUrl }}</span></div>
          <div v-for="r in routePreview" :key="r.path" class="font-mono text-[11px]">POST {{ r.path }} <span class="text-slate-500">({{ r.mode === 'single' ? 'one address' : r.mode === 'test' ? 'test: only while the editor listens' : 'live: the published flow' }})</span></div>
          <p v-if="hint" class="text-amber-300">{{ hint }}</p>
        </div>
        <label v-if="parsed && (parsed.engine === 'generic')" class="block">
          <span class="block mb-1 text-slate-400">Optional: the test URL of the same server, if the engine has one</span>
          <input v-model="otherUrl" class="field w-full font-mono" spellcheck="false" />
          <span v-if="otherError" class="block mt-1 text-rose-300">{{ otherError }}</span>
        </label>
        <div v-if="routePreview.length > 1" class="flex items-center gap-4">
          <span class="text-slate-400">Send to</span>
          <label class="flex items-center gap-1"><input v-model="startMode" type="radio" value="test" /> test address</label>
          <label class="flex items-center gap-1"><input v-model="startMode" type="radio" value="live" /> live address</label>
          <span class="text-slate-500">(you can switch later from the list)</span>
        </div>
      </section>

      <section class="space-y-2">
        <h3 class="font-semibold text-slate-200 light:text-slate-800">3. Does the flow write back to the record?</h3>
        <label class="flex items-start gap-2">
          <input v-model="writeBack" type="checkbox" class="mt-0.5" :disabled="!classId" />
          <span>
            Yes, create an API client for it. <span class="text-slate-500">It can read and write <b>drafts of this class only</b>; its changes are ignored by this connection, so the flow does not start itself again. The key is shown once.</span>
            <span v-if="!classId" class="block text-slate-500">Choose a class first.</span>
          </span>
        </label>
      </section>

      <p v-if="!canGateway" class="rounded-lg bg-amber-950/40 border border-amber-800 p-2 text-amber-300">
        Creating the endpoint, routes and API client needs the permission <span class="font-mono">gateway:manage</span>, which you do not have. Ask an administrator, or create a subscription in the normal editor on an existing endpoint.
      </p>
      <p v-if="problem" class="rounded-lg bg-rose-950/40 border border-rose-800 p-2 text-rose-300">{{ problem }}</p>
    </div>

    <!-- 4: result and test -->
    <div v-else class="space-y-4 text-xs">
      <p class="rounded-lg bg-emerald-950/40 border border-emerald-800 p-2 text-emerald-300">
        "{{ result.name }}" is set up and active.{{ currentMode === 'single' ? '' : ` It is sending to the ${currentMode} address of the flow.` }}
      </p>

      <section class="space-y-2">
        <h3 class="font-semibold text-slate-200 light:text-slate-800">Test</h3>
        <div class="flex items-center gap-3 flex-wrap">
          <button type="button" class="btn btn-primary flex items-center gap-1.5" :disabled="testing" @click="runTest">
            <Send class="w-3.5 h-3.5" /> {{ testing ? 'Sending...' : 'Send a test event' }}
          </button>
          <template v-if="result.routes.length > 1">
            <span class="text-slate-400">Address</span>
            <button v-for="r in result.routes" :key="r.id" type="button" class="btn" :class="r.mode === currentMode ? 'btn-primary' : 'btn-secondary'" :disabled="switching || r.mode === currentMode" @click="switchTo(r)">{{ r.mode }}</button>
          </template>
        </div>
        <p v-if="testOutcome" class="rounded-lg border p-2" :class="testOutcome.tone === 'ok' ? 'border-emerald-800 text-emerald-300 bg-emerald-950/40' : testOutcome.tone === 'wait' ? 'border-slate-700 text-slate-300' : 'border-rose-800 text-rose-300 bg-rose-950/40'">{{ testOutcome.text }}</p>
        <p v-if="parsed && currentMode === 'test' && engineHelp" class="text-slate-500">{{ engineHelp }}</p>
      </section>

      <section v-if="result.client" class="space-y-2">
        <h3 class="font-semibold text-slate-200 light:text-slate-800">The flow writes back: the HTTP step</h3>
        <div v-if="result.client.key" class="rounded-lg border border-amber-800 bg-amber-950/30 p-3 space-y-1">
          <div class="text-amber-300">Copy the key now: it is shown only this once.</div>
          <div class="flex items-center gap-2"><code class="font-mono break-all flex-1">{{ result.client.key }}</code><button type="button" class="btn btn-secondary" @click="copy(result.client.key!)">{{ copied === result.client.key ? 'Copied' : 'Copy' }}</button></div>
        </div>
        <div v-if="nodeRed" class="rounded-lg border border-slate-800 light:border-slate-200 p-3 space-y-2">
          <div class="font-semibold">Node-RED: the function node that updates the record</div>
          <ol class="list-decimal ml-4 text-slate-400"><li v-for="st in nodeRed.steps" :key="st">{{ st }}</li></ol>
          <pre class="font-mono bg-slate-950/50 rounded p-2 overflow-x-auto whitespace-pre">{{ nodeRed.code }}</pre>
          <div><button type="button" class="btn btn-secondary" @click="copy(nodeRed.code)">{{ copied === nodeRed.code ? 'Copied' : 'Copy the code' }}</button></div>
          <div class="font-semibold">Environment of the Node-RED container</div>
          <pre class="font-mono bg-slate-950/50 rounded p-2 overflow-x-auto whitespace-pre">{{ nodeRed.env.map((e) => `${e.name}=${e.value}`).join('\n') }}</pre>
          <ul class="list-disc ml-4 text-slate-400"><li v-for="n in nodeRed.notes" :key="n">{{ n }}</li></ul>
        </div>
        <div v-else-if="snippet" class="rounded-lg border border-slate-800 light:border-slate-200 p-3 space-y-1">
          <div><b>Method</b> <span class="font-mono">{{ snippet.method }}</span></div>
          <div><b>URL</b> <code class="font-mono break-all">{{ snippet.url }}</code></div>
          <div v-for="h in snippet.headers" :key="h.name"><b>Header</b> <code class="font-mono">{{ h.name }}</code>: <code class="font-mono break-all">{{ h.value }}</code></div>
          <div><b>Body (JSON)</b></div>
          <pre class="font-mono bg-slate-950/50 rounded p-2 overflow-x-auto">{{ snippet.body }}</pre>
          <div class="flex gap-2"><button type="button" class="btn btn-secondary" @click="copy(snippet.url)">Copy URL</button></div>
          <ul class="list-disc ml-4 text-slate-400"><li v-for="n in snippet.notes" :key="n">{{ n }}</li></ul>
        </div>
      </section>
    </div>

    <template #footer>
      <template v-if="!result">
        <button type="button" class="btn btn-secondary" @click="emit('close')">Cancel</button>
        <button type="button" class="btn btn-primary" :disabled="running || !canGateway" @click="connect">{{ running ? 'Connecting...' : 'Connect' }}</button>
      </template>
      <button v-else type="button" class="btn btn-primary" @click="emit('done')">Done</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
// "Connect a flow": one dialog that sets up the Integrations endpoint and routes, the subscription and, when the flow writes back, a restricted API
// client, from a pasted webhook URL. All the logic is in utils/object-events-wizard.ts (unit-tested); this only asks the questions and calls the existing APIs.
// Plan: docs/plans/automations/object-events-connect-wizard.md.
import { computed, onMounted, ref } from 'vue'
import { Plug, Send } from '@lucide/vue'
import BaseModal from '../ui/BaseModal.vue'
import { useAuthStore } from '../../stores/authStore'
import { useDataClassesStore } from '../../stores/dataClassesStore'
import { useGatewayStore } from '../../stores/gatewayStore'
import {
  clientApiBaseUrl, createApiClient, listApiClients, createEndpoint, createRoute, deleteApiClient, deleteEndpoint, deleteRoute, listRoutes,
} from '../../utils/gateway-api'
import { createSubscription, deleteSubscription, listDeliveries, sendTestEvent, updateSubscription } from '../../utils/object-events-api'
import type { ObjectEventType } from '../../utils/object-events-api'
import { EVENT_CHOICES } from '../../utils/object-events-ui'
import {
  ConnectionError, ENGINE_LABEL, PRESETS, nodeRedSnippet, type EngineChoice, describeDelivery, describeFailure, engineSnippet, eventsOfPresets, parseWebhookUrl, planConnection, reachabilityHint,
  routesOf, runPlan, type ConnectionResult, type ParsedWebhook, type PresetKey, type WizardApi,
} from '../../utils/object-events-wizard'

const emit = defineEmits<{ (e: 'close'): void; (e: 'done'): void }>()
const authStore = useAuthStore()
const classesStore = useDataClassesStore()
const gatewayStore = useGatewayStore()
const coreUrl = () => authStore.config.coreApiUrl
const canGateway = computed(() => authStore.can('gateway:manage'))

const MORE_EVENTS = EVENT_CHOICES.filter((c) => ['object.deleted', 'object.transitioned', 'object.bulk'].includes(c.type))

const classId = ref('')
const name = ref('')
const nameTouched = ref(false)
const presets = ref<PresetKey[]>(['created'])
const extra = ref<ObjectEventType[]>([])
const url = ref('')
const engineChoice = ref<EngineChoice>('auto')
const otherUrl = ref('')
const startMode = ref<'test' | 'live'>('test')
const writeBack = ref(false)
const problem = ref('')
const running = ref(false)

const classOf = () => classesStore.classes.find((c) => c.id === classId.value)
function suggestName() {
  if (nameTouched.value) return
  const c = classOf()
  name.value = c ? `${c.label || c.name} events` : ''
  if (!classId.value) writeBack.value = false
}

const parsedResult = computed(() => (url.value.trim() ? parseWebhookUrl(url.value, engineChoice.value) : null))
const parsed = computed<ParsedWebhook | null>(() => (parsedResult.value?.ok ? parsedResult.value.value : null))
const urlError = computed(() => (parsedResult.value && !parsedResult.value.ok ? parsedResult.value.error : ''))
const otherResult = computed(() => (otherUrl.value.trim() ? parseWebhookUrl(otherUrl.value, engineChoice.value) : null))
const otherParsed = computed<ParsedWebhook | null>(() => (otherResult.value?.ok ? otherResult.value.value : null))
const otherError = computed(() => (otherResult.value && !otherResult.value.ok ? otherResult.value.error : parsed.value && otherParsed.value && otherParsed.value.baseUrl !== parsed.value.baseUrl ? 'This is another server: use one connection for each.' : ''))
const routePreview = computed(() => (parsed.value ? routesOf(parsed.value, otherError.value ? null : otherParsed.value) : []))
const hint = computed(() => (parsed.value ? reachabilityHint(parsed.value) : ''))
const isNodeRed = computed(() => parsed.value?.engine === 'nodered')

// ---- connecting ----
const result = ref<(ConnectionResult & { name: string; routes: { id: string; mode: 'live' | 'test' | 'single' }[] }) | null>(null)
const currentMode = ref<'live' | 'test' | 'single'>('single')

function api(): WizardApi {
  return {
    createEndpoint: async (i) => createEndpoint({ name: i.name, baseUrl: i.baseUrl, authType: i.authType }),
    createRoute: async (i) => createRoute({ endpointId: i.endpointId, path: i.path, method: i.method }),
    createClient: async (i) => {
      const r = await createApiClient({ name: i.name, authMode: 'key', scopes: i.scopes })
      return { id: r.client.id, key: r.plaintext ?? null }
    },
    createSubscription: (i) => createSubscription(coreUrl(), i),
    deleteEndpoint, deleteRoute, deleteClient: deleteApiClient,
    deleteSubscription: (id) => deleteSubscription(coreUrl(), id),
  }
}

async function connect() {
  problem.value = ''
  if (!parsed.value) { problem.value = urlError.value || 'Paste the webhook URL of the flow'; return }
  if (otherError.value) { problem.value = otherError.value; return }
  const c = classOf()
  const answers = {
    name: name.value, classId: classId.value || null, className: c?.name ?? '', events: eventsOfPresets(presets.value, extra.value),
    webhook: parsed.value, otherWebhook: otherParsed.value, startMode: startMode.value, writeBack: writeBack.value,
  }
  running.value = true
  try {
    await gatewayStore.refreshEndpoints()
    const routesByEndpoint: Record<string, { id: string; method: string; path: string }[]> = {}
    for (const e of gatewayStore.endpoints) routesByEndpoint[e.id] = await listRoutes(e.id).catch(() => [])
    const clientNames = writeBack.value ? (await listApiClients()).map((x) => x.name) : []
    const planned = planConnection(answers, gatewayStore.endpoints, (id) => routesByEndpoint[id] ?? [], clientNames)
    if (!planned.ok) { problem.value = planned.error; return }
    const done = await runPlan(planned.plan, api())
    currentMode.value = planned.plan.subscription.startRoute
    result.value = { ...done, name: answers.name.trim(), routes: done.routeIds }
    await gatewayStore.refreshEndpoints().catch(() => undefined)
  } catch (e: any) {
    problem.value = e instanceof ConnectionError ? describeFailure(e) : e?.message || 'Could not connect'
  } finally {
    running.value = false
  }
}

// ---- the test and the switch ----
const testing = ref(false)
const switching = ref(false)
const testOutcome = ref<{ tone: 'ok' | 'wait' | 'problem'; text: string } | null>(null)
const copied = ref('')

const engineHelp = computed(() =>
  parsed.value?.engine === 'activepieces' ? 'In Activepieces open the flow and click "Test trigger" so it is listening, then send the test event.'
    : parsed.value?.engine === 'n8n' ? 'In n8n open the Webhook node and click "Listen for test event", then send the test event.' : '')

async function runTest() {
  if (!result.value) return
  testing.value = true
  testOutcome.value = null
  const since = Date.now() - 2000
  try {
    await sendTestEvent(coreUrl(), result.value.subscriptionId)
    const end = Date.now() + 12_000
    let last: Awaited<ReturnType<typeof listDeliveries>>[number] | null = null
    while (Date.now() < end) {
      await new Promise((r) => setTimeout(r, 1200))
      const rows = await listDeliveries(coreUrl(), result.value.subscriptionId, undefined, 5)
      last = rows.find((d) => d.event.test && new Date(d.createdAt).getTime() >= since) ?? null
      if (last && last.status !== 'pending' && (last.status === 'delivered' || last.lastError)) break
    }
    testOutcome.value = describeDelivery(last ? { status: last.status, lastError: last.lastError } : null, currentMode.value, parsed.value?.engine ?? 'generic')
  } catch (e: any) {
    testOutcome.value = { tone: 'problem', text: e?.message || 'Could not send the test event' }
  } finally {
    testing.value = false
  }
}

async function switchTo(r: { id: string; mode: 'live' | 'test' | 'single' }) {
  if (!result.value) return
  switching.value = true
  try {
    await updateSubscription(coreUrl(), result.value.subscriptionId, { routeId: r.id })
    currentMode.value = r.mode
    testOutcome.value = null
  } catch (e: any) {
    testOutcome.value = { tone: 'problem', text: e?.message || 'Could not switch the address' }
  } finally {
    switching.value = false
  }
}

const nodeRed = computed(() =>
  result.value?.client && isNodeRed.value ? nodeRedSnippet({ clientBase: clientApiBaseUrl(), key: result.value.client.key }) : null)
const snippet = computed(() =>
  result.value?.client && classOf() && !isNodeRed.value
    ? engineSnippet({ engine: parsed.value?.engine ?? 'generic', clientBase: clientApiBaseUrl(), className: classOf()!.name, key: result.value.client.key })
    : null)

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); copied.value = text; setTimeout(() => { if (copied.value === text) copied.value = '' }, 2000) } catch { /* the text is on screen */ }
}

onMounted(() => { void classesStore.refreshDataClasses().catch(() => undefined) })
</script>
