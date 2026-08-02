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
        <div class="flex-1"></div>
        <button
          @click="saveStatus('draft')"
          :disabled="isSavingStatus !== null"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50"
        >
          {{ isSavingStatus === 'draft' ? 'Saving…' : 'Save as Draft' }}
        </button>
        <button
          @click="saveStatus('published')"
          :disabled="isSavingStatus !== null"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
        >
          {{ isSavingStatus === 'published' ? 'Publishing…' : 'Save and Publish' }}
        </button>
      </div>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-mono">
        <span>{{ document.slug }}</span>
        <span>locale: {{ document.locale }}</span>
        <span v-if="document.pimcoreId">pimcore id: {{ document.pimcoreId }}</span>
        <span>updated: {{ new Date(document.updatedAt).toLocaleString() }}</span>
      </div>

      <!-- Sub-tab nav: Editor is the default landing view (matches asset
           tabs opening straight into content, not behind an extra click) -
           Preview is the read-only rendered-HTML view, a sibling sub-tab. -->
      <div class="flex items-center gap-2 text-xs font-semibold pt-1">
        <button
          @click="setSubTab('editor')"
          :class="['px-3 py-1.5 rounded-lg transition flex items-center gap-1.5', activeSubTab === 'editor' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800']"
        >
          <span>🎨</span>
          <span>Editor</span>
        </button>
        <button
          @click="setSubTab('preview')"
          :class="['px-3 py-1.5 rounded-lg transition flex items-center gap-1.5', activeSubTab === 'preview' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800']"
        >
          <Eye class="w-3.5 h-3.5" />
          <span>Preview</span>
        </button>
      </div>
    </div>

    <!-- Sub-tab content: both mounted (v-show) so the live editor iframe/
         bridge connection survives switching to Preview and back. -->
    <div class="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
      <div v-show="activeSubTab === 'editor'" class="h-full rounded-2xl bg-slate-900/60 border border-slate-800 p-6">
        <WhoobeStudioEmbed :document-id="props.documentId" @saved="onSaved" />
      </div>
      <div v-show="activeSubTab === 'preview'" class="rounded-2xl bg-slate-900/60 border border-slate-800 p-6">
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
import { ref, computed, onMounted, watch } from 'vue'
import { Eye } from '@lucide/vue'
import { useDocumentsStore } from '../../stores/documentsStore'
import { useTabsStore, DocumentSubTab } from '../../stores/tabsStore'
import { useToastStore } from '../../stores/toastStore'
import type { CmsDocumentRecord } from '../../utils/documents-api'
import BlockNodePreview from './BlockNodePreview.vue'
import WhoobeStudioEmbed from './WhoobeStudioEmbed.vue'

const props = defineProps<{
  documentId: string
}>()

const documentsStore = useDocumentsStore()
const tabsStore = useTabsStore()
const toastStore = useToastStore()
const document = ref<CmsDocumentRecord | null>(null)
const isLoading = ref(true)
const isSavingStatus = ref<'draft' | 'published' | null>(null)

const currentTab = computed(() => tabsStore.tabs.find((t) => t.itemKind === 'document' && t.itemId === props.documentId))
const activeSubTab = computed<DocumentSubTab>(() => currentTab.value?.documentSubTab ?? 'editor')

function setSubTab(tab: DocumentSubTab) {
  tabsStore.setDocumentSubTab(props.documentId, tab)
}

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

// The editor autosaves on every edit (see WhoobeStudioEmbed.vue) - keep
// this tab's own copy in sync so switching to Preview shows the latest
// content without needing a re-fetch.
function onSaved(updated: CmsDocumentRecord) {
  document.value = updated
}

// Explicit status transition, distinct from the editor's continuous
// autosave - resends the current title/rootBlock (kept live-accurate by
// onSaved above) alongside the new status, since the PATCH route requires
// both on every call.
async function saveStatus(status: 'draft' | 'published') {
  if (!document.value) return
  isSavingStatus.value = status
  try {
    document.value = await documentsStore.setDocumentStatus(
      props.documentId,
      document.value.title,
      document.value.rootBlock,
      status
    )
  } catch (e: any) {
    toastStore.show(e?.message || `Failed to save as ${status}`)
  } finally {
    isSavingStatus.value = null
  }
}

onMounted(load)
watch(() => props.documentId, load)
</script>
