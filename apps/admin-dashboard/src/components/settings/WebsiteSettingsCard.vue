<template>
  <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider text-xs">Websites</h3>
        <p class="text-xs text-slate-500 mt-1">Manage websites, domains, and supported locales. Each website can have its own set of pages and menus.</p>
      </div>
      <div class="flex items-center gap-2">
        <!---<button @click="showAiModal = true" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 flex items-center gap-1.5">
          <Sparkles class="w-3.5 h-3.5" />
          AI Website Wizard
        </button>--->
        <button @click="createNewWebsite" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white">+ New Website</button>
        <button @click="triggerImport" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200">Import</button>
        <input ref="importFileInput" type="file" accept=".json" class="hidden" @change="handleImportFile" />
      </div>
    </div>

    <div v-if="websitesStore.isLoading && websitesStore.websites.length === 0" class="text-xs text-slate-500 text-center py-4">Loading websites…</div>

    <div v-else-if="websitesStore.websites.length === 0" class="text-xs text-slate-500 text-center py-4 italic">No websites configured yet. Create one to get started.</div>

    <div v-else class="space-y-2">
      <div v-for="website in websitesStore.websites" :key="website.id" class="flex items-center justify-between px-3 py-2.5 rounded-lg border border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-white/40">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-slate-200 light:text-slate-800">{{ website.name }}</span>
          </div>
          <div class="text-xs text-slate-500 font-mono mt-0.5 space-x-3">
            <span>id: <button @click="copyId(website.id)" class="text-indigo-400 hover:text-indigo-300 cursor-pointer" :title="'Click to copy'">{{ website.id.slice(0, 8) }}…</button></span>
            <span>default: {{ website.defaultLocale }}</span>
            <span>locales: {{ website.supportedLocales.join(', ') }}</span>
            <span v-if="website.domains.length">domains: {{ website.domains.join(', ') }}</span>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0 ml-3">
          <button @click="openPublish(website)" class="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1"><Rocket class="w-3 h-3" />Publish</button>
          <button @click="exportWebsiteAction(website)" class="text-xs font-semibold text-emerald-400 hover:text-emerald-300">Export</button>
          <button @click="openPaths(website)" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300">Paths</button>
          <button @click="openTemplates(website)" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300">Templates</button>
          <button @click="openWebsiteTab(website)" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300">Edit</button>
          <button @click="handleDelete(website)" class="text-xs font-semibold text-rose-400 hover:text-rose-300">Delete</button>
        </div>
      </div>
    </div>

    <AiWebsiteWizardModal :is-open="showAiModal" @close="showAiModal = false" />
    <WebsitePublishModal :is-open="showPublishModal" :website="publishTarget" @close="showPublishModal = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Sparkles, Rocket } from '@lucide/vue'
import { useWebsitesStore } from '../../stores/websitesStore'
import { useTabsStore } from '../../stores/tabsStore'
import { exportWebsite, importWebsite } from '../../utils/websites-api'
import { getDefaultCoreApiUrl } from '../../utils/auth-api'
import type { WebsiteRecord } from '../../utils/websites-api'
import AiWebsiteWizardModal from './AiWebsiteWizardModal.vue'
import WebsitePublishModal from './WebsitePublishModal.vue'

const websitesStore = useWebsitesStore()
const tabsStore = useTabsStore()
const showAiModal = ref(false)
const showPublishModal = ref(false)
const publishTarget = ref<WebsiteRecord | null>(null)
const importFileInput = ref<HTMLInputElement | null>(null)

function openPublish(website: WebsiteRecord) {
  publishTarget.value = website
  showPublishModal.value = true
}

function openWebsiteTab(website: WebsiteRecord) {
  tabsStore.openWebsite(website.id)
}

function openPaths(website: WebsiteRecord) {
  tabsStore.openWebsite(website.id, 'paths')
}

function openTemplates(website: WebsiteRecord) {
  tabsStore.openWebsite(website.id, 'templates')
}

async function createNewWebsite() {
  const name = prompt('Website name:', '')
  if (!name?.trim()) return
  const defaultLocale = prompt('Default locale:', 'en') || 'en'
  try {
    const created = await websitesStore.create({ name: name.trim(), defaultLocale })
    tabsStore.openWebsite(created.id)
  } catch (e: any) {
    alert(e?.message || 'Failed to create website')
  }
}

async function exportWebsiteAction(website: WebsiteRecord) {
  try {
    const baseUrl = getDefaultCoreApiUrl()
    const payload = await exportWebsite(baseUrl, website.id)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${website.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-export.json`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e: any) {
    alert(e?.message || 'Failed to export website')
  }
}

function copyId(id: string) {
  try {
    navigator.clipboard.writeText(id).then(() => {
      // success
    })
  } catch {
    // Fallback for older browsers or non-HTTPS
    const textarea = document.createElement('textarea')
    textarea.value = id
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
}

function triggerImport() {
  importFileInput.value?.click()
}

async function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const payload = JSON.parse(text)
    const baseUrl = getDefaultCoreApiUrl()
    const result = await importWebsite(baseUrl, payload)
    await websitesStore.refreshWebsites()
    alert(`Website imported successfully as "${result.website.name}".`)
  } catch (e: any) {
    alert(e?.message || 'Failed to import website')
  }
  input.value = ''
}

async function handleDelete(website: WebsiteRecord) {
  if (!confirm(`Delete website "${website.name}"? This will also delete its menus and unlink its pages.`)) return
  try {
    await websitesStore.remove(website.id)
  } catch (e: any) {
    alert(e?.message || 'Failed to delete website')
  }
}

onMounted(() => websitesStore.refreshWebsites())
</script>