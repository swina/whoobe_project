<template>
  <div class="h-full flex flex-col gap-2">
    <div class="shrink-0 flex items-center justify-end text-xs">
      <span v-if="isSaving" class="text-slate-500">saving…</span>
      <span v-else-if="lastSavedAt" class="text-emerald-400">saved {{ lastSavedAt.toLocaleTimeString() }}</span>
    </div>

    <div class="flex-1 min-h-0 rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 overflow-hidden relative">
      <iframe
        v-if="studioSrc"
        ref="iframeRef"
        :src="studioSrc"
        class="w-full h-full border-0"
        @load="onIframeLoaded"
      ></iframe>

      <div v-if="isConnecting" class="absolute inset-0 bg-slate-950/80 light:bg-white/80 backdrop-blur-xs flex flex-col items-center justify-center space-y-3 text-slate-300 light:text-slate-700">
        <span class="animate-spin text-2xl">⏳</span>
        <span class="text-xs font-semibold">Connecting to Whoobe Studio…</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import type { WhoobeDocumentLayout } from '@pimcore-custom/core'
import { WhoobeHostBridge } from '../../utils/whoobe-host-bridge'
import { useDamStore } from '../../stores/damStore'
import { useDocumentsStore } from '../../stores/documentsStore'
import { useToastStore } from '../../stores/toastStore'
import { getDefaultWhoobeStudioUrl, type CmsDocumentRecord } from '../../utils/documents-api'

const props = defineProps<{
  documentId: string
}>()

const emit = defineEmits<{
  (e: 'saved', document: CmsDocumentRecord): void
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
const studioSrc = `${studioBaseUrl}/?parentOrigin=${encodeURIComponent(window.location.origin)}`

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
        emit('saved', currentDocument.value)
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

async function load() {
  isConnecting.value = true
  lastSavedAt.value = null
  try {
    currentDocument.value = await documentsStore.getDocument(props.documentId)
  } catch (e: any) {
    toastStore.show(e?.message || 'Failed to load document')
    currentDocument.value = null
  }
}

onMounted(load)
watch(() => props.documentId, load)

onUnmounted(() => {
  if (bridge) bridge.detachMessageListener()
})
</script>
