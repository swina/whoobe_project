<template>
  <div v-if="isOpen" class="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-2 z-50 animate-fade-in">
    <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full h-[95vh] p-4 flex flex-col space-y-3 shadow-2xl overflow-hidden">
      <!-- Top Action Toolbar -->
      <div class="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold text-sm">
            🎨
          </div>
          <div>
            <h3 class="text-sm font-bold text-slate-100 flex items-center gap-2">
              <span>Whoobe Studio Visual Block Editor</span>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-indigo-400 border border-slate-800">
                Phase 5 Vue3/React Bridge
              </span>
            </h3>
            <p class="text-[11px] text-slate-400 font-mono">{{ documentLayout?.title || 'Untitled Document' }} ({{ documentLayout?.slug }})</p>
          </div>
        </div>

        <div class="flex items-center gap-2 text-xs">
          <!-- Preset Layout Dropdown -->
          <select
            @change="applyPresetLayout($event)"
            class="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-mono focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="">Inject Layout Preset...</option>
            <option value="hero">Hero Banner Preset</option>
            <option value="features">Feature Grid Preset</option>
          </select>

          <button
            @click="saveAndClose"
            class="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow transition flex items-center gap-1.5"
          >
            <span>Save & Publish Layout</span>
          </button>

          <button
            @click="close"
            class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Main Embedded iFrame Stage -->
      <div class="flex-1 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden relative">
        <iframe
          ref="iframeRef"
          :src="studioUrl"
          class="w-full h-full border-0"
          @load="onIframeLoaded"
        ></iframe>

        <div v-if="isLoading" class="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center space-y-3 text-slate-300">
          <span class="animate-spin text-2xl">⏳</span>
          <span class="text-xs font-semibold">Connecting Whoobe Studio PostMessage RPC Bridge...</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import {
  WhoobeDocumentLayout,
  createEmptyWhoobeDocument,
  createHeroBannerPreset,
  createFeatureGridPreset,
} from '@pimcore-custom/core'
import { WhoobeHostBridge } from '../../utils/whoobe-host-bridge'
import { useDamStore } from '../../stores/damStore'

const props = defineProps<{
  isOpen: boolean
  documentLayout?: WhoobeDocumentLayout | null
  studioUrl?: string
}>()

const emit = defineEmits(['close', 'save'])

const damStore = useDamStore()
const iframeRef = ref<HTMLIFrameElement | null>(null)
const isLoading = ref<boolean>(true)
const currentLayout = ref<WhoobeDocumentLayout>(createEmptyWhoobeDocument('Whoobe CMS Page', '/whoobe-demo'))

const studioUrl = props.studioUrl || 'http://localhost:5173'
let bridge: WhoobeHostBridge | null = null

function initializeBridge() {
  if (bridge) bridge.detachMessageListener()

  bridge = new WhoobeHostBridge(iframeRef.value, {
    onDocumentUpdated: (updatedLayout: WhoobeDocumentLayout) => {
      currentLayout.value = updatedLayout
    },
    onRequestAssetPicker: async () => {
      const firstAsset = damStore.assets[0]
      if (firstAsset) {
        return { url: firstAsset.dataUrl || firstAsset.url || '', s3Key: firstAsset.s3Key }
      }
      return { url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80', s3Key: 'default.jpg' }
    },
    onRequestDataObjectPicker: async () => {
      return { objectId: 'obj_prod_101', name: 'Sample PIM Product Object' }
    }
  })
}

function onIframeLoaded() {
  isLoading.value = false
  initializeBridge()

  if (props.documentLayout) {
    currentLayout.value = props.documentLayout
  }

  if (bridge) {
    bridge.syncDocumentToStudio(currentLayout.value)
  }
}

function applyPresetLayout(e: Event) {
  const val = (e.target as HTMLSelectElement).value
  if (!val) return

  if (val === 'hero') {
    const heroNode = createHeroBannerPreset('Transformative Headless CMS', 'Powered by Whoobe Studio & TypeScript Engine')
    currentLayout.value.rootBlock.children = [heroNode]
  } else if (val === 'features') {
    const gridNode = createFeatureGridPreset([
      { title: 'Sharp Processing', description: 'High-speed image transformations' },
      { title: 'Pimcore Migration', description: 'Automated document & areablock ETL' },
      { title: 'S3 Object Storage', description: 'MinIO DAM engine integration' }
    ])
    currentLayout.value.rootBlock.children = [gridNode]
  }

  if (bridge) {
    bridge.syncDocumentToStudio(currentLayout.value)
  }
}

function close() {
  emit('close')
}

function saveAndClose() {
  emit('save', currentLayout.value)
  close()
}

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    isLoading.value = true
    if (props.documentLayout) {
      currentLayout.value = props.documentLayout
    }
  }
})

onUnmounted(() => {
  if (bridge) bridge.detachMessageListener()
})
</script>
