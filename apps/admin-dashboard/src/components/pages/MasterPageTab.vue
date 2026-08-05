<template>
  <div v-if="page" class="h-full flex flex-col">
    <div class="shrink-0 px-6 pt-6 pb-3 space-y-3">
      <div class="flex items-center gap-2">
        <h3 class="text-lg font-bold text-slate-100 light:text-slate-900">{{ page.title }}</h3>
        <span
          :class="[
            'px-2 py-0.5 text-[10px] font-bold rounded-full border uppercase',
            page.published ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
          ]"
        >
          {{ page.published ? 'published' : (page.workflowState || 'draft') }}
        </span>
      </div>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-mono">
        <span>{{ page.slug }}</span>
        <span>locale: {{ page.locale }}</span>
        <span v-if="page.pimcoreId">pimcore id: {{ page.pimcoreId }}</span>
        <span>updated: {{ new Date(page.updatedAt).toLocaleString() }}</span>
      </div>
    </div>

    <!-- This header is a snapshot taken when the tab opened - unlike
         MasterDocumentTab.vue/WhoobeStudioEmbed.vue, there is no bridge here
         to notify us of edits made inside the embedded editor (see
         WhoobeOneEmbed.vue's own header comment for why one isn't needed),
         so title/status here can go stale during a long editing session.
         Closing and reopening the tab (or navigating back to the Pages
         list, which does re-fetch) picks up the latest values. -->
    <div class="flex-1 min-h-0 px-6 pb-6">
      <div class="h-full rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6">
        <WhoobeOneEmbed :page-id="props.pageId" />
      </div>
    </div>
  </div>

  <div v-else-if="isLoading" class="p-6 text-center text-xs text-slate-500">Loading page…</div>

  <div v-else class="p-6">
    <div class="rounded-2xl bg-slate-900/40 light:bg-white/40 border border-slate-800/80 light:border-slate-200/80 p-12 text-center text-xs text-slate-500">
      This page is no longer available.
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { usePagesStore } from '../../stores/pagesStore'
import type { WhoobeOnePage } from '../../utils/pages-api'
import WhoobeOneEmbed from './WhoobeOneEmbed.vue'

const props = defineProps<{
  pageId: string
}>()

const pagesStore = usePagesStore()
const page = ref<WhoobeOnePage | null>(null)
const isLoading = ref(true)

async function load() {
  isLoading.value = true
  try {
    page.value = await pagesStore.getPage(props.pageId)
  } catch (e) {
    console.warn('Failed to load page:', e)
    page.value = null
  } finally {
    isLoading.value = false
  }
}

onMounted(load)
watch(() => props.pageId, load)
</script>
