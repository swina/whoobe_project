<template>
  <div class="space-y-4">
    <div v-if="!hasThumbnails" class="text-center text-xs text-slate-500 py-12">
      No thumbnails available for this asset.
    </div>

    <div v-else class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div v-for="preset in presets" :key="preset.key" class="p-4 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 space-y-3">
        <div class="flex items-center justify-between text-xs">
          <span class="font-bold text-slate-200 light:text-slate-800 uppercase tracking-wider text-[11px] text-indigo-400">{{ preset.label }}</span>
          <span class="font-mono text-slate-500">{{ preset.dimensions }}</span>
        </div>

        <div class="aspect-square w-full rounded-lg bg-checkerboard bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 flex items-center justify-center overflow-hidden">
          <img
            :src="asset.thumbnails?.[preset.key]"
            @error="(e) => handleAssetImageError(e, asset)"
            :alt="`${preset.label} thumbnail`"
            class="w-full h-full object-contain"
          />
        </div>

        <div class="flex items-center gap-2 text-xs">
          <button
            @click="openThumbnail(preset.key)"
            class="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-800 light:bg-slate-100 hover:bg-slate-700 hover:text-white light:bg-slate-200 text-slate-300 light:text-slate-700 transition text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
          >
            <ExternalLink class="w-3 h-3" />
            <span>Open</span>
          </button>
          <button
            @click="copyThumbnailUrl(preset.key)"
            class="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-800 light:bg-slate-100 hover:bg-slate-700 hover:text-white light:bg-slate-200 text-slate-300 light:text-slate-700 transition text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
          >
            <Link class="w-3 h-3" />
            <span>Copy URL</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { ExternalLink, Link } from '@lucide/vue'
import { AssetItem, useDamStore } from '../../stores/damStore'
import { handleAssetImageError } from '../../utils/asset-image-heal'

const props = defineProps<{
  asset: AssetItem
}>()

const emit = defineEmits<{
  (e: 'toast', message: string): void
}>()

const damStore = useDamStore()

const presets: { key: 'thumb' | 'medium' | 'large'; label: string; dimensions: string }[] = [
  { key: 'thumb', label: 'Thumb', dimensions: '150 × 150' },
  { key: 'medium', label: 'Medium', dimensions: '400 × 400' },
  { key: 'large', label: 'Large', dimensions: '1024 × 1024' }
]

// Refresh thumbnail URLs on mount if they're stale (direct S3 URLs instead
// of proxy URLs). The old S3 URLs were resolved before S3_PUBLIC_BASE_URL
// was configured and may fail with 403/network errors.
onMounted(() => {
  const thumb = props.asset.thumbnails?.thumb
  const proxyBase = damStore.config.assetProcessorUrl.replace(/\/+$/, '') + '/dam-asset'
  if (thumb && !thumb.startsWith(proxyBase)) {
    damStore.generateAssetUrl(props.asset.pimcorePath).then((fresh) => {
      props.asset.thumbnailUrl = fresh.thumbnailUrl
      props.asset.thumbnails = fresh.thumbnails
    }).catch(() => {
      // Silently ignore — the @error handler on each <img> will retry.
    })
  }
})

const hasThumbnails = computed(() => {
  const thumbnails = props.asset.thumbnails
  return !!thumbnails && Object.values(thumbnails).some(Boolean)
})

function openThumbnail(key: 'thumb' | 'medium' | 'large') {
  const url = props.asset.thumbnails?.[key]
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}

async function copyThumbnailUrl(key: 'thumb' | 'medium' | 'large') {
  const url = props.asset.thumbnails?.[key]
  if (!url) return
  await navigator.clipboard.writeText(url)
  emit('toast', `${key[0].toUpperCase()}${key.slice(1)} thumbnail URL copied to clipboard!`)
}
</script>
