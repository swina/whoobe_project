<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-slate-800 light:border-slate-200 pb-4">
      <div class="flex items-center gap-2.5">
        <div class="w-9 h-9 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-sm">
          🏷️
        </div>
        <div>
          <h3 class="text-base font-bold text-slate-100 light:text-slate-900 flex items-center gap-2">
            <span>Metatag Viewer & Editor</span>
            <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 light:bg-slate-50 text-emerald-400 border border-slate-800 light:border-slate-200">
              EXIF / IPTC / GPS (Phase 3)
            </span>
          </h3>
          <p class="text-xs text-slate-400 light:text-slate-600 font-mono">{{ asset.filename }} ({{ asset.pimcorePath }})</p>
        </div>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="flex items-center gap-2 border-b border-slate-800/80 light:border-slate-200/80 pb-2 text-xs font-semibold">
      <button
        @click="activeTab = 'technical'"
        :class="['px-3 py-1.5 rounded-lg transition', activeTab === 'technical' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200']"
      >
        ⚙ Technical
      </button>
      <button
        @click="activeTab = 'camera'"
        :class="['px-3 py-1.5 rounded-lg transition', activeTab === 'camera' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200']"
      >
        📷 Camera & Exposure
      </button>
      <button
        @click="activeTab = 'gps'"
        :class="['px-3 py-1.5 rounded-lg transition', activeTab === 'gps' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200']"
      >
        📍 Geolocation (GPS)
      </button>
      <button
        @click="activeTab = 'rights'"
        :class="['px-3 py-1.5 rounded-lg transition', activeTab === 'rights' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200']"
      >
        © Rights & Copyright
      </button>
      <button
        @click="activeTab = 'raw'"
        :class="['px-3 py-1.5 rounded-lg transition', activeTab === 'raw' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200']"
      >
        { } Raw EXIF
      </button>
    </div>

    <!-- Tab Content Area -->
    <div class="space-y-4 text-xs">
      <!-- 1. Technical Tab -->
      <div v-if="activeTab === 'technical'" class="grid grid-cols-2 gap-4">
        <div class="p-3.5 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 space-y-1">
          <span class="text-[11px] text-slate-500 font-medium">Dimensions</span>
          <div class="text-sm font-mono font-bold text-slate-100 light:text-slate-900">
            {{ form.technical.width || '1920' }} × {{ form.technical.height || '1080' }} px
          </div>
        </div>

        <div class="p-3.5 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 space-y-1">
          <span class="text-[11px] text-slate-500 font-medium">Aspect Ratio</span>
          <div class="text-sm font-mono font-bold text-indigo-300">
            {{ form.technical.aspectRatio || '16:9' }}
          </div>
        </div>

        <div class="p-3.5 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 space-y-1">
          <span class="text-[11px] text-slate-500 font-medium">Color Space & Profile</span>
          <div class="text-sm font-mono font-bold text-slate-200 light:text-slate-800 uppercase">
            {{ form.technical.colorSpace || 'sRGB' }}
          </div>
        </div>

        <div class="p-3.5 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 space-y-1">
          <span class="text-[11px] text-slate-500 font-medium">Format / MIME Type</span>
          <div class="text-sm font-mono font-bold text-emerald-400">
            {{ asset.fileType }} ({{ asset.mimeType }})
          </div>
        </div>
      </div>

      <!-- 2. Camera & Exposure Tab -->
      <div v-else-if="activeTab === 'camera'" class="grid grid-cols-2 gap-4">
        <div class="space-y-1">
          <label class="block text-slate-400 light:text-slate-600 font-medium">Camera Make</label>
          <input
            v-model="form.camera.make"
            type="text"
            placeholder="e.g. Sony, Canon, Apple"
            class="w-full px-3 py-2 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 font-mono text-xs focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div class="space-y-1">
          <label class="block text-slate-400 light:text-slate-600 font-medium">Camera Model</label>
          <input
            v-model="form.camera.model"
            type="text"
            placeholder="e.g. ILCE-7RM4, EOS R5"
            class="w-full px-3 py-2 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 font-mono text-xs focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div class="space-y-1">
          <label class="block text-slate-400 light:text-slate-600 font-medium">Lens Model</label>
          <input
            v-model="form.camera.lens"
            type="text"
            placeholder="e.g. FE 24-70mm F2.8 GM"
            class="w-full px-3 py-2 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 font-mono text-xs focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div class="space-y-1">
          <label class="block text-slate-400 light:text-slate-600 font-medium">ISO Speed Rating</label>
          <input
            v-model.number="form.camera.iso"
            type="number"
            placeholder="e.g. 100, 400, 1600"
            class="w-full px-3 py-2 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 font-mono text-xs focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div class="space-y-1">
          <label class="block text-slate-400 light:text-slate-600 font-medium">F-Number (Aperture)</label>
          <input
            v-model.number="form.camera.fNumber"
            type="number"
            step="0.1"
            placeholder="e.g. 2.8, 5.6"
            class="w-full px-3 py-2 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 font-mono text-xs focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div class="space-y-1">
          <label class="block text-slate-400 light:text-slate-600 font-medium">Exposure Time (Shutter Speed)</label>
          <input
            v-model="form.camera.exposureTime"
            type="text"
            placeholder="e.g. 1/250, 1/1000"
            class="w-full px-3 py-2 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 font-mono text-xs focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      <!-- 3. Geolocation & GPS Tab -->
      <div v-else-if="activeTab === 'gps'" class="grid grid-cols-2 gap-4">
        <div class="space-y-1">
          <label class="block text-slate-400 light:text-slate-600 font-medium">GPS Latitude (°)</label>
          <input
            v-model.number="form.gps.latitude"
            type="number"
            step="0.000001"
            placeholder="e.g. 37.774929"
            class="w-full px-3 py-2 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 font-mono text-xs focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div class="space-y-1">
          <label class="block text-slate-400 light:text-slate-600 font-medium">GPS Longitude (°)</label>
          <input
            v-model.number="form.gps.longitude"
            type="number"
            step="0.000001"
            placeholder="e.g. -122.419416"
            class="w-full px-3 py-2 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 font-mono text-xs focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div class="space-y-1 col-span-2">
          <label class="block text-slate-400 light:text-slate-600 font-medium">Altitude (m)</label>
          <input
            v-model.number="form.gps.altitude"
            type="number"
            placeholder="e.g. 15.5"
            class="w-full px-3 py-2 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 font-mono text-xs focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      <!-- 4. Rights & IPTC Tab -->
      <div v-else-if="activeTab === 'rights'" class="grid grid-cols-2 gap-4">
        <div class="space-y-1">
          <label class="block text-slate-400 light:text-slate-600 font-medium">Artist / Author</label>
          <input
            v-model="form.rights.artist"
            type="text"
            placeholder="e.g. Whoobe Media Team"
            class="w-full px-3 py-2 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 text-xs focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div class="space-y-1">
          <label class="block text-slate-400 light:text-slate-600 font-medium">Copyright Statement</label>
          <input
            v-model="form.rights.copyright"
            type="text"
            placeholder="e.g. © 2026 WhoobeCMS. All rights reserved."
            class="w-full px-3 py-2 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 text-xs focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div class="space-y-1">
          <label class="block text-slate-400 light:text-slate-600 font-medium">Creation Date</label>
          <input
            v-model="form.rights.createDate"
            type="text"
            placeholder="e.g. 2026-08-01T10:00:00Z"
            class="w-full px-3 py-2 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 font-mono text-xs focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div class="space-y-1">
          <label class="block text-slate-400 light:text-slate-600 font-medium">Software / Processing Tool</label>
          <input
            v-model="form.rights.software"
            type="text"
            placeholder="e.g. WhoobeCMS DAM Phase 3 Engine"
            class="w-full px-3 py-2 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 text-xs focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      <!-- 5. Raw EXIF JSON Inspector -->
      <div v-else-if="activeTab === 'raw'" class="p-3.5 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 overflow-x-auto max-h-64 font-mono text-[11px] text-emerald-300">
        <pre>{{ JSON.stringify(form, null, 2) }}</pre>
      </div>
    </div>

    <!-- Footer Actions -->
    <div class="flex items-center justify-between border-t border-slate-800 light:border-slate-200 pt-4">
      <button
        @click="populateForm"
        class="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 light:bg-slate-100 hover:bg-slate-700 light:bg-slate-200 text-slate-300 light:text-slate-700 transition"
      >
        Discard Changes
      </button>

      <button
        @click="saveMetadata"
        class="px-5 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition flex items-center gap-1.5"
      >
        <span>Save Metadata Changes</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { AssetItem, useDamStore } from '../../stores/damStore'
