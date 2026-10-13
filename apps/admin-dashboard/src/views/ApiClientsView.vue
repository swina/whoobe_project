<template>
  <div class="flex flex-col h-full gap-6">
    <div class="shrink-0 flex items-center justify-between gap-4">
      <div>
        <h2 class="text-xl font-bold text-slate-100 light:text-slate-900">API clients</h2>
        <p class="text-xs text-slate-400 light:text-slate-600">
          Servers outside Whoobe (a back-end, a job, another system) that call your Integrations through a key, without a user account.
          Each client gets only the routes you tick, its own limits, and a key you can rotate or revoke.
        </p>
        <p class="mt-1 text-xs text-slate-500">
          An application calls <code class="font-mono text-slate-300 light:text-slate-700">{{ apiBase }}/gateway/&lt;endpoint&gt;/&lt;route&gt;</code>
          with <code class="font-mono">Authorization: Bearer &lt;key&gt;</code> (or the header <code class="font-mono">X-Whoobe-Key</code>).
          <b>&lt;endpoint&gt;</b> is the name of the endpoint as it is in Integrations (spaces become <code class="font-mono">%20</code>),
          <b>&lt;route&gt;</b> is the route path under it; <code class="font-mono">{id}</code> in a route is replaced by the value.
          Click an entry in <i>Allowed</i> to copy its full address.
        </p>
      </div>
      <div class="flex gap-2 shrink-0">
        <button type="button" class="btn btn-secondary flex items-center gap-1.5" :disabled="loading" @click="refresh">
          <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': loading }" /> Refresh
        </button>
        <button type="button" class="btn btn-primary flex items-center gap-1.5" @click="tabsStore.openApiClient()">
          <Plus class="w-3.5 h-3.5" /> New client
        </button>
      </div>
    </div>

    <p v-if="error" class="shrink-0 rounded-xl bg-rose-950/40 border border-rose-800 p-3 text-xs text-rose-300">{{ error }}</p>
    <div v-else-if="loading && !clients.length" class="shrink-0 p-12 text-center text-xs text-slate-500">Loading...</div>
    <div v-else-if="!clients.length" class="shrink-0 rounded-2xl bg-slate-900/40 light:bg-white/40 border border-slate-800/80 light:border-slate-200/80 p-12 text-center text-xs text-slate-500">
      No client yet. Create one to let an application use your Integrations.
    </div>

    <div v-else class="flex-1 min-h-0 overflow-y-auto rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200">
      <table class="w-full text-left text-xs text-slate-300 light:text-slate-700">
        <thead class="sticky top-0 z-10 bg-slate-950/80 light:bg-white/80 border-b border-slate-800 light:border-slate-200 text-[11px] font-semibold text-slate-400 light:text-slate-600 uppercase tracking-wider backdrop-blur-sm">
          <tr>
            <th class="py-3 px-4">Client</th>
            <th class="py-3 px-4">Allowed</th>
            <th class="py-3 px-4">Limits</th>
            <th class="py-3 px-4">Keys</th>
            <th class="py-3 px-4">Last used</th>
            <th class="py-3 px-4">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/60 light:divide-slate-200/60">
          <tr v-for="c in clients" :key="c.id" class="align-top">
            <td class="py-2.5 px-4">
              <div class="font-medium text-slate-200 light:text-slate-800">{{ c.name }}</div>
              <div class="mt-0.5 flex flex-wrap gap-1">
                <span v-if="c.authMode === 'jwt'" class="px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-300 text-[10px] uppercase" title="Tokens of an identity provider, validated by Whoobe">token</span>
                <span v-else class="px-1.5 py-0.5 rounded bg-sky-900/60 text-sky-300 text-[10px] uppercase" title="A static key, held by a server">key</span>
                <span v-if="c.status !== 'active'" class="px-1.5 py-0.5 rounded bg-rose-900/60 text-rose-300 text-[10px] uppercase">{{ c.status }}</span>
                <span v-if="isExpired(c.expiresAt)" class="px-1.5 py-0.5 rounded bg-rose-900/60 text-rose-300 text-[10px] uppercase">expired</span>
              </div>
              <div v-if="c.description" class="mt-1 text-slate-500">{{ c.description }}</div>
            </td>
            <td class="py-2.5 px-4">
              <button v-for="s in c.scopes.slice(0, 6)" :key="s" type="button" class="block text-left font-mono text-[11px] hover:text-indigo-300"
                :class="isWide(s) || s === 'data:read:*' ? 'text-amber-400' : ''" :title="`${callUrl(s)}\nClick to copy this address`" @click="copy(callUrl(s))">
                <template v-if="isData(s)"><span class="font-bold">GET</span> data<span class="text-slate-500"> /</span>{{ dataClassOf(s) === '*' ? '* (every class)' : dataClassOf(s) }}</template>
                <template v-else><span class="font-bold">{{ method(s) }}</span> {{ endpointOf(s) }}<span class="text-slate-500"> /</span>{{ routeOf(s) }}</template>
              </button>
              <div v-if="c.scopes.length > 6" class="text-slate-500">+ {{ c.scopes.length - 6 }} more</div>
              <div v-if="!c.scopes.length" class="text-slate-500">nothing yet</div>
            </td>
            <td class="py-2.5 px-4 whitespace-nowrap">
              {{ c.rateLimitRps }} / second<br />
              <span class="text-slate-500">{{ c.dailyQuota ? `${c.dailyQuota.toLocaleString()} / day` : 'no daily quota' }}</span>
              <div v-if="c.allowedIps?.length" class="text-slate-500" :title="c.allowedIps.join(', ')">{{ c.allowedIps.length }} address{{ c.allowedIps.length > 1 ? 'es' : '' }}</div>
            </td>
            <td class="py-2.5 px-4">
              <div v-if="c.authMode === 'jwt'" class="text-slate-400">
                no key<br /><span class="font-mono text-[11px] break-all" :title="'Audience: ' + (c.jwtConfig?.audience ?? []).join(', ')">{{ c.jwtConfig?.issuer }}</span>
              </div>
              <div v-for="k in c.keys" :key="k.id" class="flex items-center gap-2 font-mono text-[11px]" :class="k.revokedAt ? 'text-slate-600 line-through' : ''">
                <span>wbk_{{ k.prefix }}_…</span>
                <span v-if="k.label" class="font-sans text-slate-500 no-underline">{{ k.label }}</span>
                <button v-if="!k.revokedAt" type="button" class="btn btn-link-danger !p-0.5" title="Revoke this key" @click="revoke(c, k)"><Ban class="w-3 h-3" /></button>
              </div>
            </td>
            <td class="py-2.5 px-4 whitespace-nowrap">{{ c.lastUsedAt ? new Date(c.lastUsedAt).toLocaleString() : 'never' }}</td>
            <td class="py-2.5 px-4">
              <div class="flex items-center gap-1">
                <button type="button" class="btn btn-link" title="Edit" @click="tabsStore.openApiClient(c.id)"><Pencil class="w-3.5 h-3.5" /></button>
                <button v-if="c.authMode === 'key'" type="button" class="btn btn-link" title="Add a key (rotation: add, move the application, then revoke the old one)" @click="newKey(c)"><KeyRound class="w-3.5 h-3.5" /></button>
                <button type="button" class="btn btn-link" :title="c.status === 'active' ? 'Suspend: every key of this client stops working' : 'Activate'" @click="toggle(c)">
                  <Pause v-if="c.status === 'active'" class="w-3.5 h-3.5" /><Play v-else class="w-3.5 h-3.5" />
                </button>
                <button type="button" class="btn btn-link-danger" title="Delete" @click="remove(c)"><Trash2 class="w-3.5 h-3.5" /></button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- The key, once -->
    <BaseModal v-if="revealed" :open="true" size="md" @close="revealed = null">
      <template #header>
        <h2 class="ui-modal-title flex items-center gap-2"><KeyRound class="w-4 h-4" /> Key for {{ revealed.name }}</h2>
      </template>
      <div class="space-y-3">
        <p class="text-xs text-amber-400">Copy it now. It is shown only this once and cannot be shown again; if it is lost, add a new key and revoke this one.</p>
        <div class="flex gap-2">
          <input :value="revealed.key" readonly class="field w-full font-mono text-[11px]" @focus="($event.target as HTMLInputElement).select()" />
          <button type="button" class="btn btn-secondary" @click="copy(revealed.key)">{{ copied ? 'Copied' : 'Copy' }}</button>
        </div>
        <pre class="rounded-lg bg-slate-950 light:bg-slate-100 border border-slate-800 light:border-slate-200 p-3 text-[11px] overflow-x-auto">curl -H "Authorization: Bearer {{ revealed.key.slice(0, 13) }}…" \
  {{ apiBase }}/me</pre>
      </div>
      <template #footer>
        <button type="button" class="btn btn-primary" @click="revealed = null">I have copied it</button>
      </template>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
