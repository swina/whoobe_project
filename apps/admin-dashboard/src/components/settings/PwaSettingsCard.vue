<template>
  <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-4">
    <div v-if="loading" class="text-xs text-slate-400">Loading PWA configuration...</div>

    <template v-else>
      
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider text-xs">Mobile App</h3>
          <p class="text-xs text-slate-500">Configure App settings for your websites.</p>
        </div>
        <label class="flex items-center gap-2 cursor-pointer">
          <span class="text-xs text-slate-400">Enabled</span>
          <input type="checkbox" v-model="enabled" class="toggle" />
        </label>
      </div>

      <form v-if="enabled" @submit.prevent="save" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <label class="flex flex-col gap-1">
            <span class="text-xs text-slate-400">App Name (short)</span>
            <input v-model="config.shortName" class="field" placeholder="MyApp" maxlength="12" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-slate-400">Website</span>
            <select v-model="selectedWebsiteId" class="field">
              <option value="">Select a website...</option>
              <option v-for="w in websites" :key="w.id" :value="w.id">{{ w.name }}</option>
            </select>
          </label>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <label class="flex flex-col gap-1">
            <span class="text-xs text-slate-400">Display Mode</span>
            <select v-model="config.display" class="field">
              <option value="standalone">Standalone</option>
              <option value="fullscreen">Fullscreen</option>
              <option value="minimal-ui">Minimal UI</option>
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-slate-400">Orientation</span>
            <select v-model="config.orientation" class="field">
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
              <option value="any">Any</option>
            </select>
          </label>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <label class="flex flex-col gap-1">
            <span class="text-xs text-slate-400">Background Color</span>
            <div class="flex gap-2">
              <input v-model="config.backgroundColor" type="color" class="w-10 h-10 rounded cursor-pointer border border-slate-700" />
              <input v-model="config.backgroundColor" class="field flex-1 font-mono" />
            </div>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-slate-400">Theme Color</span>
            <div class="flex gap-2">
              <input v-model="config.themeColor" type="color" class="w-10 h-10 rounded cursor-pointer border border-slate-700" />
              <input v-model="config.themeColor" class="field flex-1 font-mono" />
            </div>
          </label>
        </div>

        <fieldset class="border border-slate-700 light:border-slate-300 rounded p-4 space-y-3">
          <legend class="text-xs font-semibold text-slate-400 px-1">Push Notifications Provider</legend>
          <div class="flex gap-4">
            <label class="flex items-center gap-2">
              <input type="radio" v-model="pushProvider" value="self" />
              <span class="text-xs text-slate-300">Self-hosted (VAPID)</span>
            </label>
            <label class="flex items-center gap-2">
              <input type="radio" v-model="pushProvider" value="onesignal" />
              <span class="text-xs text-slate-300">OneSignal</span>
            </label>
            <label class="flex items-center gap-2">
              <input type="radio" v-model="pushProvider" value="firebase" />
              <span class="text-xs text-slate-300">Firebase</span>
            </label>
          </div>

          <template v-if="pushProvider === 'self'">
            <div class="text-xs text-slate-500">VAPID keys are auto-generated on save. The public key is included in the PWA manifest.</div>
          </template>

          <template v-if="pushProvider === 'onesignal'">
            <label class="flex flex-col gap-1">
              <span class="text-xs text-slate-400">OneSignal App ID</span>
              <input v-model="onesignalAppId" class="field font-mono" placeholder="..." />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-xs text-slate-400">REST API Key</span>
              <input v-model="onesignalApiKey" type="password" class="field font-mono" placeholder="..." />
            </label>
          </template>

          <template v-if="pushProvider === 'firebase'">
            <div class="grid grid-cols-2 gap-3">
              <label class="flex flex-col gap-1">
                <span class="text-xs text-slate-400">Project ID</span>
                <input v-model="firebaseProjectId" class="field font-mono" />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-xs text-slate-400">Web API Key</span>
                <input v-model="firebaseApiKey" class="field font-mono" />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-xs text-slate-400">Sender ID</span>
                <input v-model="firebaseSenderId" class="field font-mono" />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-xs text-slate-400">App ID</span>
                <input v-model="firebaseAppId" class="field font-mono" />
              </label>
            </div>
            <label class="flex flex-col gap-1">
              <span class="text-xs text-slate-400">Service Account JSON</span>
              <textarea v-model="firebaseServiceAccount" class="field font-mono" rows="4" placeholder="Paste the service account JSON..."></textarea>
            </label>
          </template>
        </fieldset>

        <div class="flex items-center gap-3 pt-2">
          <button type="submit" :disabled="saving" class="btn btn-primary">
            {{ saving ? 'Saving...' : 'Save Configuration' }}
          </button>
          <span v-if="savedAt" class="text-xs text-emerald-400">Saved at {{ savedAt }}</span>
          <span v-if="error" class="text-xs text-rose-400">{{ error }}</span>
        </div>
      </form>
      <!-- Generate preview -->
      <!--
      <div v-if="selectedWebsiteId" class="border-t border-slate-700 light:border-slate-300 pt-4 mt-4">
      -->
        <!--
        <div class="flex items-center justify-between mb-3">
          <div>
            <h4 class="text-xs font-semibold text-slate-300 uppercase tracking-wider">Generate Mobile App Preview</h4>
            <p class="text-xs text-slate-500 mt-0.5">Generate a Nuxt PWA project to inspect the output before deployment.</p>
          </div>
          <button
            type="button"
            :disabled="generating"
            class="btn btn-success flex items-center gap-2"
            @click="generatePwa"
          >
            <span v-if="generating" class="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            {{ generating ? 'Generating...' : 'Generate Mobile App' }}
          </button>
        </div>
        -->
        <!-- Log viewer -->
         <!--
        <div v-if="logs.length" class="mb-3 bg-slate-950 rounded-lg p-3 font-mono text-[11px] leading-relaxed max-h-48 overflow-y-auto">
          <div v-for="(log, i) in logs" :key="i" class="text-emerald-400/80">
            <span class="text-slate-600">[{{ i + 1 }}]</span> {{ log }}
          </div>
        </div>
        -->
        <!-- File tree + preview -->
         <!--
        <div v-if="result" class="border border-slate-700 rounded-lg overflow-hidden">
          <div class="flex items-center gap-2 bg-slate-800/50 px-3 py-2 border-b border-slate-700">
            <span class="text-xs font-semibold text-slate-300">{{ result.websiteName }} — PWA site</span>
            <span class="text-[10px] text-slate-500">{{ result.fileTree.length }} files</span>
            <button
              type="button"
              class="btn btn-link ml-auto"
              @click="downloadZip"
            >Download Project</button>
          </div>
          <div class="grid grid-cols-[1fr_2fr] divide-x divide-slate-700 max-h-96 overflow-hidden">
            <div class="overflow-y-auto p-2 space-y-0.5 bg-slate-900/30">
              <div
                v-for="f in result.fileTree"
                :key="f.path"
                class="text-[11px] font-mono cursor-pointer hover:text-indigo-300 truncate rounded px-1 py-0.5"
                :class="selectedFile === f.path ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-400'"
                @click="selectedFile = f.path"
              >
                <span class="text-slate-600 mr-1">{{ fileIcon(f.path) }}</span>
                {{ f.path }}
                <span class="text-[10px] text-slate-600 ml-1">({{ f.size }}B)</span>
              </div>
            </div>
            <div class="overflow-y-auto p-3 bg-slate-950">
              <pre v-if="result.fileContents[selectedFile]" class="text-[11px] font-mono text-slate-300 whitespace-pre-wrap">{{ result.fileContents[selectedFile] }}</pre>
              <div v-else class="text-xs text-slate-500 italic">Select a file to preview</div>
            </div>
          </div>
        </div>
      </div>
      -->
    
      <!-- Native mobile app (Capacitor) -->
      <div v-if="selectedWebsiteId" class="border-t border-slate-700 light:border-slate-300 pt-4 mt-4">
        <div class="mb-3">
          <h4 class="text-lg font-semibold text-slate-600 uppercase tracking-wider">Native Mobile App (Capacitor)</h4>
          <p class="text-xs text-slate-500 mt-0.5">
            Generates a real, installable Android/iOS project — a separate native pipeline from the Nuxt PWA
            preview above. This needs a local <code class="text-slate-400">npm install</code> and Android
            Studio/Xcode, so it's run from a terminal rather than the browser.
          </p>
        </div>

        <div class="space-y-3">
          <div>
            <div class="text-[11px] text-slate-400 mb-1">1. From the CMS repo root, run the interactive script:</div>
            <div class="flex items-center gap-2 bg-slate-950 rounded-lg px-3 py-2">
              <code class="flex-1 text-[11px] font-mono text-emerald-400/90">./publish-mobile.sh</code>
              <button type="button" class="btn btn-link shrink-0" @click="copyToClipboard('./publish-mobile.sh')">Copy</button>
            </div>
            <p class="text-[11px] text-slate-500 mt-1">
              It'll prompt for the CMS API URL, the website ID below, an app name/bundle identifier, an output
              directory, and whether to build a fully static (offline) version.
            </p>
          </div>

          <div>
            <div class="text-[11px] text-slate-400 mb-1">This website's ID (for the prompt above):</div>
            <div class="flex items-center gap-2 bg-slate-950 rounded-lg px-3 py-2">
              <code class="flex-1 text-[11px] font-mono text-slate-300 truncate">{{ selectedWebsiteId }}</code>
              <button type="button" class="btn btn-link shrink-0" @click="copyToClipboard(selectedWebsiteId)">Copy</button>
            </div>
          </div>

          <div>
            <div class="text-[11px] text-slate-400 mb-1">Or skip the prompts with a single non-interactive command:</div>
            <div class="flex items-start gap-2 bg-slate-950 rounded-lg px-3 py-2">
              <pre class="flex-1 text-[11px] font-mono text-emerald-400/90 whitespace-pre-wrap">{{ capacitorCliCommand }}</pre>
              <button type="button" class="btn btn-link shrink-0" @click="copyToClipboard(capacitorCliCommand)">Copy</button>
            </div>
            <p class="text-[11px] text-slate-200 mt-1 bg-slate-800/50 rounded-lg p-2">
              Add <code class="text-slate-300">--static</code> for a fully offline build.<br>
              Run <code class="text-slate-300">pnpm run --filter @whoobe-cms/mobile-app... build</code> once first if
              you haven't (publish-mobile.sh does this for you automatically).
            </p>
            <p class="text-[11px] text-slate-200 mt-1 bg-slate-800/50 rounded-lg p-2">
              If you are in a WSL environment, you may need to run the script from a Windows terminal instead of WSL for Android Studio/Xcode to work properly. In this case set <code class="text-slate-300">--out-dir</code> to a Windows path from WSL (e.g., <code class="text-slate-300">/mnt/c/_some_path_/mobile-app</code>).
            </p>
          </div>

          <div>
            <div class="text-[11px] text-slate-400 mb-1">2. Build the generated project and open it natively:</div>
            <div class="flex items-start gap-2 bg-slate-950 rounded-lg px-3 py-2">
              <pre class="flex-1 text-[11px] font-mono text-emerald-400/90 whitespace-pre-wrap">{{ capacitorNextStepsCommand }}</pre>
              <button type="button" class="btn btn-link shrink-0" @click="copyToClipboard(capacitorNextStepsCommand)">Copy</button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { fetchWebsites, fetchWebsiteById, updateWebsite } from '../../utils/websites-api'
