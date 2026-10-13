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
        <button type="button" class="btn btn-primary flex items-center gap-1.5" @click="openCreate">
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
                <button type="button" class="btn btn-link" title="Edit" @click="openEdit(c)"><Pencil class="w-3.5 h-3.5" /></button>
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

    <!-- Create / edit -->
    <BaseModal v-if="showForm" :open="true" size="lg" @close="showForm = false">
      <template #header>
        <h2 class="ui-modal-title flex items-center gap-2">{{ editing ? 'Edit client' : 'New client' }}</h2>
      </template>
      <div class="space-y-4">
        <div>
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Name</label>
            <input v-model="form.name" type="text" maxlength="80" placeholder="ERP sync, mobile app back-end…" class="field w-full" />
          </div>
        </div>
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
        <div>
          <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Description <span class="text-slate-600">(optional)</span></label>
          <input v-model="form.description" type="text" maxlength="500" class="field w-full" />
        </div>
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

        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700">What this client may call</label>
            <span class="text-[11px] text-slate-500">{{ form.scopes.size }} selected</span>
          </div>
          <div class="max-h-64 overflow-y-auto rounded-lg border border-slate-800 light:border-slate-200 divide-y divide-slate-800/60 light:divide-slate-200/60">
            <p v-if="!endpoints.length" class="p-3 text-xs text-slate-500">No endpoint yet. Add one in Integrations.</p>
            <div v-for="ep in endpoints" :key="ep.id" class="p-2.5">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-200 light:text-slate-800">{{ ep.name }}</span>
                <span v-if="ep.name.includes(':')" class="text-[11px] text-rose-400">name contains “:”, rename it to use it here</span>
                <label v-else class="flex items-center gap-1.5 text-[11px] text-amber-400 cursor-pointer" title="Every route of the endpoint, any method, including routes added later">
                  <input type="checkbox" :checked="form.scopes.has(wide(ep.name))" @change="toggleScope(wide(ep.name))" /> all routes
                </label>
              </div>
              <div v-if="!ep.name.includes(':')" class="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                <label v-for="r in (routes[ep.id] ?? [])" :key="r.id"
                  class="flex items-center gap-1.5 text-[11px] font-mono cursor-pointer" :class="form.scopes.has(wide(ep.name)) ? 'opacity-40' : ''">
                  <input type="checkbox" :checked="form.scopes.has(scopeOf(ep.name, r))" :disabled="form.scopes.has(wide(ep.name))" @change="toggleScope(scopeOf(ep.name, r))" />
                  <span class="font-bold">{{ r.method }}</span> <span class="truncate" :title="r.path">{{ r.path }}</span>
                </label>
                <span v-if="!(routes[ep.id] ?? []).length" class="text-[11px] text-slate-500">No routes.</span>
              </div>
            </div>
          </div>
          <div class="mt-2 rounded-lg border border-slate-800 light:border-slate-200 p-2.5">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-slate-200 light:text-slate-800">Data Objects <span class="font-normal text-slate-500">(read, published only)</span></span>
              <label class="flex items-center gap-1.5 text-[11px] text-amber-400 cursor-pointer" title="Every class, including classes created later">
                <input type="checkbox" :checked="form.scopes.has('data:read:*')" @change="toggleScope('data:read:*')" /> all classes
              </label>
            </div>
            <div class="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
              <label v-for="dc in dataClasses" :key="dc.id" class="flex items-center gap-1.5 text-[11px] font-mono cursor-pointer" :class="form.scopes.has('data:read:*') ? 'opacity-40' : ''">
                <input type="checkbox" :checked="form.scopes.has(`data:read:${dc.name}`)" :disabled="form.scopes.has('data:read:*') || dc.name.includes(':')" @change="toggleScope(`data:read:${dc.name}`)" />
                <span class="truncate" :title="dc.name.includes(':') ? 'name contains “:”, rename it to use it here' : dc.name">{{ dc.name }}</span>
              </label>
              <span v-if="!dataClasses.length" class="text-[11px] text-slate-500">No Data Class yet.</span>
            </div>
          </div>
          <div v-if="otherScopes.length" class="mt-2 text-[11px] text-slate-500">
            Other scopes kept as they are:
            <span v-for="s in otherScopes" :key="s" class="inline-flex items-center gap-1 mr-2 font-mono">
              {{ s }} <button type="button" class="text-rose-400" title="Remove" @click="toggleScope(s)">×</button>
            </span>
          </div>
        </div>
        <div v-if="formError" class="px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">{{ formError }}</div>
      </div>
      <template #footer>
        <button type="button" class="btn btn-secondary light:hover:bg-slate-300" @click="showForm = false">Cancel</button>
        <button type="button" class="btn btn-primary" :disabled="saving" @click="save">{{ saving ? 'Saving...' : editing ? 'Save' : form.authMode === 'jwt' ? 'Create' : 'Create and show key' }}</button>
      </template>
    </BaseModal>

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
// Applications that call the Integrations with a key (docs/plans/api-gateway/client-access-hub.md, phase 1). Scopes are one text each,
// `gateway:call:<endpoint>:<METHOD>:<route>`; the picker writes them from the endpoints and routes that exist, and any scope it does not
// recognise stays listed so saving the form never drops it silently.
import { computed, onMounted, reactive, ref } from 'vue'
import { Ban, KeyRound, Pause, Pencil, Play, Plus, RefreshCw, Trash2 } from '@lucide/vue'
import BaseModal from '../components/ui/BaseModal.vue'
import { useAuthStore } from '../stores/authStore'
import { fetchDataClasses, type DataClass } from '../utils/data-classes-api'
import {
  addApiClientKey, clientApiBaseUrl, createApiClient, deleteApiClient, listApiClients, listEndpoints, listRoutes, revokeApiClientKey, updateApiClient,
  type ApiClient, type ApiClientKey, type GatewayEndpoint, type GatewayRoute,
} from '../utils/gateway-api'

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
    // a rule can only grant what the client has: drop ticks of a route that was unticked
    claimScopes: j.claimScopes.filter((r) => r.claim.trim() || r.value.trim()),
  }
}

