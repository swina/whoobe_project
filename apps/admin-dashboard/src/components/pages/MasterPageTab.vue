<template>
  <div v-if="page || isNewPage" class="h-full flex flex-col">
    <div class="flex shrink-0 px-6 pt-2 space-y-1 gap-6">
      <div class="flex items-center gap-2">
        <h4 v-if="page" class="text-lg font-bold text-slate-100 light:text-slate-900">{{ page.title }}</h4>
        <h4 v-else class="text-lg font-bold text-slate-100 light:text-slate-900">New Page</h4>
        <span
          v-if="page"
          :class="[
            'px-2 py-0.5 text-[10px] font-bold rounded-full border uppercase',
            page.published ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
          ]"
        >
          {{ page.published ? 'published' : (page.workflowState || 'draft') }}
        </span>
        <span v-else class="px-2 py-0.5 text-[10px] font-bold rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 uppercase">new</span>
      </div>
      <div v-if="page" class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-mono">
        <span>{{ page.slug }}</span>
        <span>locale: {{ page.locale }}</span>
        <span v-if="page.pimcoreId">pimcore id: {{ page.pimcoreId }}</span>
        <span>updated: {{ new Date(page.updatedAt).toLocaleString() }}</span>
      </div>
    

    <div class="flex shrink-0 items-center gap-2 px-6 text-xs font-semibold">
      <button
      type="button"
      :disabled="isNewPage"
      :title="fullscreen ? 'Close full screen' : 'Open editor full screen'"
      class="disabled:opacity-30"
      @click="fullscreen = !fullscreen"
      >
        <Maximize v-if="!fullscreen" class="w-6 h-6 text-violet-700" />
        <Minimize v-else class="w-6 h-6 text-violet-700" />
      </button>
      <button
        v-for="tab in subTabs" :key="tab.key"
        @click="setSubTab(tab.key)"
        :class="['px-3 py-1.5 rounded-lg transition flex items-center gap-1.5', activeSubTab === tab.key ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200']"
      >
        <span>{{ tab.icon }}</span>
        <span>{{ tab.label }}</span>
        
      </button>
      
      <a v-if="page" :href="openPreviewUrl" target="_blank" rel="noopener noreferrer" title="Open in a new tab"><ExternalLink class="w-6 h-6 text-violet-700" /></a>
    </div>
    </div>
    <div class="flex-1 min-h-0 px-2 pb-2 pt-2">
      <div v-show="activeSubTab === 'editor'" class="h-full rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-2">
        <WhoobeOneEmbed v-if="!isNewPage" :page-id="props.pageId" />
        <div v-else class="h-full flex items-center justify-center text-xs text-slate-500">Save this page first to open the editor.</div>
      </div>
      <div v-show="activeSubTab === 'settings'" class="h-full overflow-y-auto rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 px-6 py-4">
        <PageSettingsTab v-if="!isNewPage" :page-id="props.pageId" @saved="onSettingsSaved" />
        <PageCreateForm v-else @created="onPageCreated" @cancel="closeTab" />
      </div>
      <div v-show="activeSubTab === 'preview'" class="h-full overflow-y-auto rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6">
        <PagePreviewTab v-if="!isNewPage" :page-id="props.pageId" />
        <div v-else class="h-full flex items-center justify-center text-xs text-slate-500">Save this page first to preview it.</div>
        
      </div>
    </div>
  </div>

  <!-- Full-screen editor overlay -->
  <div v-if="fullscreen && !isNewPage" class="fixed inset-0 z-[10000] bg-slate-950 flex flex-col">
    <div class="shrink-0 flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800">
      <span class="text-sm font-semibold text-slate-100">{{ page?.title || 'Editor' }}</span>
      <div class="flex items-center gap-2">
        <span class="text-xs text-slate-500 hidden sm:inline">Edit the page, then close.</span>
        <button type="button" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-white" @click="fullscreen = false">Close editor</button>
      </div>
    </div>
    <div class="flex-1 min-h-0">
      <WhoobeOneEmbed v-if="!isNewPage" :page-id="props.pageId" />
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
import { ref, computed, onMounted, watch } from 'vue'
import { usePagesStore } from '../../stores/pagesStore'
import { useWebsitesStore } from '../../stores/websitesStore'
import { useTabsStore, type PageSubTab, pageTabId } from '../../stores/tabsStore'
import type { WhoobeOnePage } from '../../utils/pages-api'
import WhoobeOneEmbed from './WhoobeOneEmbed.vue'
import PageSettingsTab from './PageSettingsTab.vue'
import PagePreviewTab from './PagePreviewTab.vue'
import PageCreateForm from './PageCreateForm.vue'
import { Eye, ExternalLink, LayoutDashboard, Settings, Maximize, Minimize } from '@lucide/vue'
import { getSitePreviewBaseUrl } from '../../utils/editor-urls'

