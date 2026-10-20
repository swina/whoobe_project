<template>
  <div class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-6 space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800 uppercase tracking-wider text-xs">Websites</h3>
        <p class="text-xs text-slate-500 mt-1">Manage websites, domains, and supported locales. Each website can have its own set of pages and menus.</p>
      </div>
      <div class="flex items-center gap-2">
        <!---<button @click="showAiModal = true" class="btn btn-soft-primary flex items-center gap-1.5">
          <Sparkles class="w-3.5 h-3.5" />
          AI Website Wizard
        </button>--->
        <button @click="createNewWebsite" class="btn btn-primary">+ New Website</button>
        <button data-testid="new-docs-site" @click="createNewDocsSite" class="btn btn-soft-primary">+ New Documentation</button>
        <button @click="triggerImport" :disabled="!!busy" class="btn btn-secondary">Import</button>
        <button data-testid="site-spec-open" @click="showSpecModal = true" class="btn btn-secondary" title="Create a website from a specification written by a language model">Import from a spec</button>
        <input ref="importFileInput" type="file" accept=".zip,.json" class="hidden" @change="handleImportFile" />
      </div>
    </div>

    <div v-if="busy" class="text-xs text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 rounded-lg px-3 py-2 mb-3 truncate">{{ busy }}</div>

    <div v-if="websitesStore.isLoading && websitesStore.websites.length === 0" class="text-xs text-slate-500 text-center py-4">Loading websites…</div>

    <div v-else-if="websitesStore.websites.length === 0" class="text-xs text-slate-500 text-center py-4 italic">No websites configured yet. Create one to get started.</div>

    <div v-else class="space-y-2">
      <div v-for="website in websitesStore.websites" :key="website.id" class="flex items-center justify-between px-3 py-2.5 rounded-lg border border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-white/40">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-slate-200 light:text-slate-800">{{ website.name }}</span>
            <span v-if="isDocsSite(website)" class="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">documentation</span>
          </div>
          <div class="text-xs text-slate-500 font-mono mt-0.5 space-x-3">
            <span>id: <button @click="copyId(website.id)" class="btn btn-link" :title="'Click to copy'">{{ website.id.slice(0, 8) }}…</button></span>
            <span>default: {{ website.defaultLocale }}</span>
            <span>locales: {{ website.supportedLocales.join(', ') }}</span>
            <span v-if="website.domains.length">domains: {{ website.domains.join(', ') }}</span>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0 ml-3">
          <template v-if="isDocsSite(website)">
            <a :href="docsPreviewUrl(website.rootPath)" target="_blank" rel="noopener" :data-testid="`docs-preview-${website.id}`" class="text-xs font-semibold text-sky-400 hover:text-sky-300" title="Open the documentation site">Preview</a>
            <button :data-testid="`docs-open-${website.id}`" @click="openDocs(website)" class="btn btn-link">Documents</button>
            <button :data-testid="`docs-export-${website.id}`" @click="exportWebsiteAction(website)" :disabled="!!busy" class="btn btn-link-success" title="Export the documentation (files, images, index) as a .zip">Export</button>
          </template>
          <template v-else>
            <button @click="openPublish(website)" class="btn btn-link-warning flex items-center gap-1"><Rocket class="w-3 h-3" />Publish</button>
            <button @click="exportWebsiteAction(website)" :disabled="!!busy" class="btn btn-link-success">Export</button>
            <button @click="openPaths(website)" class="btn btn-link">Paths</button>
            <button @click="openTemplates(website)" class="btn btn-link">Templates</button>
            <button @click="openWebsiteTab(website)" class="btn btn-link">Edit</button>
          </template>
          <button @click="handleDelete(website)" class="btn btn-link-danger">Delete</button>
        </div>
      </div>
    </div>

    <AiWebsiteWizardModal :is-open="showAiModal" @close="showAiModal = false" />
    <SiteSpecImportModal :is-open="showSpecModal" @close="showSpecModal = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Sparkles, Rocket } from '@lucide/vue'
import { useWebsitesStore } from '../../stores/websitesStore'
import { useTabsStore } from '../../stores/tabsStore'
import { downloadWebsiteZip, openBundleFile, previewBundleImport, importOpenedBundle } from '../../utils/website-bundle'
import { useDamStore } from '../../stores/damStore'
import { useDataClassesStore } from '../../stores/dataClassesStore'
import { useDataObjectsStore } from '../../stores/dataObjectsStore'
import { useSnippetsStore } from '../../stores/snippetsStore'
import { useComponentsStore } from '../../stores/componentsStore'
import { usePagesStore } from '../../stores/pagesStore'
import { usePathStore } from '../../stores/menusStore'
import { getDefaultCoreApiUrl } from '../../utils/auth-api'
import type { WebsiteRecord } from '../../utils/websites-api'
import { docsPreviewUrl } from '../../utils/docs-sites-api'
import AiWebsiteWizardModal from './AiWebsiteWizardModal.vue'
import SiteSpecImportModal from './SiteSpecImportModal.vue'

const websitesStore = useWebsitesStore()
const tabsStore = useTabsStore()
const showAiModal = ref(false)
const showSpecModal = ref(false)
const importFileInput = ref<HTMLInputElement | null>(null)

