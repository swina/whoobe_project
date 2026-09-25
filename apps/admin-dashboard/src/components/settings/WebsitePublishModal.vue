<template>
  <div v-if="isOpen" class="fixed inset-0 bg-slate-950/80 light:bg-white/80 backdrop-blur-sm flex items-center justify-center p-4 z-50" @click.self="emit('close')">
    <div class="bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
      <div class="flex items-center justify-between px-5 py-4 border-b border-slate-800 light:border-slate-200 shrink-0">
        <h3 class="text-base font-bold text-slate-100 light:text-slate-900 flex items-center gap-2">
          <Rocket class="w-4 h-4 text-indigo-400" />
          Publish "{{ website?.name }}"
        </h3>
        <button @click="emit('close')" class="text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 transition text-sm">✕</button>
      </div>

      <div class="flex-1 overflow-y-auto p-5 space-y-5">
        <p class="text-xs text-slate-500">
          Fill in the fields below - the ready-to-run script at the bottom updates live. Nothing runs from here: copy it and paste it into a terminal with this repo cloned.
        </p>

        <!-- Base fields -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">API URL (core-api)</label>
            <input v-model="apiUrl" type="text" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 font-mono" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Gateway URL</label>
            <input v-model="gatewayUrl" type="text" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 font-mono" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Asset Base URL</label>
            <input v-model="assetBaseUrl" type="text" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 font-mono" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Public domain</label>
            <input v-model="domain" type="text" placeholder="www.example.com" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 font-mono" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Framework</label>
            <select v-model="framework" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500">
              <option value="vue">Nuxt 3 (Vue)</option>
              <option value="next">Next.js (React)</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Base path</label>
            <input v-model="basePath" type="text" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 font-mono" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Slug (folder / deploy name)</label>
            <input v-model="slug" type="text" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 font-mono" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Revalidate (seconds)</label>
            <input v-model.number="revalidate" type="number" min="0" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 font-mono" />
          </div>
        </div>

        <!-- CDN Mirroring -->
        <div class="rounded-xl border border-slate-800 light:border-slate-200 p-4 space-y-3">
          <label class="flex items-center gap-2 text-sm font-semibold text-slate-200 light:text-slate-800 cursor-pointer">
            <input type="checkbox" v-model="includeCdn" class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 light:bg-slate-50 border-slate-800 light:border-slate-200" />
            <CloudUpload class="w-3.5 h-3.5 text-indigo-400" />
            CDN Mirroring
          </label>
          <p class="text-xs text-slate-500">Mirrors every image referenced by the published pages to the CDN before generating the site - idempotent, already-mirrored assets are skipped automatically.</p>
          <div v-if="includeCdn" class="space-y-3">
            <div v-if="cdnSettingsLoading" class="text-xs text-slate-500">Loading saved settings…</div>
            <div v-else-if="!cdnGatewayRouteId" class="text-xs px-3 py-2 rounded-lg bg-amber-900/30 border border-amber-700/40 text-amber-300">
              No CDN route saved in Settings → DAM → CDN Mirror - fill in the fields below by hand.
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Gateway Route ID</label>
                <input v-model="cdnGatewayRouteId" type="text" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 font-mono" />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Upload Preset</label>
                <input v-model="cdnUploadPreset" type="text" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 font-mono" />
              </div>
              <div class="col-span-2">
                <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Asset Processor URL <span class="text-slate-500 font-normal">(leave empty if same as API URL - only needed in local dev, where it runs on a different port)</span></label>
                <input v-model="assetProcessorUrl" type="text" placeholder="e.g. http://localhost:3002" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 font-mono" />
              </div>
            </div>
            <p class="text-xs text-slate-500">The script uses the <code class="font-mono">WHOOBE_SYNC_EMAIL</code>/<code class="font-mono">WHOOBE_SYNC_PASSWORD</code> environment variables - a dedicated service account, <strong>without MFA enabled</strong>. Replace the placeholders before running - left blank here on purpose, credentials are never auto-filled or held in this form.</p>
          </div>
        </div>

        <!-- Remote deploy -->
        <div class="rounded-xl border border-slate-800 light:border-slate-200 p-4 space-y-3">
          <label class="flex items-center gap-2 text-sm font-semibold text-slate-200 light:text-slate-800 cursor-pointer">
            <input type="checkbox" v-model="includeDeploy" class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 light:bg-slate-50 border-slate-800 light:border-slate-200" />
            <Server class="w-3.5 h-3.5 text-indigo-400" />
            Remote deploy (Docker + nginx)
          </label>
          <p class="text-xs text-slate-500">Transfers the generated site to any production host and runs it there. The generated site is fully self-contained (its own Dockerfile, nginx config, and deploy script, with its SDK dependencies bundled as plain tarballs) - the remote host only needs Docker (and optionally nginx) installed, never a checkout of this repo.</p>
          <div v-if="includeDeploy" class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Remote host (user@host)</label>
              <input v-model="remoteTarget" type="text" placeholder="deploy@example.com" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 font-mono" />
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Destination path on the remote host</label>
              <input v-model="remotePath" type="text" placeholder="/opt/sites" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 font-mono" />
              <p class="text-xs text-slate-500 mt-1">Any directory - it doesn't need to already exist, and doesn't need to be a whoobe_cms checkout.</p>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">Container port</label>
              <input v-model="deployPort" type="text" placeholder="e.g. 3100" class="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 font-mono" />
              <p class="text-xs text-slate-500 mt-1">Pick a free port on the remote host - not auto-detected.</p>
            </div>
          </div>
        </div>

        <!-- Generated script -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="block text-xs font-medium text-slate-300 light:text-slate-700">Ready-to-run script</label>
            <button @click="copyScript" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
              <Copy class="w-3 h-3" />
              {{ copied ? 'Copied!' : 'Copy' }}
            </button>
          </div>
          <textarea
            :value="script"
            readonly
            rows="16"
            class="w-full px-3 py-2 text-xs font-mono rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
            @focus="($event.target as HTMLTextAreaElement).select()"
          ></textarea>
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-800 light:border-slate-200 shrink-0">
        <button @click="emit('close')" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 light:bg-slate-100 hover:bg-slate-700 light:hover:bg-slate-200 text-slate-300 light:text-slate-700 border border-slate-700 light:border-slate-300 transition">Close</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Rocket, CloudUpload, Server, Copy } from '@lucide/vue'
