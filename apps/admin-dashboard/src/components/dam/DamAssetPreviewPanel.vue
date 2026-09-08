<template>
  <div class="flex flex-col md:flex-row gap-6">
    <!-- Main: Preview Stage -->
    <div class="flex-1 min-w-0">
      <div class="aspect-video w-full rounded-xl bg-checkerboard bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 flex items-center justify-center overflow-hidden relative p-4">
        <!-- Image File Preview -->
        <img
          v-if="PREVIEWABLE_IMAGE_TYPES.includes(asset.fileType)"
          :src="asset.dataUrl || asset.url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80'"
          @error="handleImageError"
          :alt="asset.filename"
          class="max-h-full max-w-full object-contain rounded-lg shadow-lg"
        />

        <!-- Video File Preview -->
        <video
          v-else-if="asset.fileType === 'MP4'"
          controls
          class="max-h-full max-w-full rounded-lg"
        >
          <source :src="asset.url" type="video/mp4" />
          Your browser does not support HTML5 video preview.
        </video>

        <!-- PDF Preview: streamed through the asset-processor proxy and
             re-typed to application/pdf, so inline rendering works even
             when the stored object's content-type is octet-stream. -->
        <iframe
          v-else-if="isPdf && pdfBlobUrl"
          :src="pdfBlobUrl"
          title="PDF preview"
          class="h-full w-full rounded-lg border-0 bg-white"
        ></iframe>

        <!-- Office (Word/Excel/PowerPoint) Preview: only public assets get
             the Microsoft Office viewer - the file is fetched by Microsoft's
             servers, which is fine for CDN-public files but not for private
             ones (privacy + presigned URLs expire). -->
        <iframe
          v-else-if="isOffice && asset.isPublic && asset.url"
          :src="officeViewerUrl"
          title="Office preview"
          class="h-full w-full rounded-lg border-0 bg-white"
        ></iframe>

        <!-- JSON Preview: pretty-printed, streamed through the proxy. -->
        <div v-else-if="isJson && jsonText !== null" class="h-full w-full overflow-auto rounded-lg bg-slate-950 light:bg-white text-left">
          <pre class="p-3 text-[11px] leading-relaxed font-mono text-emerald-300 light:text-slate-800 whitespace-pre-wrap break-words">{{ jsonText }}</pre>
        </div>

        <!-- Inline render busy / failed state for PDF/JSON/office -->
        <div v-else-if="previewBusy" class="text-center space-y-3">
          <div class="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p class="text-xs text-slate-400 light:text-slate-600">Loading preview…</p>
        </div>
        <div v-else-if="previewError" class="text-center space-y-3">
          <component :is="getIconForFileType(asset.fileType)" class="w-16 h-16 text-rose-400/80 mx-auto" />
          <p class="text-xs text-rose-400 max-w-sm mx-auto">{{ previewError }}</p>
          <button
            @click="openAssetInNewTab"
            class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition"
          >
            Open in New Tab
          </button>
        </div>

        <!-- Fallback Icon Preview -->
        <div v-else class="text-center space-y-3">
          <component :is="getIconForFileType(asset.fileType)" class="w-16 h-16 text-indigo-400/80 mx-auto" />
          <p class="text-xs text-slate-400 light:text-slate-600 font-mono">{{ asset.filename }}</p>
        </div>
      </div>
    </div>

    <!-- Right Pane: Details + Actions (narrow, fixed width) -->
    <div class="md:w-72 shrink-0 space-y-4 text-xs">
      <!-- Details -->
      <div class="p-4 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 space-y-3">
        <h4 class="font-bold text-slate-200 light:text-slate-800 uppercase tracking-wider text-[11px] text-indigo-400">Details</h4>

        <div v-if="asset.metadata?.technical?.width && asset.metadata?.technical?.height">
          <span class="text-slate-500 block">Asset Dim</span>
          <span class="font-mono text-slate-200 light:text-slate-800 font-medium break-all block">{{ asset.metadata.technical.width }} × {{ asset.metadata.technical.height }}px</span>
        </div>
        <div>
          <span class="text-slate-500 block">Asset Path</span>
          <span class="font-mono text-slate-200 light:text-slate-800 font-medium break-all block">{{ asset.pimcorePath }}</span>
        </div>

        <div>
          <span class="text-slate-500 block">S3 Object Key</span>
          <span class="font-mono text-slate-200 light:text-slate-800 font-medium break-all block">{{ asset.s3Key }}</span>
        </div>

        <div>
          <span class="text-slate-500 block">File Size & Mime</span>
          <span class="text-slate-200 light:text-slate-800 font-medium">{{ asset.sizeFormatted }} ({{ asset.mimeType }})</span>
        </div>

        <div>
          <span class="text-slate-500 block">Visibility Access</span>
          <span
            :class="[
              'inline-block px-2 py-0.5 text-[10px] font-bold rounded-full border mt-0.5',
              asset.isPublic ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
            ]"
          >
            {{ asset.isPublic ? 'PUBLIC (Direct CDN)' : 'PRIVATE (Presigned Signed URL)' }}
          </span>
        </div>

        <div>
          <span class="text-slate-500 block">Uploaded At</span>
          <span class="text-slate-300 light:text-slate-700">{{ new Date(asset.uploadedAt).toLocaleString() }}</span>
        </div>

        <div>
          <span class="text-slate-500 block">Last Updated</span>
          <span class="text-slate-300 light:text-slate-700">{{ new Date(asset.updatedAt).toLocaleString() }}</span>
        </div>
      </div>

      <!-- Actions -->
      <div class="p-4 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 space-y-2">
        <h4 class="font-bold text-slate-200 light:text-slate-800 uppercase tracking-wider text-[11px] text-indigo-400 mb-1">Actions</h4>

        <button
          v-if="PREVIEWABLE_IMAGE_TYPES.includes(asset.fileType)"
          @click="emit('open-edit')"
          class="w-full px-3 py-2 rounded-xl bg-indigo-950 hover:bg-indigo-900 text-indigo-300 font-semibold border border-indigo-500/40 transition flex items-center gap-1.5"
        >
          <span>⚡ Edit Image</span>
        </button>
        <button
          @click="emit('open-metadata')"
          class="w-full px-3 py-2 rounded-xl bg-emerald-950 hover:bg-emerald-900 text-emerald-300 font-semibold border border-emerald-500/40 transition flex items-center gap-1.5"
        >
          <span>🏷️ Metatags & EXIF</span>
        </button>
        <button
          @click="openAssetInNewTab"
          class="w-full px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow transition flex items-center gap-1.5"
          title="Open Asset URL in New Tab"
        >
          <ExternalLink class="w-3.5 h-3.5" />
          <span>Open in New Tab</span>
        </button>
        <button
          @click="emit('open-version')"
          class="w-full px-3 py-2 rounded-xl bg-slate-800 light:bg-slate-100 hover:bg-slate-700 light:bg-slate-200 text-indigo-300 font-semibold transition flex items-center gap-1.5"
        >
          <RefreshCw class="w-3.5 h-3.5" />
          <span>Upload New Version (v{{ asset.version + 1 }})</span>
        </button>
        <button
          @click="copyAssetUrl"
          class="w-full px-3 py-2 rounded-xl bg-slate-800 light:bg-slate-100 hover:bg-slate-700 light:bg-slate-200 text-slate-200 light:text-slate-800 font-medium transition flex items-center gap-1.5"
        >
          <Link class="w-3.5 h-3.5" />
          <span>Copy URL</span>
        </button>
      </div>

      <div class="p-4 rounded-xl bg-rose-950/20 border border-rose-900/40">
        <button
          @click="deleteAsset"
          class="w-full px-3 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900 text-rose-300 font-medium border border-rose-800/60 transition"
        >
          Delete Asset
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { ExternalLink, RefreshCw, Link } from '@lucide/vue'
import { AssetItem, useDamStore } from '../../stores/damStore'
import { getIconForFileType, PREVIEWABLE_IMAGE_TYPES } from '../../utils/asset-file-icons'
import { handleAssetImageError } from '../../utils/asset-image-heal'

