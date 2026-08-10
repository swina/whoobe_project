<template>
  <div class="space-y-3">
    <!-- Header -->
    <div class="flex items-center justify-between pb-2">
      <div class="flex items-center gap-2.5">
        <div class="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold text-sm">
          ⚡
        </div>
        <div>
          <h3 class="text-base font-bold text-slate-100 light:text-slate-900 flex items-center gap-2">
            <span>Image Asset Editor</span>
            <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 light:bg-slate-50 text-indigo-300 border border-slate-800 light:border-slate-200">
              Phase 2 Engine
            </span>
          </h3>
          <div class="flex items-center" v-if="asset.metadata?.technical?.width && asset.metadata?.technical?.height">
            <!--<span class="text-slate-500 block">Asset Dim</span>-->
            <span class="font-mono text-slate-200 light:text-slate-800 font-medium break-all block mr-4">{{ asset.metadata.technical.width }} × {{ asset.metadata.technical.height }}px</span>
            <div class="flex items-center gap-2"><p class="text-xs text-slate-400 light:text-slate-600 font1-mono">{{ asset.filename }} ({{ asset.pimcorePath }})</p>
          </div>
        </div>
        </div>
      </div>

      <!--- Main controls -->
      <div class="flex items-center justify-between pt-4">
        <button
          @click="resetControls"
          class="px-3.5 py-2 mr-2 text-xs font-semibold rounded-xl bg-slate-800 light:bg-slate-100 hover:bg-slate-700 light:bg-slate-200 text-slate-300 light:text-slate-700 transition"
        >
          Reset Options
        </button>

        <div class="flex items-center gap-2">
          <button
            @click="saveTransformedAsset(false)"
            :disabled="isProcessing"
            class="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 light:bg-slate-100 hover:bg-slate-700 light:bg-slate-200 text-indigo-300 border border-slate-700 light:border-slate-300 transition"
          >
            Save as Copy
          </button>

          <button
            @click="saveTransformedAsset(true)"
            :disabled="isProcessing"
            class="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition flex items-center gap-1.5"
          >
            <span>Save as New Version</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Main Body: Canvas Preview + Sidebar Controls -->
    <div class="grid grid-cols-1 md:grid-cols-12 gap-6">
      <!-- Preview Panel (7 cols) -->
      <div class="md:col-span-9 space-y-4 flex flex-col justify-between">
        <div class="aspect-video w-full rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 flex items-center justify-center overflow-hidden relative group">
          <img
            :src="previewUrl"
            :style="previewStyle"
            alt="Asset Preview"
            class="max-h-full max-w-full object-contain transition-all duration-300"
          />
          <div v-if="isProcessing" class="absolute inset-0 bg-slate-950/70 light:bg-white/70 backdrop-blur-xs flex items-center justify-center gap-2 text-indigo-300 text-xs font-semibold">
            <span class="animate-spin">⏳</span>
            <span>Processing Sharp Transformation...</span>
          </div>

          <!-- Watermark Overlay Preview (Text) -->
          <div
            v-if="watermarkText"
            :class="[
              'absolute p-2 text-xs font-bold text-white/90 select-none pointer-events-none drop-shadow-md',
              watermarkPositionClass
            ]"
            :style="{ opacity: watermarkOpacity }"
          >
            {{ watermarkText }}
          </div>
        </div>

        
      </div>

      <!-- Controls Sidebar (3 cols) -->
      <div class="md:col-span-3 space-y-4 text-xs">
        <!-- Quick Actions & Preset Variant Buttons -->
        <div class="p-3.5 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 space-y-2 text-xs">
          <div class="font-semibold text-slate-300 light:text-slate-700 flex items-center justify-between">
            <span>Responsive WebP / AVIF Variants</span>
            <span class="text-[10px] text-indigo-400 font-mono">Phase 2 Batch Pipeline</span>
          </div>
          <div class="grid grid-cols-4 gap-2">
            <button
              @click="applyPreset('thumb')"
              class="px-2.5 py-1.5 rounded-lg bg-slate-900 light:bg-white hover:bg-indigo-950 text-slate-300 light:text-slate-700 hover:text-indigo-200 border border-slate-800 light:border-slate-200 hover:border-indigo-500/50 transition font-mono text-[11px]"
            >
              Thumb (150x150)
            </button>
            <button
              @click="applyPreset('medium')"
              class="px-2.5 py-1.5 rounded-lg bg-slate-900 light:bg-white hover:bg-indigo-950 text-slate-300 light:text-slate-700 hover:text-indigo-200 border border-slate-800 light:border-slate-200 hover:border-indigo-500/50 transition font-mono text-[11px]"
            >
              Medium (400x400)
            </button>
            <button
              @click="applyPreset('large')"
              class="px-2.5 py-1.5 rounded-lg bg-slate-900 light:bg-white hover:bg-indigo-950 text-slate-300 light:text-slate-700 hover:text-indigo-200 border border-slate-800 light:border-slate-200 hover:border-indigo-500/50 transition font-mono text-[11px]"
            >
              Large (1024x1024)
            </button>
            <button
              @click="applyPreset('full_hd')"
              class="px-2.5 py-1.5 rounded-lg bg-slate-900 light:bg-white hover:bg-indigo-950 text-slate-300 light:text-slate-700 hover:text-indigo-200 border border-slate-800 light:border-slate-200 hover:border-indigo-500/50 transition font-mono text-[11px]"
            >
              Full HD (1920x1080)
            </button>
          </div>
        </div>
        <!-- Section 1: Resize & Fit -->
        <div class="p-4 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 space-y-3">
          <h4 class="font-bold text-slate-200 light:text-slate-800 uppercase tracking-wider text-[11px] text-indigo-400">Dimensions & Fit</h4>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-slate-400 light:text-slate-600 mb-1">Width (px)</label>
              <input
                v-model.number="width"
                type="number"
                placeholder="Auto"
                class="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 font-mono text-xs focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label class="block text-slate-400 light:text-slate-600 mb-1">Height (px)</label>
              <input
                v-model.number="height"
                type="number"
                placeholder="Auto"
                class="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 font-mono text-xs focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label class="block text-slate-400 light:text-slate-600 mb-1">Fit Mode</label>
            <select
              v-model="fitMode"
              class="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 text-xs focus:border-indigo-500 focus:outline-none"
            >
              <option value="inside">Inside (Maintain Aspect Ratio)</option>
              <option value="cover">Cover (Crop to Fit)</option>
              <option value="contain">Contain (Letterbox)</option>
              <option value="fill">Fill (Stretch)</option>
            </select>
          </div>
        </div>

        <!-- Section 2: Format & Quality -->
        <div class="p-4 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 space-y-3">
          <h4 class="font-bold text-slate-200 light:text-slate-800 uppercase tracking-wider text-[11px] text-indigo-400">Output Format & Quality</h4>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-slate-400 light:text-slate-600 mb-1">Target Format</label>
              <select
                v-model="targetFormat"
                class="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 text-xs focus:border-indigo-500 focus:outline-none font-mono"
              >
                <option value="webp">WEBP (Recommended)</option>
                <option value="avif">AVIF (Ultra High Compress)</option>
                <option value="png">PNG (Lossless)</option>
                <option value="jpeg">JPEG</option>
              </select>
            </div>
            <div>
              <label class="block text-slate-400 light:text-slate-600 mb-1">Quality: {{ quality }}%</label>
              <input
                v-model.number="quality"
                type="range"
                min="10"
                max="100"
                class="w-full accent-indigo-500 cursor-pointer mt-1"
              />
            </div>
          </div>
        </div>

        <!-- Section 3: Filters & Rotation -->
        <div class="p-4 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 space-y-3">
          <h4 class="font-bold text-slate-200 light:text-slate-800 uppercase tracking-wider text-[11px] text-indigo-400">Filters & Adjustments</h4>
          <div class="flex items-center justify-between gap-3">
            <button
              @click="rotateAngle = (rotateAngle + 90) % 360"
              class="px-3 py-1.5 rounded-lg bg-slate-900 light:bg-white hover:bg-slate-800 light:bg-slate-100 border border-slate-800 light:border-slate-200 text-slate-300 light:text-slate-700 transition flex items-center gap-1.5"
            >
              <span>🔄 Rotate ({{ rotateAngle }}°)</span>
            </button>

            <label class="flex items-center gap-2 cursor-pointer text-slate-300 light:text-slate-700">
              <input
                v-model="isGrayscale"
                type="checkbox"
                class="rounded border-slate-700 light:border-slate-300 bg-slate-900 light:bg-white text-indigo-600"
              />
              <span>Grayscale</span>
            </label>
          </div>

          <div>
            <label class="block text-slate-400 light:text-slate-600 mb-1">Blur Filter: {{ blurPx }}px</label>
            <input
              v-model.number="blurPx"
              type="range"
              min="0"
              max="10"
              class="w-full accent-indigo-500 cursor-pointer mt-1"
            />
          </div>
        </div>

        <!-- Section 4: Watermark Overlay -->
        <div class="p-4 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 space-y-3">
          <h4 class="font-bold text-slate-200 light:text-slate-800 uppercase tracking-wider text-[11px] text-indigo-400">Watermark Overlay</h4>
          <div>
            <label class="block text-slate-400 light:text-slate-600 mb-1">Watermark Text</label>
            <input
              v-model="watermarkText"
              type="text"
              placeholder="e.g. © WhoobeCMS 2026"
              class="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 text-xs focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-slate-400 light:text-slate-600 mb-1">Position</label>
              <select
                v-model="watermarkPosition"
                class="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 text-xs focus:border-indigo-500 focus:outline-none"
              >
                <option value="southeast">Bottom Right</option>
                <option value="southwest">Bottom Left</option>
                <option value="center">Center</option>
                <option value="northeast">Top Right</option>
                <option value="northwest">Top Left</option>
              </select>
            </div>
            <div>
              <label class="block text-slate-400 light:text-slate-600 mb-1">Opacity: {{ Math.round(watermarkOpacity * 100) }}%</label>
              <input
                v-model.number="watermarkOpacity"
                type="range"
                min="0.1"
                max="1"
                step="0.1"
                class="w-full accent-indigo-500 cursor-pointer mt-1"
              />
            </div>
          </div>
        </div>
      
        
      </div>
    </div>

    <!-- Footer Action Bar -->
    <!--<div class="flex items-center justify-between border-t border-slate-800 light:border-slate-200 pt-4">
      <button
        @click="resetControls"
        class="px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-800 light:bg-slate-100 hover:bg-slate-700 light:bg-slate-200 text-slate-300 light:text-slate-700 transition"
      >
        Reset Options
      </button>

      <div class="flex items-center gap-2">
        <button
          @click="saveTransformedAsset(false)"
          :disabled="isProcessing"
          class="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 light:bg-slate-100 hover:bg-slate-700 light:bg-slate-200 text-indigo-300 border border-slate-700 light:border-slate-300 transition"
        >
          Save as Copy
        </button>

        <button
          @click="saveTransformedAsset(true)"
          :disabled="isProcessing"
          class="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition flex items-center gap-1.5"
        >
          <span>Save as New Version</span>
        </button>
      </div>
    </div>-->
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { AssetItem, useDamStore } from '../../stores/damStore'
import { SupportedImageFormat } from '@whoobe-cms/core'