// The list of API clients (docs/plans/api-gateway/client-access-hub.md). Creating and editing happen in a main tab
// (components/api-clients/MasterApiClientTab.vue).
import { onMounted, ref, watch } from 'vue'
import { Ban, KeyRound, Pause, Pencil, Play, Plus, RefreshCw, Trash2 } from '@lucide/vue'
import BaseModal from '../components/ui/BaseModal.vue'
import { useTabsStore } from '../stores/tabsStore'
import {
  addApiClientKey, clientApiBaseUrl, deleteApiClient, listApiClients, revokeApiClientKey, updateApiClient,
  type ApiClient, type ApiClientKey,
} from '../utils/gateway-api'

const clients = ref<ApiClient[]>([])
const loading = ref(false)
const error = ref('')
const tabsStore = useTabsStore()
const apiBase = clientApiBaseUrl()

const revealed = ref<{ name: string; key: string } | null>(null)
const copied = ref(false)

const isData = (s: string) => s.startsWith('data:')
const dataClassOf = (s: string) => s.split(':').slice(2).join(':')
const isWide = (s: string) => s.endsWith(':*:*')
// gateway:call:<endpoint>:<METHOD>:<route> -> the parts, and the address an application calls
const partsOf = (s: string) => { const [, , endpoint = '', m = '', ...route] = s.split(':'); return { endpoint, method: m, route: route.join(':') } }
const method = (s: string) => (partsOf(s).method === '*' ? 'ANY' : partsOf(s).method)
const endpointOf = (s: string) => partsOf(s).endpoint
const routeOf = (s: string) => (partsOf(s).route === '*' ? '* (every route)' : partsOf(s).route)
const callUrl = (s: string) => {
  if (isData(s)) return `${apiBase}/data/${dataClassOf(s) === '*' ? '' : encodeURIComponent(dataClassOf(s))}`
  const p = partsOf(s)
  return `${apiBase}/gateway/${encodeURIComponent(p.endpoint)}/${p.route === '*' ? '' : p.route.replace(/\/\*$/, '/')}`
}
const isExpired = (d: string | null) => !!d && new Date(d).getTime() <= Date.now()

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    clients.value = await listApiClients()
  } catch (e: any) {
    error.value = e?.message || 'Could not load the clients. Is the gateway running?'
  } finally {
    loading.value = false
  }
}

