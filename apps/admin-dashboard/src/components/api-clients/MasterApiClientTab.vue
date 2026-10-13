<template>
  <div class="h-full overflow-y-auto p-6">
    <div class="max-w-4xl mx-auto space-y-6">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h2 class="text-xl font-bold text-slate-100 light:text-slate-900 flex items-center gap-2"><KeyRound class="w-5 h-5" /> {{ editing ? form.name || 'API client' : 'New API client' }}</h2>
          <p class="text-xs text-slate-500">{{ editing ? 'Changes apply to the next call.' : 'Choose how it proves who it is, what it may call, and its limits.' }}</p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button type="button" class="btn btn-secondary light:hover:bg-slate-300" @click="tabsStore.closeTab(tabId)">Close</button>
          <button type="button" class="btn btn-primary" :disabled="saving || loading" @click="save">{{ saving ? 'Saving...' : editing ? 'Save' : form.authMode === 'jwt' ? 'Create' : 'Create and show key' }}</button>
        </div>
      </div>

      <p v-if="loadError" class="rounded-xl bg-rose-950/40 border border-rose-800 p-3 text-xs text-rose-300">{{ loadError }}</p>
      <div v-if="formError" class="px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">{{ formError }}</div>

      <section class="card-section space-y-4 rounded-2xl border border-slate-800 light:border-slate-200 bg-slate-900/40 light:bg-white/60 p-5">
        <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800">General</h3>
        <div>
          <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Name</label>
          <input v-model="form.name" type="text" maxlength="80" placeholder="ERP sync, mobile app back-end…" class="field w-full" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Description <span class="text-slate-600">(optional)</span></label>
          <input v-model="form.description" type="text" maxlength="500" class="field w-full" />
        </div>
      </section>

      <section class="space-y-4 rounded-2xl border border-slate-800 light:border-slate-200 bg-slate-900/40 light:bg-white/60 p-5">
        <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800">Authentication</h3>
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">How does it prove who it is?</label>
            <div class="grid grid-cols-2 gap-2">
              <label class="rounded-lg border p-2.5 text-xs cursor-pointer" :class="[form.authMode === 'key' ? 'border-indigo-500 bg-indigo-950/30' : 'border-slate-800 light:border-slate-200', editing ? 'opacity-60 !cursor-default' : '']">
                <input v-model="form.authMode" type="radio" value="key" class="mr-1.5" :disabled="!!editing" /><b>A key</b> (server to server)
                <span class="block mt-1 text-slate-500">For a back-end, a job, another system. Never in a web page or an app: a request that carries a key and comes from a browser is refused.</span>
              </label>
              <label class="rounded-lg border p-2.5 text-xs cursor-pointer" :class="[form.authMode === 'jwt' ? 'border-indigo-500 bg-indigo-950/30' : 'border-slate-800 light:border-slate-200', editing ? 'opacity-60 !cursor-default' : '']">
                <input v-model="form.authMode" type="radio" value="jwt" class="mr-1.5" :disabled="!!editing" /><b>Identity provider token</b> (browser, app)
                <span class="block mt-1 text-slate-500">The application signs in with your identity system (Keycloak, Entra ID, Cognito…) and sends its access token. Whoobe checks it; there is no secret.</span>
              </label>
            </div>
          </div>
          <div v-if="form.authMode === 'jwt'" class="space-y-3 rounded-lg border border-slate-800 light:border-slate-200 p-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Issuer <span class="text-slate-600">(the token's <code>iss</code>)</span></label>
                <input v-model="form.jwt.issuer" type="text" placeholder="https://idp.example.com/realms/acme" class="field w-full font-mono" />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Audience <span class="text-slate-600">(<code>aud</code>, comma separated)</span></label>
                <input v-model="form.jwt.audience" type="text" placeholder="whoobe-api" class="field w-full font-mono" />
              </div>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div>
                <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Authorized party <span class="text-slate-600">(<code>azp</code>, optional)</span></label>
                <input v-model="form.jwt.authorizedParty" type="text" placeholder="my-mobile-app" class="field w-full font-mono" />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Requests per second, per user</label>
                <input v-model.number="form.jwt.subjectRateLimitRps" type="number" min="1" max="1000" class="field w-full" />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Signing algorithms</label>
                <div class="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono pt-1.5">
                  <label v-for="a in ['RS256', 'ES256', 'PS256', 'EdDSA']" :key="a" class="flex items-center gap-1"><input v-model="form.jwt.algorithms" type="checkbox" :value="a" /> {{ a }}</label>
                </div>
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Keys address <span class="text-slate-600">(JWKS, optional: taken from the issuer's discovery document)</span></label>
              <input v-model="form.jwt.jwksUri" type="text" placeholder="https://idp.example.com/realms/acme/protocol/openid-connect/certs" class="field w-full font-mono" />
            </div>
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="block text-xs font-medium text-slate-300 light:text-slate-700">The token must carry <span class="text-slate-600">(optional)</span></label>
                <button type="button" class="btn btn-link text-[11px]" @click="form.jwt.requiredClaims.push({ claim: '', value: '' })">+ add</button>
              </div>
              <div v-for="(r, i) in form.jwt.requiredClaims" :key="i" class="flex gap-2 mb-1">
                <input v-model="r.claim" type="text" placeholder="claim (groups, realm_access.roles…)" class="field w-full font-mono text-[11px]" />
                <input v-model="r.value" type="text" placeholder="value" class="field w-full font-mono text-[11px]" />
                <button type="button" class="text-rose-400 px-1" @click="form.jwt.requiredClaims.splice(i, 1)">×</button>
              </div>
            </div>
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="block text-xs font-medium text-slate-300 light:text-slate-700">What each kind of user may call <span class="text-slate-600">(optional)</span></label>
                <button type="button" class="btn btn-link text-[11px]" @click="form.jwt.claimScopes.push({ claim: '', value: '', scopes: [] })">+ add a rule</button>
              </div>
              <p class="text-[11px] text-slate-500 mb-1">
                Without rules, every valid token may call everything ticked below. With rules, a user gets only what the rules that match their claims give,
                from the routes ticked below; a user who matches no rule is refused.
              </p>
              <div v-for="(r, i) in form.jwt.claimScopes" :key="i" class="rounded-md border border-slate-800 light:border-slate-200 p-2 mb-1.5 space-y-1">
                <div class="flex gap-2">
                  <input v-model="r.claim" type="text" placeholder="claim (realm_access.roles, scope…)" class="field w-full font-mono text-[11px]" />
                  <input v-model="r.value" type="text" placeholder="value (orders-reader)" class="field w-full font-mono text-[11px]" />
                  <button type="button" class="text-rose-400 px-1" @click="form.jwt.claimScopes.splice(i, 1)">×</button>
                </div>
                <div class="text-[11px] font-mono">
                  <span v-if="!form.scopes.size" class="text-slate-500">Tick routes below first.</span>
                  <label v-for="sc in [...form.scopes]" :key="sc" class="flex items-center gap-1.5"><input v-model="r.scopes" type="checkbox" :value="sc" /> {{ sc.replace(/^gateway:call:/, '') }}</label>
                </div>
              </div>
            </div>
          </div>
      </section>

      <section class="space-y-4 rounded-2xl border border-slate-800 light:border-slate-200 bg-slate-900/40 light:bg-white/60 p-5">
        <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800">Limits</h3>
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Requests per second</label>
            <input v-model.number="form.rateLimitRps" type="number" min="1" max="1000" class="field w-full" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Daily quota <span class="text-slate-600">(empty = none)</span></label>
            <input v-model.number="form.dailyQuota" type="number" min="1" class="field w-full" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Expires <span class="text-slate-600">(optional)</span></label>
            <input v-model="form.expiresAt" type="date" class="field w-full" />
          </div>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Allowed addresses <span class="text-slate-600">(optional, comma separated: 203.0.113.5, 10.0.0.0/8)</span></label>
          <input v-model="form.allowedIps" type="text" class="field w-full font-mono" />
        </div>
      </section>

      <section class="space-y-3 rounded-2xl border border-slate-800 light:border-slate-200 bg-slate-900/40 light:bg-white/60 p-5">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800">What this client may call</h3>
          <span class="text-[11px] text-slate-500">{{ form.scopes.size }} selected</span>
        </div>
        <div class="flex items-center gap-2">
          <select v-model="toAdd" class="field w-72" :disabled="!addable.length" @change="addApi">
            <option value="">{{ addable.length ? 'Add an API…' : 'Every API is already added' }}</option>
            <option v-for="a in addable" :key="a.key" :value="a.key">{{ a.label }}</option>
          </select>
          <span class="text-[11px] text-slate-500">Pick an API, then tick the routes this client may call.</span>
        </div>
        <p v-if="loading" class="text-xs text-slate-500">Loading…</p>
        <p v-else-if="!apiList.length" class="text-xs text-slate-500">No API yet. Add an endpoint in Integrations, or create a Data Class.</p>

        <div v-for="a in addedApis" :key="a.key" class="rounded-lg border border-slate-800 light:border-slate-200">
          <div class="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-800/60 light:border-slate-200/60">
            <div class="text-xs font-semibold text-slate-200 light:text-slate-800">
              {{ a.label }} <span class="font-normal text-slate-500">· {{ countFor(a) }} allowed</span>
            </div>
            <div class="flex items-center gap-3">
              <template v-if="a.kind === 'endpoint' && !a.name.includes(':')">
                <label class="flex items-center gap-1.5 text-[11px] text-amber-400 cursor-pointer" title="Every route of the endpoint, any method, including routes added later">
                  <input type="checkbox" :checked="form.scopes.has(wide(a.name))" @change="toggleScope(wide(a.name))" /> all routes
                </label>
              </template>
              <label v-else-if="a.kind === 'data'" class="flex items-center gap-1.5 text-[11px] text-amber-400 cursor-pointer" title="Every class, including classes created later">
                <input type="checkbox" :checked="form.scopes.has('data:read:*')" @change="toggleScope('data:read:*')" /> all classes
              </label>
              <button type="button" class="text-rose-400 px-1" title="Remove this API and its routes from the client" @click="removeApi(a)">×</button>
            </div>
          </div>
          <div class="p-3">
            <template v-if="a.kind === 'endpoint'">
              <p v-if="a.name.includes(':')" class="text-[11px] text-rose-400">The endpoint name contains “:”, rename it in Integrations to use it here.</p>
              <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                <label v-for="r in (routes[a.id] ?? [])" :key="r.id" class="flex items-center gap-1.5 text-[11px] font-mono cursor-pointer" :class="form.scopes.has(wide(a.name)) ? 'opacity-40' : ''">
                  <input type="checkbox" :checked="form.scopes.has(scopeOf(a.name, r))" :disabled="form.scopes.has(wide(a.name))" @change="toggleScope(scopeOf(a.name, r))" />
                  <span class="font-bold">{{ r.method }}</span> <span class="truncate" :title="r.path">{{ r.path }}</span>
                </label>
                <span v-if="!(routes[a.id] ?? []).length" class="text-[11px] text-slate-500">No routes.</span>
              </div>
            </template>
            <template v-else>
              <p class="text-[11px] text-slate-500 mb-1">Read of the published objects, <code class="font-mono">GET /data/&lt;class&gt;</code>.</p>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                <label v-for="dc in dataClasses" :key="dc.id" class="flex items-center gap-1.5 text-[11px] font-mono cursor-pointer" :class="form.scopes.has('data:read:*') ? 'opacity-40' : ''">
                  <input type="checkbox" :checked="form.scopes.has(`data:read:${dc.name}`)" :disabled="form.scopes.has('data:read:*') || dc.name.includes(':')" @change="toggleScope(`data:read:${dc.name}`)" />
                  <span class="truncate" :title="dc.name.includes(':') ? 'name contains “:”, rename it to use it here' : dc.name">{{ dc.name }}</span>
                </label>
                <span v-if="!dataClasses.length" class="text-[11px] text-slate-500">No Data Class yet.</span>
              </div>
            </template>
          </div>
        </div>

        <div v-if="otherScopes.length" class="text-[11px] text-slate-500">
          Other scopes kept as they are:
          <span v-for="s in otherScopes" :key="s" class="inline-flex items-center gap-1 mr-2 font-mono">
            {{ s }} <button type="button" class="text-rose-400" title="Remove" @click="toggleScope(s)">×</button>
          </span>
        </div>
      </section>
    </div>

    <!-- The key, once -->
    <BaseModal v-if="revealed" :open="true" size="md" @close="done">
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
        <button type="button" class="btn btn-primary" @click="done">I have copied it</button>
      </template>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
// The editor of one API client, in a main tab (docs/plans/api-gateway/client-access-hub.md). Scopes are one text each
// (`gateway:call:<endpoint>:<METHOD>:<route>`, `data:read:<Class>`); the picker writes them from the APIs and routes that exist, and any
// scope it does not recognise stays listed so saving never drops it silently.
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { KeyRound } from '@lucide/vue'
import BaseModal from '../ui/BaseModal.vue'
import { useAuthStore } from '../../stores/authStore'
import { useTabsStore } from '../../stores/tabsStore'
import { fetchDataClasses, type DataClass } from '../../utils/data-classes-api'
import {
  clientApiBaseUrl, createApiClient, listApiClients, listEndpoints, listRoutes, updateApiClient,
  type ApiClient, type GatewayEndpoint, type GatewayRoute,
} from '../../utils/gateway-api'

const props = defineProps<{ clientId: string; tabId: string }>()
const tabsStore = useTabsStore()
const authStore = useAuthStore()
const apiBase = clientApiBaseUrl()

interface JwtForm {
  issuer: string; audience: string; jwksUri: string; authorizedParty: string; subjectRateLimitRps: number | null
  algorithms: string[]; requiredClaims: { claim: string; value: string }[]; claimScopes: { claim: string; value: string; scopes: string[] }[]
}
function emptyJwt(): JwtForm {
  return { issuer: '', audience: '', jwksUri: '', authorizedParty: '', subjectRateLimitRps: null, algorithms: ['RS256', 'ES256'], requiredClaims: [], claimScopes: [] }
}
function jwtToForm(c: Record<string, any> | null | undefined): JwtForm {
  if (!c) return emptyJwt()
  return {
    issuer: c.issuer ?? '', audience: (c.audience ?? []).join(', '), jwksUri: c.jwksUri ?? '', authorizedParty: c.authorizedParty ?? '',
    subjectRateLimitRps: c.subjectRateLimitRps ?? null, algorithms: [...(c.algorithms ?? ['RS256', 'ES256'])],
    requiredClaims: (c.requiredClaims ?? []).map((r: any) => ({ ...r })), claimScopes: (c.claimScopes ?? []).map((r: any) => ({ ...r, scopes: [...r.scopes] })),
  }
}
function jwtFromForm(j: JwtForm) {
  return {
    issuer: j.issuer.trim(), audience: j.audience.split(',').map((a) => a.trim()).filter(Boolean), algorithms: j.algorithms,
    jwksUri: j.jwksUri.trim() || undefined, authorizedParty: j.authorizedParty.trim() || undefined,
    subjectRateLimitRps: j.subjectRateLimitRps || undefined,
    requiredClaims: j.requiredClaims.filter((r) => r.claim.trim() || r.value.trim()),
    claimScopes: j.claimScopes.filter((r) => r.claim.trim() || r.value.trim()),
  }
}

const isNew = props.clientId.startsWith('new:')
const editing = ref<ApiClient | null>(null)
const endpoints = ref<GatewayEndpoint[]>([])
const routes = ref<Record<string, GatewayRoute[]>>({})
const dataClasses = ref<DataClass[]>([])
const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const formError = ref('')
const form = reactive({
  name: '', description: '', authMode: 'key' as 'key' | 'jwt', rateLimitRps: 10, dailyQuota: null as number | null,
  expiresAt: '', allowedIps: '', scopes: new Set<string>(),
  jwt: emptyJwt(),
})
const revealed = ref<{ name: string; key: string } | null>(null)
const copied = ref(false)

// --- scopes ---------------------------------------------------------------------------------------------------------------------
const wide = (endpoint: string) => `gateway:call:${endpoint}:*:*`
const scopeOf = (endpoint: string, r: GatewayRoute) => `gateway:call:${endpoint}:${r.method.toUpperCase()}:${r.path.replace(/^\/+/, '')}`

type Api = { key: string; label: string } & ({ kind: 'endpoint'; id: string; name: string } | { kind: 'data'; id: ''; name: '' })
const apiList = computed<Api[]>(() => [
  ...endpoints.value.map((e): Api => ({ key: `ep:${e.name}`, label: e.name, kind: 'endpoint', id: e.id, name: e.name })),
  { key: 'data', label: 'Data Objects (published, read)', kind: 'data', id: '', name: '' },
])
// the APIs shown as cards: the ones the client already has something of, plus the ones just added
const added = ref<string[]>([])
const addedApis = computed(() => apiList.value.filter((a) => added.value.includes(a.key)))
const addable = computed(() => apiList.value.filter((a) => !added.value.includes(a.key)))
const toAdd = ref('')
function addApi() { if (toAdd.value && !added.value.includes(toAdd.value)) added.value.push(toAdd.value); toAdd.value = '' }
function scopesOfApi(a: Api): string[] {
  return [...form.scopes].filter((s) => (a.kind === 'data' ? s.startsWith('data:') : s.startsWith(`gateway:call:${a.name}:`)))
}
const countFor = (a: Api) => scopesOfApi(a).length
function removeApi(a: Api) {
  for (const s of scopesOfApi(a)) form.scopes.delete(s)
  added.value = added.value.filter((k) => k !== a.key)
}
const knownScopes = computed(() => {
  const set = new Set<string>(['data:read:*'])
  for (const dc of dataClasses.value) set.add(`data:read:${dc.name}`)
  for (const ep of endpoints.value) {
    set.add(wide(ep.name))
    for (const r of routes.value[ep.id] ?? []) set.add(scopeOf(ep.name, r))
  }
  return set
})
const otherScopes = computed(() => [...form.scopes].filter((s) => !knownScopes.value.has(s)))
function toggleScope(s: string) {
  if (form.scopes.has(s)) form.scopes.delete(s)
  else form.scopes.add(s)
}

// --- load / save ----------------------------------------------------------------------------------------------------------------
let snapshot = ''
const state = () => JSON.stringify({ ...form, scopes: [...form.scopes].sort() })
const dirty = computed(() => !loading.value && state() !== snapshot)
watch(dirty, (d) => tabsStore.setDirty(props.tabId, d))

function fill(c: ApiClient) {
  editing.value = c
  Object.assign(form, {
    name: c.name, description: c.description, authMode: c.authMode, jwt: jwtToForm(c.jwtConfig), rateLimitRps: c.rateLimitRps, dailyQuota: c.dailyQuota,
    expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : '', allowedIps: (c.allowedIps ?? []).join(', '), scopes: new Set(c.scopes),
  })
  added.value = apiList.value.filter((a) => scopesOfApi(a).length).map((a) => a.key)
  tabsStore.setTabLabel(props.tabId, c.name)
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [e, dcs, clients] = await Promise.all([
      listEndpoints(), fetchDataClasses(authStore.config.coreApiUrl).catch(() => [] as DataClass[]), isNew ? Promise.resolve([] as ApiClient[]) : listApiClients(),
    ])
    endpoints.value = e
    dataClasses.value = dcs
    const entries = await Promise.all(e.map(async (ep) => [ep.id, await listRoutes(ep.id).catch(() => [] as GatewayRoute[])] as const))
    routes.value = Object.fromEntries(entries)
    if (!isNew) {
      const c = clients.find((x) => x.id === props.clientId)
      if (!c) { loadError.value = 'This client no longer exists.'; return }
      fill(c)
    }
  } catch (err: any) {
    loadError.value = err?.message || 'Could not load. Is the gateway running?'
  } finally {
    loading.value = false
    snapshot = state()
  }
}