const props = defineProps<{
  asset: AssetItem
}>()

const emit = defineEmits<{
  (e: 'open-edit'): void
  (e: 'open-metadata'): void
  (e: 'open-version'): void
  (e: 'deleted'): void
  (e: 'toast', message: string): void
}>()

const damStore = useDamStore()

const OFFICE_TYPES = ['DOC', 'DOCX', 'XLS', 'XLSX', 'PPT', 'PPTX']

const isPdf = computed(() => props.asset.fileType === 'PDF')
const isJson = computed(() => props.asset.fileType === 'JSON')
const isOffice = computed(() => OFFICE_TYPES.includes(props.asset.fileType))

// Blob-fetched content (guaranteed correct mime regardless of what S3
// stored): a PDF blob URL for the <iframe>, raw/pretty text for JSON.
const pdfBlobUrl = ref<string | null>(null)
const jsonText = ref<string | null>(null)
const previewBusy = ref(false)
const previewError = ref<string | null>(null)
let activeBlobUrl: string | null = null

// Microsoft Office viewer for public office files (fetched by MS servers,
// so the URL must be reachable from the internet - LAN/local hostnames like
// develop.local make the viewer redirect to a login/error page, and private
// files must never be handed to Microsoft at all).
function isInternetPublicUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.lan') || host.endsWith('.internal') || host.endsWith('.home')) return false
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      const [a, b] = host.split('.').map(Number)
      if (a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false
    }
    return true
  } catch {
    return false
  }
}