const props = defineProps<{
  asset: AssetItem
}>()

const emit = defineEmits<{
  (e: 'saved'): void
}>()

const damStore = useDamStore()

const width = ref<number | undefined>(undefined)
const height = ref<number | undefined>(undefined)
const fitMode = ref<'inside' | 'cover' | 'contain' | 'fill'>('inside')
const targetFormat = ref<SupportedImageFormat>('webp')
const quality = ref<number>(85)
const rotateAngle = ref<number>(0)
const isGrayscale = ref<boolean>(false)
const blurPx = ref<number>(0)
const watermarkText = ref<string>('')
const watermarkPosition = ref<'southeast' | 'southwest' | 'center' | 'northeast' | 'northwest'>('southeast')
const watermarkOpacity = ref<number>(0.8)
const isProcessing = ref<boolean>(false)

const previewUrl = computed(() => props.asset.dataUrl || props.asset.url || '')

const previewStyle = computed(() => {
  const filters: string[] = []
  if (isGrayscale.value) filters.push('grayscale(100%)')
  if (blurPx.value > 0) filters.push(`blur(${blurPx.value}px)`)

  return {
    transform: `rotate(${rotateAngle.value}deg)`,
    filter: filters.join(' ') || undefined
  }
})

const watermarkPositionClass = computed(() => {
  switch (watermarkPosition.value) {
    case 'southwest': return 'bottom-2 left-2'
    case 'center': return 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
    case 'northeast': return 'top-2 right-2'
    case 'northwest': return 'top-2 left-2'
    case 'southeast':
    default: return 'bottom-2 right-2'
  }
})

