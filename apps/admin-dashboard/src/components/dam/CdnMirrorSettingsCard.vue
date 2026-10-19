<template>
  <div class="rounded-2xl bg-slate-900/80 light:bg-white/80 border border-slate-800 light:border-slate-200 p-6 shadow-xl space-y-4" data-testid="cdn-card">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
        <CloudUpload class="w-5 h-5" />
      </div>
      <div>
        <h4 class="text-sm font-bold text-slate-100 light:text-slate-900 uppercase tracking-wider text-xs">CDN Mirroring</h4>
        <p v-if="!websiteId" class="text-xs text-slate-400 light:text-slate-600">
          The default of this installation: where "Publish to CDN" (Assets list) and the publication of every website that has no CDN of its own send assets.
          Each website can have its own under <em>Websites &rsaquo; Settings</em> (see <code class="text-slate-300">docs/plans/assets/cdn-providers-plan.md</code>).
        </p>
        <p v-else class="text-xs text-slate-400 light:text-slate-600">
          The CDN this website's publication mirrors its images to. Without one of its own, the website uses the installation's default (Settings &rsaquo; DAM).
        </p>
      </div>
    </div>

    <div v-if="loading" class="text-xs text-slate-500 text-center py-4">Loading…</div>

    <template v-else>
      <!-- A website: its own settings or the default -->
      <div v-if="websiteId" class="space-y-2">
        <label class="flex items-center gap-2 text-xs text-slate-300">
          <input type="radio" :value="false" v-model="useOwn" data-testid="cdn-use-default" />
          <span>Use the installation's default
            <span class="text-slate-500">({{ defaultSummary }})</span>
          </span>
        </label>
        <label class="flex items-center gap-2 text-xs text-slate-300">
          <input type="radio" :value="true" v-model="useOwn" data-testid="cdn-use-own" />
          <span>This website has its own CDN</span>
        </label>
      </div>

      <template v-if="!websiteId || useOwn">
        <label class="flex flex-col gap-1 text-xs text-slate-400 max-w-sm">
          Provider
          <select v-model="provider" class="field" data-testid="cdn-provider">
            <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.label }}</option>
          </select>
          <span class="text-slate-600">{{ current?.description }}</span>
        </label>

        <div v-if="current" class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <template v-for="f in current.fields" :key="f.name">
            <!-- Cloudinary's route: chosen from the Gateway endpoints -->
            <template v-if="f.name === 'gatewayRouteId'">
              <div v-if="endpoints.length === 0" class="md:col-span-2 px-3 py-2 rounded-lg bg-amber-900/30 border border-amber-700/40 text-xs text-amber-300">
                No Gateway endpoints configured yet. Add a Cloudinary endpoint under Integrations first (the Cloudinary preset already includes the upload route this needs).
              </div>
              <template v-else>
                <label class="flex flex-col gap-1 text-xs text-slate-400">
                  Gateway endpoint
                  <select v-model="selectedEndpointId" class="field">
                    <option value="" disabled>Choose an endpoint…</option>
                    <option v-for="ep in endpoints" :key="ep.id" :value="ep.id">{{ ep.name }}</option>
                  </select>
                </label>
                <label class="flex flex-col gap-1 text-xs text-slate-400">
                  {{ f.label }}
                  <div v-if="loadingRoutes" class="text-slate-500 py-1.5">Loading routes…</div>
                  <select v-else v-model="config.gatewayRouteId" class="field">
                    <option value="" disabled>Choose a route…</option>
                    <option v-for="r in routes" :key="r.id" :value="r.id">{{ r.method }} {{ r.path }}</option>
                  </select>
                </label>
              </template>
            </template>

            <label v-else class="flex flex-col gap-1 text-xs text-slate-400">
              <span>{{ f.label }}<span v-if="f.required" class="text-rose-400"> *</span>
                <span v-if="f.secret && secretsSet[f.name]" class="text-slate-500"> (set - leave blank to keep it)</span>
              </span>
              <input
                v-if="f.secret"
                v-model="secrets[f.name]" type="password" autocomplete="new-password" class="field" :data-testid="`cdn-field-${f.name}`"
              />
              <input v-else v-model="config[f.name]" type="text" :placeholder="f.placeholder" class="field" :data-testid="`cdn-field-${f.name}`" />
              <span v-if="f.help" class="text-slate-600">{{ f.help }}</span>
            </label>
          </template>
        </div>
      </template>

      <div v-if="error" class="px-3 py-2 rounded-lg bg-rose-900/30 border border-rose-700/40 text-xs text-rose-300" data-testid="cdn-error">{{ error }}</div>
      <div v-if="testResult" :class="['px-3 py-2 rounded-lg border text-xs', testResult.ok ? 'bg-emerald-900/30 border-emerald-700/40 text-emerald-300' : 'bg-rose-900/30 border-rose-700/40 text-rose-300']" data-testid="cdn-test-result">
        {{ testResult.ok ? 'The provider answered: the settings work.' : 'The test failed: ' + testResult.error }}
      </div>

      <div class="flex items-center gap-3 pt-1">
        <button type="button" :disabled="saving" class="btn btn-primary" data-testid="cdn-save" @click="save">
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <button type="button" :disabled="testing" class="btn btn-secondary" data-testid="cdn-test" @click="runTest">
          {{ testing ? 'Testing…' : 'Test' }}
        </button>
        <span v-if="saveOk" class="text-xs text-emerald-400">Saved.</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
