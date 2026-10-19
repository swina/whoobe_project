<template>
  <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-5" data-testid="oidc-card">
    <div>
      <h3 class="font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider text-xs">Single sign-on</h3>
      <p class="text-xs text-slate-500 mt-1">
        Let staff sign in with your identity provider (Keycloak, Microsoft Entra, Okta, Google ...) using OpenID Connect. Local accounts stay: they are the way in when the provider is down.
        For SAML or LDAP, put a broker such as Keycloak in front.
      </p>
    </div>

    <div v-if="loading" class="text-xs text-slate-500">Loading...</div>

    <form v-else-if="settings" @submit.prevent="save" class="space-y-5">
      <label class="flex items-center gap-2 text-sm text-slate-200 light:text-slate-800">
        <input type="checkbox" v-model="enabled" data-testid="oidc-enabled" />
        <span>Single sign-on is on</span>
      </label>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="sm:col-span-2">
          <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1" for="oidc-issuer">Issuer address</label>
          <input id="oidc-issuer" v-model="issuer" type="url" placeholder="https://keycloak.example.com/realms/acme" class="field w-full" data-testid="oidc-issuer" />
          <p class="text-xs text-slate-500 mt-1">Exactly the provider's issuer; its <code>/.well-known/openid-configuration</code> is read from here.</p>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1" for="oidc-client">Client ID</label>
          <input id="oidc-client" v-model="clientId" type="text" class="field w-full" data-testid="oidc-client-id" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1" for="oidc-secret">
            Client secret <span v-if="settings.hasClientSecret" class="text-slate-500">(set - leave blank to keep it)</span><span v-else class="text-slate-500">(none: a public client with PKCE)</span>
          </label>
          <input id="oidc-secret" v-model="clientSecret" type="password" autocomplete="new-password" class="field w-full" data-testid="oidc-client-secret" />
          <label v-if="settings.hasClientSecret" class="flex items-center gap-2 text-xs text-slate-400 mt-1"><input type="checkbox" v-model="clearSecret" /> Remove the stored secret</label>
        </div>
        <div class="sm:col-span-2">
          <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1" for="oidc-base">Address the provider calls back (core-api)</label>
          <input id="oidc-base" v-model="redirectBaseUrl" type="url" placeholder="https://dashboard.example.com" class="field w-full" data-testid="oidc-base-url" />
          <p class="text-xs text-slate-500 mt-1">
            Register this redirect address at the provider:
            <code class="break-all">{{ redirectBaseUrl ? redirectBaseUrl.replace(/\/+$/, '') + '/auth/oidc/callback' : '(this address)/auth/oidc/callback' }}</code>
          </p>
        </div>
        <div class="sm:col-span-2">
          <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1" for="oidc-dash">Address of the dashboard (where people land)</label>
          <input id="oidc-dash" v-model="dashboardUrl" type="url" placeholder="blank = the same address" class="field w-full" data-testid="oidc-dashboard-url" />
          <p class="text-xs text-slate-500 mt-1">Behind one proxy both addresses are the same: leave this blank. In development the dashboard and core-api have different ports.</p>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1" for="oidc-label">Button text</label>
          <input id="oidc-label" v-model="label" type="text" maxlength="60" class="field w-full" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1" for="oidc-scopes">Scopes</label>
          <input id="oidc-scopes" v-model="scopes" type="text" class="field w-full" />
        </div>
      </div>

      <fieldset class="space-y-3">
        <legend class="text-xs font-medium text-slate-300 light:text-slate-700">Roles from the provider</legend>
        <div>
          <label class="block text-xs text-slate-400 mb-1" for="oidc-role-claim">Claim that holds the groups or roles</label>
          <input id="oidc-role-claim" v-model="roleClaim" type="text" placeholder="groups  (Keycloak realm roles: realm_access.roles)" class="field w-full" data-testid="oidc-role-claim" />
        </div>
        <div v-for="(row, i) in mapping" :key="i" class="flex items-center gap-2">
          <input v-model="row.value" type="text" placeholder="value in the claim" class="field flex-1" :data-testid="`oidc-map-value-${i}`" />
          <span class="text-xs text-slate-500">gives</span>
          <select v-model="row.roleId" class="field flex-1" :data-testid="`oidc-map-role-${i}`">
            <option value="" disabled>role</option>
            <option v-for="r in settings.roles ?? []" :key="r.id" :value="r.id">{{ r.name }}</option>
          </select>
          <button type="button" class="btn btn-secondary" @click="mapping.splice(i, 1)">Remove</button>
        </div>
        <button type="button" class="btn btn-secondary" @click="mapping.push({ value: '', roleId: '' })" data-testid="oidc-add-mapping">Add a mapping</button>
        <p class="text-xs text-slate-500">
          At every sign-in the roles listed here follow the claim: granted when the value is there, taken away when it is not. Roles you give by hand are not touched.
          A person who would end up with no role is refused.
        </p>
      </fieldset>

      <fieldset class="space-y-2">
        <legend class="text-xs font-medium text-slate-300 light:text-slate-700">Who may sign in</legend>
        <label class="flex items-center gap-2 text-sm text-slate-200 light:text-slate-800">
          <input type="checkbox" v-model="autoProvision" data-testid="oidc-auto-provision" />
          <span>Create an account for a person the provider knows and Whoobe does not</span>
        </label>
        <div v-if="autoProvision" class="pl-6 space-y-1">
          <p class="text-xs text-slate-400">Default roles for a new person whose claim matches no mapping:</p>
          <label v-for="role in settings.roles ?? []" :key="role.id" class="flex items-center gap-2 text-sm text-slate-200 light:text-slate-800">
            <input type="checkbox" :value="role.id" v-model="defaultRoleIds" /><span>{{ role.name }}</span>
          </label>
        </div>
        <label class="flex items-center gap-2 text-sm text-slate-200 light:text-slate-800">
          <input type="checkbox" v-model="linkByEmail" />
          <span>Link to an existing account with the same e-mail address (only when the provider says it verified it)</span>
        </label>
        <div>
          <label class="block text-xs text-slate-400 mb-1" for="oidc-local">The password form</label>
          <select id="oidc-local" v-model="localLogin" class="field w-full sm:w-80" data-testid="oidc-local-login">
            <option value="all">works for everybody</option>
            <option value="admins">works only for users who can manage users (the break-glass)</option>
          </select>
        </div>
        <p class="text-xs text-slate-500">
          A person who signs in through the provider uses the provider's own second factor: the two-factor requirement above applies to the password form.
          A deactivated account is refused here and, if the provider deactivates the person, they cannot start a new session; sessions already open run to their end.
        </p>
      </fieldset>

      <div v-if="testResult" :class="['px-3 py-2 rounded-lg border text-xs', testResult.ok ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300' : 'bg-rose-950/60 border-rose-800 text-rose-300']" data-testid="oidc-test-result">
        {{ testResult.ok ? 'The provider answered: ' + testResult.authorizationEndpoint : 'The provider could not be read: ' + testResult.error }}
      </div>
      <div v-if="error" class="px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">{{ error }}</div>
      <div v-if="saved" class="px-3 py-2 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs">Saved.</div>

      <div class="flex gap-2">
        <button type="submit" :disabled="saving" class="btn btn-primary" data-testid="oidc-save">{{ saving ? 'Saving...' : 'Save' }}</button>
        <button type="button" class="btn btn-secondary" :disabled="testing || !settings.issuer" @click="test" data-testid="oidc-test">{{ testing ? 'Testing...' : 'Test the saved address' }}</button>
      </div>
    </form>

    <div v-else-if="error" class="px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { fetchOidcSettings, saveOidcSettings, testOidcSettings, type OidcSettingsView, type OidcRoleMapping } from '../../utils/oidc-settings-api'