import type { WebsiteRecord } from '../../utils/websites-api'

const authStore = useAuthStore()
const toastStore = useToastStore()

const loading = ref(true)
const saving = ref(false)
const savedAt = ref<string | null>(null)
const error = ref<string | null>(null)

const enabled = ref(false)
const selectedWebsiteId = ref('')
const websites = ref<WebsiteRecord[]>([])

const config = ref<Record<string, any>>({
  shortName: '',
  display: 'standalone',
  orientation: 'portrait',
  backgroundColor: '#ffffff',
  themeColor: '#4f46e5',
  startUrl: '/',
  push: { provider: 'self' },
})

const pushProvider = computed({
  get: () => (config.value.push as Record<string, any>)?.provider ?? 'self',
  set: (v) => {
    config.value.push = { ...(config.value.push as Record<string, any> ?? {}), provider: v }
  },
})

const onesignalAppId = computed({
  get: () => (config.value.push as Record<string, any>)?.onesignalAppId ?? '',
  set: (v) => { config.value.push = { ...(config.value.push ?? {}), onesignalAppId: v } },
})
const onesignalApiKey = computed({
  get: () => (config.value.push as Record<string, any>)?.onesignalApiKey ?? '',
  set: (v) => { config.value.push = { ...(config.value.push ?? {}), onesignalApiKey: v } },
})
const firebaseProjectId = computed({
  get: () => (config.value.push as Record<string, any>)?.firebaseProjectId ?? '',
  set: (v) => { config.value.push = { ...(config.value.push ?? {}), firebaseProjectId: v } },
})
const firebaseApiKey = computed({
  get: () => (config.value.push as Record<string, any>)?.firebaseApiKey ?? '',
  set: (v) => { config.value.push = { ...(config.value.push ?? {}), firebaseApiKey: v } },
})
const firebaseSenderId = computed({
  get: () => (config.value.push as Record<string, any>)?.firebaseSenderId ?? '',
  set: (v) => { config.value.push = { ...(config.value.push ?? {}), firebaseSenderId: v } },
})
const firebaseAppId = computed({
  get: () => (config.value.push as Record<string, any>)?.firebaseAppId ?? '',
  set: (v) => { config.value.push = { ...(config.value.push ?? {}), firebaseAppId: v } },
})
const firebaseServiceAccount = computed({
  get: () => (config.value.push as Record<string, any>)?.firebaseServiceAccount ?? '',
  set: (v) => { config.value.push = { ...(config.value.push ?? {}), firebaseServiceAccount: v } },
})