const clients = ref<ApiClient[]>([])
const endpoints = ref<GatewayEndpoint[]>([])
const routes = ref<Record<string, GatewayRoute[]>>({})
const loading = ref(false)
const error = ref('')
const authStore = useAuthStore()
const dataClasses = ref<DataClass[]>([])
const apiBase = clientApiBaseUrl()

const showForm = ref(false)
const editing = ref<ApiClient | null>(null)
const saving = ref(false)
const formError = ref('')
const form = reactive({
  name: '', description: '', authMode: 'key' as 'key' | 'jwt', rateLimitRps: 10, dailyQuota: null as number | null,
  expiresAt: '', allowedIps: '', scopes: new Set<string>(),
  jwt: emptyJwt(),
})
const revealed = ref<{ name: string; key: string } | null>(null)
const copied = ref(false)

const wide = (endpoint: string) => `gateway:call:${endpoint}:*:*`
// the dashboard writes a route without its leading slash, as the gateway reads it
const scopeOf = (endpoint: string, r: GatewayRoute) => `gateway:call:${endpoint}:${r.method.toUpperCase()}:${r.path.replace(/^\/+/, '')}`
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

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    const [c, e, dcs] = await Promise.all([listApiClients(), listEndpoints(), fetchDataClasses(authStore.config.coreApiUrl).catch(() => [])])
    dataClasses.value = dcs
    clients.value = c
    endpoints.value = e
    const entries = await Promise.all(e.map(async (ep) => [ep.id, await listRoutes(ep.id).catch(() => [] as GatewayRoute[])] as const))
    routes.value = Object.fromEntries(entries)
  } catch (e: any) {
    error.value = e?.message || 'Could not load the clients. Is the gateway running?'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = null
  Object.assign(form, { name: '', description: '', authMode: 'key', rateLimitRps: 10, dailyQuota: null, expiresAt: '', allowedIps: '', scopes: new Set<string>(), jwt: emptyJwt() })
  formError.value = ''
  showForm.value = true
}
function openEdit(c: ApiClient) {
  editing.value = c
  Object.assign(form, {
    name: c.name, description: c.description, authMode: c.authMode, jwt: jwtToForm(c.jwtConfig), rateLimitRps: c.rateLimitRps, dailyQuota: c.dailyQuota,
    expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : '', allowedIps: (c.allowedIps ?? []).join(', '), scopes: new Set(c.scopes),
  })
  formError.value = ''
  showForm.value = true
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
    } else {
      const out = await createApiClient(input)
      // a token client has no key to show
      if (out.plaintext) revealed.value = { name: out.client.name, key: out.plaintext }
    }
    showForm.value = false
    await refresh()
  } catch (e: any) {
    formError.value = e?.message || 'Could not save'
  } finally {
    saving.value = false
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
</script>