import { useAuthStore } from '../../stores/authStore'

const authStore = useAuthStore()

const loading = ref(true)
const saving = ref(false)
const testing = ref(false)
const saved = ref(false)
const error = ref('')
const settings = ref<OidcSettingsView | null>(null)
const testResult = ref<{ ok: boolean; error?: string; authorizationEndpoint?: string } | null>(null)

const enabled = ref(false)
const label = ref('Single sign-on')
const issuer = ref('')
const clientId = ref('')
const clientSecret = ref('')
const clearSecret = ref(false)
const redirectBaseUrl = ref('')
const dashboardUrl = ref('')
const scopes = ref('openid email profile')
const roleClaim = ref('')
const mapping = ref<OidcRoleMapping[]>([])
const defaultRoleIds = ref<string[]>([])
const autoProvision = ref(false)
const linkByEmail = ref(true)
const localLogin = ref<'all' | 'admins'>('all')

function fill(s: OidcSettingsView) {
  settings.value = s
  enabled.value = s.enabled
  label.value = s.label
  issuer.value = s.issuer ?? ''
  clientId.value = s.clientId ?? ''
  clientSecret.value = ''
  clearSecret.value = false
  redirectBaseUrl.value = s.redirectBaseUrl ?? ''
  dashboardUrl.value = s.dashboardUrl ?? ''
  scopes.value = s.scopes
  roleClaim.value = s.roleClaim ?? ''
  mapping.value = s.roleMapping.map((m) => ({ ...m }))
  defaultRoleIds.value = [...s.defaultRoleIds]
  autoProvision.value = s.autoProvision
  linkByEmail.value = s.linkByEmail
  localLogin.value = s.localLogin
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    fill(await fetchOidcSettings(authStore.config.coreApiUrl))
  } catch (e: any) {
    error.value = e?.message || 'Failed to load the single sign-on settings'
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  saved.value = false
  error.value = ''
  testResult.value = null
  try {
    const roles = settings.value?.roles
    const result = await saveOidcSettings(authStore.config.coreApiUrl, {
      enabled: enabled.value,
      label: label.value,
      issuer: issuer.value.trim() || null,
      clientId: clientId.value.trim() || null,
      clientSecret: clientSecret.value,
      clearClientSecret: clearSecret.value,
      redirectBaseUrl: redirectBaseUrl.value.trim() || null,
      dashboardUrl: dashboardUrl.value.trim() || null,
      scopes: scopes.value,
      roleClaim: roleClaim.value.trim() || null,
      roleMapping: mapping.value.filter((m) => m.value.trim() && m.roleId),
      defaultRoleIds: autoProvision.value ? defaultRoleIds.value : [],
      autoProvision: autoProvision.value,
      linkByEmail: linkByEmail.value,
      localLogin: localLogin.value,
    })
    fill({ ...result, roles })
    saved.value = true
  } catch (e: any) {
    error.value = e?.message || 'Failed to save'
  } finally {
    saving.value = false
  }
}

async function test() {
  testing.value = true
  testResult.value = null
  try {
    testResult.value = await testOidcSettings(authStore.config.coreApiUrl)
  } catch (e: any) {
    testResult.value = { ok: false, error: e?.message || 'Failed' }
  } finally {
    testing.value = false
  }
}

onMounted(load)
</script>