const isDocsSite = (w: WebsiteRecord) => (w.settings as Record<string, unknown> | null)?.kind === 'docs'

function openDocs(website: WebsiteRecord) {
  tabsStore.openDocsSite(website.id)
}

// A documentation site is a website whose pages are the Markdown files of a folder of the asset library.
async function createNewDocsSite() {
  const name = prompt('Name of the documentation site:', '')
  if (!name?.trim()) return
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'docs'
  const typed = prompt('Folder of the asset library that holds the Markdown files:', `/docs/${slug}`)
  if (!typed?.trim()) return
  const sourceFolder = '/' + typed.split('/').map((p) => p.trim()).filter(Boolean).join('/')
  if (sourceFolder === '/' || sourceFolder.split('/').some((p) => p === '..' || p === '.')) { alert('That is not a valid folder.'); return }
  try {
    const created = await websitesStore.create({ name: name.trim(), settings: { kind: 'docs', docs: { sourceFolder } } })
    openDocs(created)
  } catch (e: any) {
    alert(e?.message || 'Failed to create the documentation site')
  }
}

function openPublish(website: WebsiteRecord) {
  tabsStore.openPublish(website.id)
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

const damStore = useDamStore()
const dataClassesStore = useDataClassesStore()
const dataObjectsStore = useDataObjectsStore()
const snippetsStore = useSnippetsStore()
const componentsStore = useComponentsStore()
const pagesStore = usePagesStore()
const pathStore = usePathStore()

// An import adds a website, pages, snippets, data classes and objects, components and DAM files: every list of the
// dashboard that was loaded before it is stale (the Objects view showed no Blog class until the page was reloaded).
async function refreshAfterImport() {
  await Promise.allSettled([
    websitesStore.refreshWebsites(),
    pagesStore.refreshPages(),
    pathStore.refreshPaths(),
    snippetsStore.refresh(),
    dataClassesStore.refreshDataClasses(),
    dataObjectsStore.refreshDataObjects(),
    componentsStore.refreshComponents(),
    damStore.refreshFolders(),
    damStore.refreshAssets(),
  ])
}
const busy = ref('')

function damEndpoint() {
  return { assetProcessorUrl: damStore.config.assetProcessorUrl, folderRules: damStore.config.folderRules }
}

// The export is a .zip: bundle.json (website, pages, templates, menus, themes, snippets, data classes and objects,
// asset records) plus the asset files. Without the files the assets are only listed.
async function exportWebsiteAction(website: WebsiteRecord) {
  // A documentation website IS its files (documents, images, index): there is nothing to leave out, so nobody is asked.
  const withAssets = isDocsSite(website) ? true : confirm('Include the asset files in the export?\n\nOK: a complete twin (files travel in the .zip).\nCancel: assets are only listed; the other installation must already have them at the same paths.')
  try {
    const { assets, missing } = await downloadWebsiteZip(getDefaultCoreApiUrl(), damEndpoint(), website, { withAssets, dataObjects: 'all' }, (m) => { busy.value = m })
    if (withAssets && missing.length) alert(`Exported with ${assets} asset file(s). ${missing.length} could not be read and are listed only:\n${missing.slice(0, 10).join('\n')}`)
  } catch (e: any) {
    alert(e?.message || 'Failed to export website')
  } finally {
    busy.value = ''
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
    const baseUrl = getDefaultCoreApiUrl()
    const opened = await openBundleFile(file)
    const plan = await previewBundleImport(baseUrl, opened)
    const c = plan.counts
    const toStore = plan.assets.filter((a) => a.action !== 'reuse').length
    const lines = [
      `Import "${opened.bundle.website.name}" as a new website?`,
      '',
      `Pages: ${c.pages}${c.externalPages ? ` (+${c.externalPages} module pages used by its layouts)` : ''}, templates: ${c.templates}, menus: ${c.menus}, snippets: ${c.snippets}, themes: ${c.themes}`,
      `Data classes: ${c.classesCreated} new, ${c.classesReused} already here. Data objects: ${c.objectsCreated} new, ${c.objectsReused} already here`,
      `Assets: ${toStore} to store, ${plan.assets.length - toStore} already here${opened.zip ? '' : ' (no files in this export)'}`,
      ...(plan.docs ? [`Documentation: ${toStore} file(s) go to ${plan.docs.targetFolder}`] : []),
      ...plan.warnings.map((w) => `! ${w}`),
    ]
    if (!confirm(lines.join('\n'))) { input.value = ''; return }
    const { report, uploaded, failed } = await importOpenedBundle(baseUrl, damEndpoint(), opened, (m) => { busy.value = m })
    await refreshAfterImport()
    const done = [`Website imported as "${report.website.name}". Assets stored: ${uploaded}.`, ...report.warnings.map((w) => `! ${w}`)]
    if (failed.length) done.push(`${failed.length} asset(s) not stored:`, ...failed.slice(0, 10).map((f) => `  ${f.path}: ${f.error}`))
    alert(done.join('\n'))
  } catch (e: any) {
    alert(e?.message || 'Failed to import website')
  } finally {
    busy.value = ''
    input.value = ''
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