// CDN mirroring settings (docs/plans/assets/cdn-providers-plan.md): the provider and ITS fields (Cloudinary: a Gateway route and a preset; Cloudflare
// Images: an account id and an API token). Used twice: as the installation's default (Settings > DAM, no prop) and per website (the website's settings,
// with `websiteId`), where "use the default" removes the website's own settings.
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { CloudUpload } from '@lucide/vue'
import { getDefaultCoreApiUrl } from '../../utils/auth-api'
import {
  fetchCdnMirrorSettings, fetchCdnProviders, removeCdnMirrorSettings, saveCdnMirrorSettings, testCdnMirrorSettings,
  type CdnMirrorSettings, type CdnProviderInfo,
} from '../../utils/websites-api'
import { listEndpoints, listRoutes, type GatewayEndpoint, type GatewayRoute } from '../../utils/gateway-api'

const props = defineProps<{ websiteId?: string }>()
const base = () => getDefaultCoreApiUrl()

const loading = ref(true)
const providers = ref<CdnProviderInfo[]>([])
const provider = ref('cloudinary')
const config = reactive<Record<string, string>>({})
const secrets = reactive<Record<string, string>>({})
const secretsSet = ref<Record<string, boolean>>({})
const useOwn = ref(false)
const defaultSettings = ref<CdnMirrorSettings | null>(null)

const endpoints = ref<GatewayEndpoint[]>([])
const routes = ref<GatewayRoute[]>([])
const loadingRoutes = ref(false)
const selectedEndpointId = ref('')

const saving = ref(false)
const testing = ref(false)
const saveOk = ref(false)
const error = ref('')
const testResult = ref<{ ok: boolean; error?: string } | null>(null)

const current = computed(() => providers.value.find((p) => p.id === provider.value))
const defaultSummary = computed(() => {
  const d = defaultSettings.value
  if (!d || d.scope === 'none') return 'not set up'
  const label = providers.value.find((p) => p.id === d.provider)?.label ?? d.provider
  return d.configured ? label : `${label}, incomplete`
})

function fill(s: CdnMirrorSettings) {
  provider.value = s.provider
  for (const k of Object.keys(config)) delete config[k]
  for (const k of Object.keys(secrets)) delete secrets[k]
  Object.assign(config, s.config)
  secretsSet.value = s.secretsSet
}

async function loadRoutes(endpointId: string) {
  loadingRoutes.value = true
  try {
    routes.value = await listRoutes(endpointId)
    if (config.gatewayRouteId && !routes.value.some((r) => r.id === config.gatewayRouteId)) config.gatewayRouteId = ''
    if (!config.gatewayRouteId) config.gatewayRouteId = routes.value.find((r) => r.method === 'POST' && r.path.replace(/^\/+|\/+$/g, '') === 'image/upload')?.id ?? ''
  } catch (e: any) {
    error.value = e?.message || 'Failed to load routes for this endpoint'
    routes.value = []
  } finally {
    loadingRoutes.value = false
  }
}
watch(selectedEndpointId, (id) => { if (id) void loadRoutes(id); else routes.value = [] })

// the route belongs to exactly one endpoint: find it by looking in each endpoint's routes rather than storing the endpoint id (one less thing to drift)
async function selectEndpointOfRoute(routeId: string) {
  for (const ep of endpoints.value) {
    const epRoutes = await listRoutes(ep.id)
    if (epRoutes.some((r) => r.id === routeId)) { selectedEndpointId.value = ep.id; routes.value = epRoutes; return }
  }
}

watch(provider, () => { testResult.value = null })

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [list, eps, mine, dflt] = await Promise.all([
      fetchCdnProviders(base()), listEndpoints().catch(() => [] as GatewayEndpoint[]),
      fetchCdnMirrorSettings(base(), props.websiteId), props.websiteId ? fetchCdnMirrorSettings(base()) : Promise.resolve(null),
    ])
    providers.value = list
    endpoints.value = eps
    defaultSettings.value = props.websiteId ? dflt : mine
    useOwn.value = props.websiteId ? mine.own : true
    if (mine.scope !== 'none' && (!props.websiteId || mine.own)) fill(mine)
    else if (!list.some((p) => p.id === provider.value)) provider.value = list[0]?.id ?? 'cloudinary'
    if (config.gatewayRouteId) await selectEndpointOfRoute(config.gatewayRouteId)
  } catch (e: any) {
    error.value = e?.message || 'Failed to load CDN mirror settings'
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function save() {
  error.value = ''
  saveOk.value = false
  testResult.value = null
  saving.value = true
  try {
    if (props.websiteId && !useOwn.value) {
      await removeCdnMirrorSettings(base(), props.websiteId)
    } else {
      const sentSecrets = Object.fromEntries(Object.entries(secrets).filter(([, v]) => v && v.trim()))
      const saved = await saveCdnMirrorSettings(base(), { websiteId: props.websiteId, provider: provider.value, config: { ...config }, secrets: sentSecrets })
      fill(saved)
    }
    saveOk.value = true
  } catch (e: any) {
    error.value = e?.message || 'Failed to save CDN mirror settings'
  } finally {
    saving.value = false
  }
}

async function runTest() {
  testResult.value = null
  testing.value = true
  try {
    testResult.value = await testCdnMirrorSettings(base(), props.websiteId)
  } catch (e: any) {
    testResult.value = { ok: false, error: e?.message || 'Failed' }
  } finally {
    testing.value = false
  }
}
</script>