watch(selectedWebsiteId, async (id) => {
  if (!id) return
  try {
    const website = await fetchWebsiteById(authStore.config.coreApiUrl, id)
    enabled.value = (website as any).pwaEnabled ?? false
    config.value = { ...config.value, ...((website as any).pwaConfig ?? {}) }
  } catch { /* ignore */ }
})

onMounted(async () => {
  try {
    websites.value = await fetchWebsites(authStore.config.coreApiUrl)
  } catch { /* ignore */ }
  loading.value = false
})

async function save() {
  if (!selectedWebsiteId.value) {
    error.value = 'Please select a website first'
    return
  }
  saving.value = true
  error.value = null
  try {
    await updateWebsite(authStore.config.coreApiUrl, selectedWebsiteId.value, {
      pwaEnabled: enabled.value,
      pwaConfig: config.value,
    })
    savedAt.value = new Date().toLocaleTimeString()
    toastStore.show('PWA configuration saved')
  } catch (e: any) {
    error.value = e?.message || 'Failed to save'
  } finally {
    saving.value = false
  }
}

// ── PWA Generate & Preview ─────────────────────────────────────────────────

const generating = ref(false)
const logs = ref<string[]>([])
const result = ref<{ websiteName: string; fileTree: { path: string; size: number }[]; fileContents: Record<string, string>; outDir: string } | null>(null)
const selectedFile = ref('')