const props = defineProps<{
  pageId: string
}>()

const pagesStore = usePagesStore()
const websitesStore = useWebsitesStore()
const tabsStore = useTabsStore()
const page = ref<WhoobeOnePage | null>(null)
const isLoading = ref(true)
const fullscreen = ref(false)

const isNewPage = computed(() => props.pageId.startsWith('new:'))

const subTabs: { key: PageSubTab; label: string; icon: string }[] = [
  { key: 'editor', label: 'Editor', icon: '🎨' },
  { key: 'settings', label: 'Settings', icon: '⚙️'},
  { key: 'preview', label: 'Preview', icon: '👁️'}
]

const currentTab = computed(() => tabsStore.tabs.find((t) => t.itemKind === 'page' && t.itemId === props.pageId))
const activeSubTab = computed<PageSubTab>(() => currentTab.value?.pageSubTab ?? (isNewPage.value ? 'settings' : 'editor'))



function setSubTab(tab: PageSubTab) {
  tabsStore.setPageSubTab(props.pageId, tab)
}

// Was a plain `let`, reassigned inside load() below - not just the
// implicit-any type error this triggered (assigned only inside an async
// function, so TS can't narrow its type at the declaration site), but a
// real functional bug: a bare variable mutated outside Vue's reactivity
// system never triggers a re-render, so the template's `:href="
// openPreviewUrl"` stayed stuck on its initial `undefined` (rendering
// literally `href="undefined"`) even after load() finished fetching the
// page - clicking "Open in a new tab" before some unrelated re-render
// happened to occur would navigate to a nonsense relative "undefined"
// URL. A computed, deriving from the same reactive `page`/`currentTab`
// state load() already sets, updates the anchor automatically.
const openPreviewUrl = computed(() => {
  const p = page.value
  if (!p) return ''
  const slug = currentTab.value?.pagePreviewPath || p.slug || ''
  const website = p.websiteId ? websitesStore.websites.find((w) => w.id === p.websiteId) : undefined
  const rootPath = website?.rootPath || ''
  const locale = currentTab.value?.pagePreviewLocale || p.locale || 'en'
  const query = `?locale=${encodeURIComponent(locale)}${rootPath ? `&rootPath=${encodeURIComponent(rootPath)}` : ''}`
  return `${getSitePreviewBaseUrl()}${rootPath}${slug}${query}`
})

async function load() {
  if (isNewPage.value) return
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

function onSettingsSaved(updated: WhoobeOnePage) {
  page.value = updated
}

function onPageCreated(created: WhoobeOnePage) {
  page.value = created
  const oldId = props.pageId
  const tab = tabsStore.tabs.find((t) => t.itemKind === 'page' && t.itemId === oldId)
  if (tab) {
    tab.id = pageTabId(created.id)
    tab.itemId = created.id
    tab.pageSubTab = 'editor'
  }
  
}

function closeTab() {
  tabsStore.closeTab(pageTabId(props.pageId))
}

onMounted(load)
watch(() => props.pageId, load)
</script>