const officeViewerUrl = computed(() => {
  if (!isOffice.value || !props.asset.isPublic || !props.asset.url) return ''
  if (!isInternetPublicUrl(props.asset.url)) return ''
  return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(props.asset.url)}`
})

function proxyUrl(): string {
  return `${damStore.config.assetProcessorUrl}/dam-asset/${props.asset.s3Key}`
}

function releaseBlobUrl() {
  if (activeBlobUrl) {
    URL.revokeObjectURL(activeBlobUrl)
    activeBlobUrl = null
  }
}

async function loadInlinePreview() {
  releaseBlobUrl()
  pdfBlobUrl.value = null
  jsonText.value = null
  previewError.value = null
  if (!isPdf.value && !isJson.value) return

  previewBusy.value = true
  try {
    const res = await fetch(proxyUrl())
    if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`)
    if (isPdf.value) {
      const blob = await res.blob()
      const typed = new Blob([blob], { type: 'application/pdf' })
      activeBlobUrl = URL.createObjectURL(typed)
      pdfBlobUrl.value = activeBlobUrl
    } else {
      const text = await res.text()
      try {
        jsonText.value = JSON.stringify(JSON.parse(text), null, 2)
      } catch {
        jsonText.value = text
      }
    }
  } catch (e: any) {
    previewError.value = e.message || 'Preview failed to load'
  } finally {
    previewBusy.value = false
  }
}

// Reload when the asset changes OR is updated (new version upload bumps
// updatedAt while keeping the same id).
watch(() => [props.asset.id, props.asset.updatedAt], loadInlinePreview, { immediate: true })
onBeforeUnmount(releaseBlobUrl)

async function openAssetInNewTab() {
  const targetUrl = (await damStore.getAssetUrl(props.asset)) || props.asset.url || props.asset.pimcorePath
  if (!targetUrl) return
  window.open(targetUrl, '_blank', 'noopener,noreferrer')
}

async function copyAssetUrl() {
  const url = (await damStore.getAssetUrl(props.asset)) || props.asset.url || props.asset.pimcorePath
  await navigator.clipboard.writeText(url)
  emit('toast', 'Asset URL copied to clipboard!')
}

async function deleteAsset() {
  if (confirm('Are you sure you want to delete this asset from DAM storage?')) {
    await damStore.deleteAsset(props.asset.id)
    emit('deleted')
  }
}

function handleImageError(e: Event) {
  handleAssetImageError(e, props.asset)
}
</script>