async function save() {
  formError.value = ''
  if (!form.name.trim()) { formError.value = 'Give the client a name'; return }
  const input = {
    name: form.name.trim(),
    description: form.description,
    authMode: form.authMode,
    ...(form.authMode === 'jwt' ? { jwt: jwtFromForm({ ...form.jwt, claimScopes: form.jwt.claimScopes.map((r) => ({ ...r, scopes: r.scopes.filter((x) => form.scopes.has(x)) })) }) } : {}),
    scopes: [...form.scopes],
    rateLimitRps: Number(form.rateLimitRps) || 10,
    dailyQuota: form.dailyQuota ? Number(form.dailyQuota) : null,
    allowedIps: form.allowedIps.split(',').map((s) => s.trim()).filter(Boolean),
    expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : null,
  }
  saving.value = true
  try {
    if (editing.value) {
      await updateApiClient(editing.value.id, input)
      snapshot = state()
      tabsStore.setDirty(props.tabId, false)
      tabsStore.setTabLabel(props.tabId, form.name.trim())
      tabsStore.apiClientsRevision++
    } else {
      const out = await createApiClient(input)
      snapshot = state()
      tabsStore.setDirty(props.tabId, false)
      tabsStore.apiClientsRevision++
      // a token client has no key to show; a key client shows it once, then the tab closes
      if (out.plaintext) revealed.value = { name: out.client.name, key: out.plaintext }
      else done()
    }
  } catch (err: any) {
    formError.value = err?.message || 'Could not save'
  } finally {
    saving.value = false
  }
}

function done() {
  revealed.value = null
  tabsStore.closeTab(props.tabId)
  tabsStore.openSection('api-clients')
}

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); copied.value = true; setTimeout(() => { copied.value = false }, 1500) } catch { /* select and copy by hand */ }
}

onMounted(load)
</script>