import {
  AssetTechnicalMetadata,
  AssetCameraMetadata,
  AssetGpsMetadata,
  AssetRightsMetadata
} from '@whoobe-cms/core'

const props = defineProps<{
  asset: AssetItem
}>()

const emit = defineEmits<{
  (e: 'saved'): void
}>()

const damStore = useDamStore()
const isSaving = ref(false)

const activeTab = ref<'technical' | 'camera' | 'gps' | 'rights' | 'raw'>('technical')

interface EditableMetadata {
  technical: AssetTechnicalMetadata
  camera: AssetCameraMetadata
  gps: AssetGpsMetadata
  rights: AssetRightsMetadata
  raw?: Record<string, any>
}

const form = reactive<EditableMetadata>({
  technical: {},
  camera: {},
  gps: {},
  rights: {}
})

function populateForm() {
  const meta = props.asset.metadata || { technical: {} }
  form.technical = { ...meta.technical }
  form.camera = { ...meta.camera }
  form.gps = { ...meta.gps }
  form.rights = { ...meta.rights }
  form.raw = meta.raw || {}
}

async function saveMetadata() {
  isSaving.value = true
  try {
    await damStore.updateAssetMetadata(props.asset.id, {
      technical: { ...form.technical },
      camera: { ...form.camera },
      gps: { ...form.gps },
      rights: { ...form.rights },
      raw: form.raw
    })
    emit('saved')
  } catch (e: any) {
    alert(e?.message || 'Failed to save metadata')
  } finally {
    isSaving.value = false
  }
}

populateForm()
</script>