function applyPreset(preset: 'thumb' | 'medium' | 'large' | 'full_hd') {
  switch (preset) {
    case 'thumb':
      width.value = 150
      height.value = 150
      fitMode.value = 'cover'
      break
    case 'medium':
      width.value = 400
      height.value = 400
      fitMode.value = 'inside'
      break
    case 'large':
      width.value = 1024
      height.value = 1024
      fitMode.value = 'inside'
      break
    case 'full_hd':
      width.value = 1920
      height.value = 1080
      fitMode.value = 'inside'
      break
  }
}

function resetControls() {
  width.value = undefined
  height.value = undefined
  fitMode.value = 'inside'
  targetFormat.value = 'webp'
  quality.value = 85
  rotateAngle.value = 0
  isGrayscale.value = false
  blurPx.value = 0
  watermarkText.value = ''
  watermarkPosition.value = 'southeast'
  watermarkOpacity.value = 0.8
}

async function saveTransformedAsset(asNewVersion: boolean) {
  isProcessing.value = true

  try {
    // The actual sharp transform always runs on the backend (the browser
    // has no way to run sharp) - this just sends the chosen options and
    // lets asset-processor fetch the original, transform it, and persist
    // the result (S3 + Postgres, with thumbnails generated the same way a
    // regular upload gets them).
    await damStore.transformAsset(props.asset.id, asNewVersion, {
      width: width.value,
      height: height.value,
      fit: fitMode.value,
      format: targetFormat.value,
      quality: quality.value,
      rotate: rotateAngle.value,
      grayscale: isGrayscale.value,
      blur: blurPx.value,
      watermarkText: watermarkText.value.trim() || undefined,
      watermarkPosition: watermarkPosition.value,
      watermarkOpacity: watermarkOpacity.value
    })

    emit('saved')
  } catch (e: any) {
    console.error('Failed to save transformed asset:', e)
    alert(e?.message || 'Failed to save transformed asset')
  } finally {
    isProcessing.value = false
  }
}
</script>
