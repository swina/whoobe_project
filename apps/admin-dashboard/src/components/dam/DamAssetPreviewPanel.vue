<template>
  <div class="flex flex-col md:flex-row gap-6">
    <!-- Main: Preview Stage -->
    <div class="flex-1 min-w-0">
      <div class="aspect-video w-full rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden relative p-4">
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

        <!-- Fallback Icon Preview -->
        <div v-else class="text-center space-y-3">
          <component :is="getIconForFileType(asset.fileType)" class="w-16 h-16 text-indigo-400/80 mx-auto" />
          <p class="text-xs text-slate-400 font-mono">{{ asset.filename }}</p>
        </div>
      </div>
    </div>

    <!-- Right Pane: Details + Actions (narrow, fixed width) -->
    <div class="md:w-72 shrink-0 space-y-4 text-xs">
      <!-- Details -->
      <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
        <h4 class="font-bold text-slate-200 uppercase tracking-wider text-[11px] text-indigo-400">Details</h4>

        <div v-if="asset.metadata?.technical?.width && asset.metadata?.technical?.height">
          <span class="text-slate-500 block">Asset Dim</span>
          <span class="font-mono text-slate-200 font-medium break-all block">{{ asset.metadata.technical.width }} × {{ asset.metadata.technical.height }}px</span>
        </div>
        <div>
          <span class="text-slate-500 block">Asset Path</span>
          <span class="font-mono text-slate-200 font-medium break-all block">{{ asset.pimcorePath }}</span>
        </div>

        <div>
          <span class="text-slate-500 block">S3 Object Key</span>
          <span class="font-mono text-slate-200 font-medium break-all block">{{ asset.s3Key }}</span>
        </div>

        <div>
          <span class="text-slate-500 block">File Size & Mime</span>
          <span class="text-slate-200 font-medium">{{ asset.sizeFormatted }} ({{ asset.mimeType }})</span>
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
          <span class="text-slate-300">{{ new Date(asset.uploadedAt).toLocaleString() }}</span>
        </div>

        <div>
          <span class="text-slate-500 block">Last Updated</span>
          <span class="text-slate-300">{{ new Date(asset.updatedAt).toLocaleString() }}</span>
        </div>
      </div>

      <!-- Actions -->
      <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
        <h4 class="font-bold text-slate-200 uppercase tracking-wider text-[11px] text-indigo-400 mb-1">Actions</h4>

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
          class="w-full px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 font-semibold transition flex items-center gap-1.5"
        >
          <RefreshCw class="w-3.5 h-3.5" />
          <span>Upload New Version (v{{ asset.version + 1 }})</span>
        </button>
        <button
          @click="copyAssetUrl"
          class="w-full px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition flex items-center gap-1.5"
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
