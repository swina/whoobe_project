<template>
  <div class="rounded-2xl bg-slate-900/80 light:bg-white/80 border border-slate-800 light:border-slate-200 p-6 shadow-xl space-y-4">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
        <CloudUpload class="w-5 h-5" />
      </div>
      <div>
        <h4 class="text-sm font-bold text-slate-100 light:text-slate-900 uppercase tracking-wider text-xs">CDN Mirroring</h4>
        <p class="text-xs text-slate-400 light:text-slate-600">
          Where "Publish to CDN" (Assets list, and later automatic on-publish - see
          <code class="text-slate-300">docs/plans/assets/assets-cdn.md</code>) sends assets. Configured once, reused
          everywhere.
        </p>
      </div>
    </div>

    <div v-if="loadingEndpoints" class="text-xs text-slate-500 text-center py-4">Loading Gateway endpoints…</div>
    <div v-else-if="endpoints.length === 0" class="px-3 py-2 rounded-lg bg-amber-900/30 border border-amber-700/40 text-xs text-amber-300">
      No Gateway endpoints configured yet. Add a Cloudinary endpoint under Integrations first (the Cloudinary preset
      already includes the upload route this needs).
    </div>
    <template v-else>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label class="flex flex-col gap-1 text-xs text-slate-400">
          Gateway endpoint
          <select v-model="selectedEndpointId" class="field">
            <option value="" disabled>Choose an endpoint…</option>
            <option v-for="ep in endpoints" :key="ep.id" :value="ep.id">{{ ep.name }}</option>
          </select>
        </label>

        <label class="flex flex-col gap-1 text-xs text-slate-400">
          Upload route
          <div v-if="loadingRoutes" class="text-slate-500 py-1.5">Loading routes…</div>
          <select v-else v-model="gatewayRouteId" class="field">
            <option value="" disabled>Choose a route…</option>
            <option v-for="r in routes" :key="r.id" :value="r.id">{{ r.method }} {{ r.path }}</option>
          </select>
        </label>

        <label class="flex flex-col gap-1 text-xs text-slate-400">
          Cloudinary unsigned upload preset
          <input v-model="uploadPreset" type="text" placeholder="e.g. whoobe-mirror" class="field" />
          <span class="text-slate-600">Created once in Cloudinary's own dashboard, marked "unsigned" - see the plan doc for why signed uploads aren't supported here.</span>
        </label>
      </div>
    </template>

    <div v-if="error" class="px-3 py-2 rounded-lg bg-rose-900/30 border border-rose-700/40 text-xs text-rose-300">{{ error }}</div>

    <div class="flex items-center gap-3 pt-1">
      <button type="button" :disabled="saving" class="btn btn-primary" @click="save">
        {{ saving ? 'Saving…' : 'Save' }}
      </button>
      <span v-if="saveOk" class="text-xs text-emerald-400">Saved.</span>
    </div>
  </div>
</template>

<script setup lang="ts">
// CDN mirroring settings (docs/plans/assets/assets-cdn.md, Phase 1) -
// picks the Gateway endpoint/route (and Cloudinary's unsigned upload
// preset name) that AssetsView.vue's "Publish to CDN" bulk action uses,
// same "configure once, reuse everywhere" pattern as MailSettingsCard.vue
// for outgoing mail and BrevoCampaignModal.vue for campaigns.
import { onMounted, ref, watch } from 'vue'
import { CloudUpload } from '@lucide/vue'
import { getDefaultCoreApiUrl } from '../../utils/auth-api'
import { fetchCdnMirrorSettings, saveCdnMirrorSettings } from '../../utils/websites-api'
import { listEndpoints, listRoutes, type GatewayEndpoint, type GatewayRoute } from '../../utils/gateway-api'

const endpoints = ref<GatewayEndpoint[]>([])
const routes = ref<GatewayRoute[]>([])
const loadingEndpoints = ref(true)
const loadingRoutes = ref(false)
const selectedEndpointId = ref('')
const gatewayRouteId = ref('')
const uploadPreset = ref('')
const provider = ref('cloudinary')

const saving = ref(false)
const saveOk = ref(false)
const error = ref('')

function isUploadRoute(route: GatewayRoute): boolean {
  return route.method === 'POST' && route.path.replace(/^\/+|\/+$/g, '') === 'image/upload'
}

async function loadRoutes(endpointId: string, preselectRouteId?: string) {
  loadingRoutes.value = true
  try {
    routes.value = await listRoutes(endpointId)
    if (preselectRouteId && routes.value.some((r) => r.id === preselectRouteId)) {
      gatewayRouteId.value = preselectRouteId
    } else {
      const match = routes.value.find(isUploadRoute)
      gatewayRouteId.value = match ? match.id : ''
    }
  } catch (e: any) {
    error.value = e?.message || 'Failed to load routes for this endpoint'
    routes.value = []
  } finally {
    loadingRoutes.value = false
  }
}

watch(selectedEndpointId, (id) => {
  if (id) loadRoutes(id)
  else routes.value = []
})

onMounted(async () => {
  try {
    const [settings, allEndpoints] = await Promise.all([
      fetchCdnMirrorSettings(getDefaultCoreApiUrl()),
      listEndpoints(),
    ])
    endpoints.value = allEndpoints
    uploadPreset.value = settings.uploadPreset || ''
    provider.value = settings.provider || 'cloudinary'

    if (settings.gatewayRouteId) {
      // The route belongs to exactly one endpoint - find it by checking
      // each endpoint's routes rather than storing the endpoint id
      // separately (one less thing that could drift out of sync).
      for (const ep of allEndpoints) {
        const epRoutes = await listRoutes(ep.id)
        if (epRoutes.some((r) => r.id === settings.gatewayRouteId)) {
          selectedEndpointId.value = ep.id
          routes.value = epRoutes
          gatewayRouteId.value = settings.gatewayRouteId
          break
        }
      }
    }
  } catch (e: any) {
    error.value = e?.message || 'Failed to load CDN mirror settings'
  } finally {
    loadingEndpoints.value = false
  }
})

async function save() {
  error.value = ''
  saveOk.value = false
  saving.value = true
  try {
    await saveCdnMirrorSettings(getDefaultCoreApiUrl(), {
      gatewayRouteId: gatewayRouteId.value || null,
      uploadPreset: uploadPreset.value.trim() || null,
      provider: provider.value,
    })
    saveOk.value = true
  } catch (e: any) {
    error.value = e?.message || 'Failed to save CDN mirror settings'
  } finally {
    saving.value = false
  }
}
</script>
