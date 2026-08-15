<template>
  <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider text-xs">Websites</h3>
        <p class="text-xs text-slate-500 mt-1">Manage websites, domains, and supported locales. Each website can have its own set of pages and menus.</p>
      </div>
      <button @click="createNewWebsite" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white">+ New Website</button>
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
            <span>default: {{ website.defaultLocale }}</span>
            <span>locales: {{ website.supportedLocales.join(', ') }}</span>
            <span v-if="website.domains.length">domains: {{ website.domains.join(', ') }}</span>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0 ml-3">
          <button @click="openPaths(website)" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300">Paths</button>
          <button @click="openTemplates(website)" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300">Templates</button>
          <button @click="openWebsiteTab(website)" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300">Edit</button>
          <button @click="handleDelete(website)" class="text-xs font-semibold text-rose-400 hover:text-rose-300">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useWebsitesStore } from '../../stores/websitesStore'
import { useTabsStore } from '../../stores/tabsStore'
import type { WebsiteRecord } from '../../utils/websites-api'

const websitesStore = useWebsitesStore()
const tabsStore = useTabsStore()

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