import { getDefaultCoreApiUrl } from '../../utils/auth-api'
import { fetchCdnMirrorSettings } from '../../utils/websites-api'
import type { WebsiteRecord } from '../../utils/websites-api'

const props = defineProps<{ isOpen: boolean; website: WebsiteRecord | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

// Local-dev vs production default: window.location's own port is the admin
// dashboard's port, not core-api's/gateway's - fine for the admin app's own
// fetches (proxied by vite.config.ts), but a raw CLI command pasted into a
// terminal needs the real service port. Behind nginx (non-localhost), every
// service shares the same hostname/443, no port needed.
function defaultServiceUrl(port: number): string {
  if (typeof window === 'undefined') return ''
  const { protocol, hostname } = window.location
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'
  return isLocalhost ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'site'
}

const apiUrl = ref('')
const gatewayUrl = ref('')
const assetBaseUrl = ref('')
const domain = ref('')
const framework = ref<'vue' | 'next'>('vue')
const basePath = ref('/')
const slug = ref('')
const revalidate = ref(60)

const includeCdn = ref(true)
const cdnSettingsLoading = ref(false)
const cdnGatewayRouteId = ref('')
const cdnUploadPreset = ref('')
const cdnProvider = ref('cloudinary')
const assetProcessorUrl = ref('')

const includeDeploy = ref(true)
const remoteTarget = ref('')
const remotePath = ref('')
const deployPort = ref('')

const copied = ref(false)

// Re-derive every field's default whenever a different website is opened -
// watch immediate so it also runs on first open.
watch(
  () => props.website,
  async (website) => {
    if (!website) return
    apiUrl.value = getDefaultCoreApiUrl()
    gatewayUrl.value = defaultServiceUrl(3001)
    assetBaseUrl.value = apiUrl.value
    domain.value = website.domains?.[0] ?? ''
    slug.value = slugify(website.name) || website.id.slice(0, 8)

    cdnSettingsLoading.value = true
    try {
      const saved = await fetchCdnMirrorSettings(apiUrl.value)
      cdnGatewayRouteId.value = saved.gatewayRouteId ?? ''
      cdnUploadPreset.value = saved.uploadPreset ?? ''
      cdnProvider.value = saved.provider || 'cloudinary'
    } catch {
      // No saved settings (or not permitted) - leave blank for manual entry.
    } finally {
      cdnSettingsLoading.value = false
    }
  },
  { immediate: true },
)

const script = computed(() => {
  if (!props.website) return ''
  const websiteId = props.website.id
  const outDir = `./sites/${slug.value}`
  const lines: string[] = ['#!/usr/bin/env bash', 'set -euo pipefail', '', '# Run from the root of the whoobe_cms repo.', '']

  let step = 1
  if (includeCdn.value) {
    lines.push(
      `# ${step}. CDN Mirroring - mirror the referenced images before publishing (idempotent).`,
      '#    Dedicated service account, WITHOUT MFA enabled - replace the placeholders.',
      'WHOOBE_SYNC_EMAIL=<service-account-email> \\',
      'WHOOBE_SYNC_PASSWORD=<service-account-password> \\',
      'pnpm publish:sync-cdn \\',
      `  --api-url "${apiUrl.value}" \\`,
      `  --website-id "${websiteId}" \\`,
      `  --gateway-route-id "${cdnGatewayRouteId.value || '<gateway-route-id>'}" \\`,
      `  --upload-preset "${cdnUploadPreset.value || '<upload-preset>'}"${assetProcessorUrl.value ? ' \\' : ''}`,
    )
    if (assetProcessorUrl.value) lines.push(`  --asset-processor-url "${assetProcessorUrl.value}"`)
    lines.push('')
    step++
  }

  lines.push(
    `# ${step}. Generate the site (${framework.value === 'vue' ? 'Nuxt' : 'Next.js'}).`,
    'pnpm publish:site \\',
    `  --api-url "${apiUrl.value}" \\`,
    `  --website-id "${websiteId}" \\`,
    `  --out-dir "${outDir}" \\`,
    `  --framework ${framework.value} \\`,
    `  --domain "${domain.value || '<domain>'}" \\`,
    `  --asset-base-url "${assetBaseUrl.value}" \\`,
    `  --gateway-url "${gatewayUrl.value}" \\`,
    `  --base-path "${basePath.value}" \\`,
    `  --revalidate ${revalidate.value}`,
    '',
  )
  step++

  if (includeDeploy.value) {
    const target = remoteTarget.value || '<user@remote-host>'
    const rpath = remotePath.value || '<path-on-remote-host>'
    const port = deployPort.value || '<port>'
    lines.push(
      `# ${step}. Transfer the site to the production host and run it there.`,
      '#    Only Docker (and optionally nginx) is required there - no whoobe_cms',
      '#    checkout needed on that host, the generated site is self-contained.',
      `rsync -az --delete "${outDir}/" "${target}:${rpath}/${slug.value}/"`,
      `ssh "${target}" "cd ${rpath}/${slug.value} && PORT=${port} ./deploy.sh"`,
    )
  }

  return lines.join('\n')
})

async function copyScript() {
  try {
    await navigator.clipboard.writeText(script.value)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = script.value
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}
</script>