async function generatePwa() {
  if (!selectedWebsiteId.value) return
  generating.value = true
  logs.value = []
  result.value = null
  selectedFile.value = ''

  try {
    const baseUrl = authStore.config.coreApiUrl
    const res = await fetch(`${baseUrl}/whoobe-one/websites/${selectedWebsiteId.value}/generate-pwa`, {
      method: 'POST',
      credentials: 'include',
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Generation failed' }))
      logs.value.push(`Error: ${err.error}`)
      return
    }

    const reader = res.body?.getReader()
    if (!reader) return

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line)
          if (parsed.type === 'log') {
            logs.value.push(parsed.message)
          } else if (parsed.type === 'done') {
            result.value = parsed
            if (parsed.fileTree.length > 0) {
              selectedFile.value = parsed.fileContents ? Object.keys(parsed.fileContents)[0] : parsed.fileTree[0].path
            }
          }
        } catch { /* ignore parse errors */ }
      }
    }
  } catch (e: any) {
    logs.value.push(`Error: ${e?.message || 'Network error'}`)
  } finally {
    generating.value = false
  }
}

function fileIcon(path: string): string {
  if (path.endsWith('.vue')) return '🟢'
  if (path.endsWith('.ts')) return '🔵'
  if (path.endsWith('.css')) return '🟣'
  if (path.endsWith('.json')) return '🟡'
  if (path.endsWith('.html')) return '🟠'
  if (path.endsWith('.js')) return '🟤'
  if (path.endsWith('.env') || path.endsWith('.txt')) return '⚪'
  return '📄'
}

async function downloadZip() {
  if (!result.value?.outDir) return
  // The outDir is server-side, so we'd need a zip download endpoint.
  // For now, copy the generated file contents as a JSON bundle.
  const blob = new Blob([JSON.stringify({
    website: result.value.websiteName,
    files: result.value.fileContents,
    fileTree: result.value.fileTree,
  }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `pwa-${result.value.websiteName.toLowerCase().replace(/\s+/g, '-')}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Native mobile app (Capacitor) — instructions only, no backend call.
// publish-mobile.sh needs a local npm install + Android Studio/Xcode, so
// (unlike the Nuxt PWA preview above) it can't be triggered from here yet.

const capacitorSlug = computed(() => selectedWebsiteId.value.slice(0, 8))

const capacitorCliCommand = computed(() => {
  const apiUrl = authStore.config.coreApiUrl
  return [
    'node packages/mobile-app/bin/whoobe-mobile.js \\',
    `  --api-url "${apiUrl}" \\`,
    `  --website-id "${selectedWebsiteId.value}" \\`,
    `  --out-dir "./sites/mobile-${capacitorSlug.value}" \\`,
    `  --app-id "com.whoobe.mobile.${capacitorSlug.value}"`,
  ].join('\n')
})

const capacitorNextStepsCommand = computed(() => [
  `cd ./sites/mobile-${capacitorSlug.value}`,
  'npm install',
  'npm run build',
  'npx cap add android   # or ios (macOS only)',
  'npx cap sync',
  'npx cap open android',
].join('\n'))

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toastStore.show('Copied to clipboard')
  } catch {
    toastStore.show('Could not copy — copy manually')
  }
}
</script>