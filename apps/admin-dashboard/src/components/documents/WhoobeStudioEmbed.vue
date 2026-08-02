<template>
  <div v-if="isOpen" class="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-2 z-50 animate-fade-in">
    <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full h-[95vh] p-4 flex flex-col space-y-3 shadow-2xl overflow-hidden">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold text-sm">
            🎨
          </div>
          <div>
            <h3 class="text-sm font-bold text-slate-100">Whoobe Studio</h3>
            <p class="text-[11px] text-slate-400 font-mono">{{ currentDocument?.title || 'Loading…' }} ({{ currentDocument?.slug }})</p>
          </div>
        </div>

        <div class="flex items-center gap-3 text-xs">
          <span v-if="isSaving" class="text-slate-500">saving…</span>
          <span v-else-if="lastSavedAt" class="text-emerald-400">saved {{ lastSavedAt.toLocaleTimeString() }}</span>
          <button
            @click="close"
            class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            ✕
          </button>
        </div>
      </div>

      <div class="flex-1 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden relative">
        <iframe
          v-if="studioSrc"
          ref="iframeRef"
          :src="studioSrc"
          class="w-full h-full border-0"
          @load="onIframeLoaded"
        ></iframe>

        <div v-if="isConnecting" class="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center space-y-3 text-slate-300">
          <span class="animate-spin text-2xl">⏳</span>
          <span class="text-xs font-semibold">Connecting to Whoobe Studio…</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import type { WhoobeDocumentLayout } from '@pimcore-custom/core'
import { WhoobeHostBridge } from '../../utils/whoobe-host-bridge'
import { useDamStore } from '../../stores/damStore'
import { useDocumentsStore } from '../../stores/documentsStore'
import { useToastStore } from '../../stores/toastStore'
import { getDefaultWhoobeStudioUrl, type CmsDocumentRecord } from '../../utils/documents-api'

const props = defineProps<{
  isOpen: boolean
  documentId: string | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const damStore = useDamStore()
const documentsStore = useDocumentsStore()
const toastStore = useToastStore()

const iframeRef = ref<HTMLIFrameElement | null>(null)
const isConnecting = ref(true)
const isSaving = ref(false)
const lastSavedAt = ref<Date | null>(null)
const currentDocument = ref<CmsDocumentRecord | null>(null)

const studioBaseUrl = getDefaultWhoobeStudioUrl()
// The studio has no other way to know who's allowed to talk to it - see
// WhoobeStudioBridge/WhoobeHostBridge, both of which refuse to fall back
// to "*" and require this to actually match.
const studioSrc = computed(() =>
  props.isOpen ? `${studioBaseUrl}/?parentOrigin=${encodeURIComponent(window.location.origin)}` : ''
)

let bridge: WhoobeHostBridge | null = null

function initializeBridge() {
  if (bridge) bridge.detachMessageListener()

  bridge = new WhoobeHostBridge(iframeRef.value, studioBaseUrl, {
    onDocumentUpdated: async (updatedLayout: WhoobeDocumentLayout) => {
      if (!currentDocument.value) return
      isSaving.value = true
      try {
        currentDocument.value = await documentsStore.updateDocument(
          currentDocument.value.id,
          updatedLayout.title,
          updatedLayout.rootBlock
        )
        lastSavedAt.value = new Date()
      } catch (e: any) {
        toastStore.show(e?.message || 'Failed to save document')
      } finally {
        isSaving.value = false
      }
    },
    // Not wired to a real asset-browser picker UI yet - returns whatever
    // asset happens to be first in the currently-loaded list as a
    // placeholder, same as before this rewrite.
    onRequestAssetPicker: async () => {
      const firstAsset = damStore.assets[0]
      if (firstAsset) {
        return { url: firstAsset.dataUrl || firstAsset.url || '', s3Key: firstAsset.s3Key }
      }
      return { url: '', s3Key: '' }
    },
    // Data Objects/PIM don't exist yet (see docs/plans/backend) - stubbed.
    onRequestDataObjectPicker: async () => {
      return { objectId: '', name: '' }
    }
  })
}

function onIframeLoaded() {
  isConnecting.value = false
  initializeBridge()
  if (bridge && currentDocument.value) {
    bridge.syncDocumentToStudio({
      id: currentDocument.value.id,
      title: currentDocument.value.title,
      slug: currentDocument.value.slug,
      locale: currentDocument.value.locale,
      rootBlock: currentDocument.value.rootBlock,
      metadata: currentDocument.value.metadata ?? undefined,
    })
  }
}

function close() {
  emit('close')
}

watch(
  () => [props.isOpen, props.documentId] as const,
  async ([isOpen, documentId]) => {
    if (!isOpen || !documentId) return
    isConnecting.value = true
    lastSavedAt.value = null
    try {
      currentDocument.value = await documentsStore.getDocument(documentId)
    } catch (e: any) {
      toastStore.show(e?.message || 'Failed to load document')
      currentDocument.value = null
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  if (bridge) bridge.detachMessageListener()
})
</script>