async function newKey(c: ApiClient) {
  try {
    const out = await addApiClientKey(c.id, { label: `added ${new Date().toLocaleDateString()}` })
    revealed.value = { name: c.name, key: out.plaintext }
    await refresh()
  } catch (e: any) { error.value = e?.message || 'Could not add a key' }
}
async function revoke(c: ApiClient, k: ApiClientKey) {
  if (!confirm(`Revoke key wbk_${k.prefix}_… of "${c.name}"? An application using it stops working at once.`)) return
  try { await revokeApiClientKey(c.id, k.id); await refresh() } catch (e: any) { error.value = e?.message || 'Could not revoke' }
}
async function toggle(c: ApiClient) {
  try { await updateApiClient(c.id, { status: c.status === 'active' ? 'suspended' : 'active' }); await refresh() } catch (e: any) { error.value = e?.message || 'Could not change the status' }
}
async function remove(c: ApiClient) {
  if (!confirm(`Delete client "${c.name}" and all its keys? Applications using them stop working.`)) return
  try { await deleteApiClient(c.id); await refresh() } catch (e: any) { error.value = e?.message || 'Could not delete' }
}

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); copied.value = true; setTimeout(() => { copied.value = false }, 1500) } catch { /* select and copy by hand */ }
}

onMounted(refresh)
// the editor tab saved a client
watch(() => tabsStore.apiClientsRevision, refresh)
</script>
