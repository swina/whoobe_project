<template>
  <div v-if="document" class="h-full flex flex-col">
    <div class="shrink-0 px-6 pt-6 pb-3 space-y-3">
      <div class="flex items-center gap-2">
        <h3 class="text-lg font-bold text-slate-100">{{ document.title }}</h3>
        <span
          :class="[
            'px-2 py-0.5 text-[10px] font-bold rounded-full border uppercase',
            document.status === 'published' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
          ]"
        >
          {{ document.status }}
        </span>
      </div>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-mono">
        <span>{{ document.slug }}</span>
        <span>locale: {{ document.locale }}</span>
        <span v-if="document.pimcoreId">pimcore id: {{ document.pimcoreId }}</span>
        <span>updated: {{ new Date(document.updatedAt).toLocaleString() }}</span>
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
      <div class="rounded-2xl bg-slate-900/60 border border-slate-800 p-6">
        <BlockNodePreview :node="document.rootBlock" />
      </div>
    </div>
  </div>

  <div v-else-if="isLoading" class="p-6 text-center text-xs text-slate-500">Loading document…</div>

  <div v-else class="p-6">
    <div class="rounded-2xl bg-slate-900/40 border border-slate-800/80 p-12 text-center text-xs text-slate-500">
      This document is no longer available.
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useDocumentsStore } from '../../stores/documentsStore'
import type { CmsDocumentRecord } from '../../utils/documents-api'
import BlockNodePreview from './BlockNodePreview.vue'

const props = defineProps<{
  documentId: string
}>()

const documentsStore = useDocumentsStore()
const document = ref<CmsDocumentRecord | null>(null)
const isLoading = ref(true)

async function load() {
  isLoading.value = true
  try {
    document.value = await documentsStore.getDocument(props.documentId)
  } catch (e) {
    console.warn('Failed to load document:', e)
    document.value = null
  } finally {
    isLoading.value = false
  }
}

onMounted(load)
watch(() => props.documentId, load)
</script>
