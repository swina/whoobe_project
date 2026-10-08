<template>
  <div v-if="website" class="h-full flex flex-col" data-testid="docs-site-tab">
    <div class="flex shrink-0 items-center gap-4 px-6 pt-2 pb-2">
      <div class="min-w-0">
        <h4 class="text-lg font-bold text-slate-100 light:text-slate-900 truncate">{{ website.name }}</h4>
        <div class="text-xs text-slate-500 font-mono truncate">source folder {{ tree?.config.sourceFolder }}</div>
      </div>
      <a v-if="previewUrl" :href="previewUrl" target="_blank" rel="noopener" class="ml-auto text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 shrink-0"><ExternalLink class="w-3 h-3" />Preview site</a>
    </div>

    <div class="flex shrink-0 items-center gap-2 px-6 text-xs font-semibold">
      <button v-for="t in tabs" :key="t.key" :data-testid="`docs-tab-${t.key}`" @click="setTab(t.key)"
        :class="['px-3 py-1.5 rounded-lg transition', tab === t.key ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 light:text-slate-600 hover:text-slate-200 bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200']">{{ t.name }}</button>
      <span v-if="tree?.warnings.length" class="ml-auto text-xs text-amber-400">{{ tree.warnings.length }} warning(s)</span>
    </div>

    <div class="flex-1 min-h-0 px-2 pb-2 pt-2">
      <div class="h-full overflow-y-auto rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-5 space-y-3">
        <div v-if="error" class="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 whitespace-pre-line">{{ error }}</div>
        <div v-if="busy" class="text-xs text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 rounded-lg px-3 py-2 truncate">{{ busy }}</div>
        <div v-if="loading && !tree" class="text-xs text-slate-500 py-6 text-center">Loading…</div>

        <template v-else-if="tree">
          <!-- Documents -->
          <template v-if="tab === 'documents'">
            <div class="flex items-center gap-2 flex-wrap">
              <button data-testid="docs-new" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white" @click="newDocument">+ New document</button>
              <button class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200" @click="filesInput?.click()">Upload files</button>
              <button class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200" @click="folderInput?.click()">Upload folder</button>
              <label class="text-xs text-slate-400 flex items-center gap-1.5 ml-2"><input v-model="uploadPublic" type="checkbox" />Uploaded files are public</label>
              <input ref="filesInput" data-testid="docs-upload" type="file" multiple accept=".md,.markdown,.yml,.yaml,.png,.jpg,.jpeg,.gif,.webp,.svg,.pdf" class="hidden" @change="onFiles($event, false)" />
              <input ref="folderInput" type="file" multiple webkitdirectory class="hidden" @change="onFiles($event, true)" />
            </div>
            <p class="text-xs text-slate-500">Markdown files (and the images and files they use) in this folder are the documentation. Folders are sections; the index follows them unless you write one in the <em>Index</em> tab. Only <strong>public</strong> files are shown on the published site. A document opens in a tab of its own.</p>

            <input v-model="filter" data-testid="docs-filter" type="search" placeholder="Find a document by title or path, or search in the text…" class="w-full rounded-lg bg-slate-950 light:bg-white border border-slate-700 light:border-slate-300 text-sm text-slate-200 light:text-slate-800 px-3 py-1.5 outline-none focus:border-indigo-500" @input="onFilter" />

            <div v-if="textMatches.length" class="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-2 space-y-1" data-testid="docs-text-matches">
              <div class="text-[11px] uppercase tracking-wider text-indigo-300 px-1">Found in the text</div>
              <button v-for="m in textMatches" :key="m.id" type="button" class="w-full text-left px-2 py-1.5 rounded hover:bg-slate-800/60 light:hover:bg-slate-100" :data-testid="`docs-text-match-${m.path}`" @click="openDoc(m.path)">
                <div class="text-sm text-slate-200 light:text-slate-800 truncate"><span v-if="m.page" class="text-slate-500">{{ m.page }} › </span>{{ m.title }}</div>
                <div class="text-[11px] font-mono text-slate-500 truncate">{{ m.path }}</div>
                <div v-if="m.excerpt && !m.page" class="text-xs text-slate-500 line-clamp-1">{{ m.excerpt }}</div>
              </button>
            </div>

            <div v-if="tree.documents.length === 0" class="text-xs text-slate-500 italic text-center py-6">No documents yet. Create one or upload your .md files.</div>
            <div v-else-if="visibleDocuments.length === 0" class="text-xs text-slate-500 italic text-center py-4">No document matches “{{ filter }}”.</div>
            <div v-else class="space-y-1">
              <div v-for="d in visibleDocuments" :key="d.path" class="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-slate-50 cursor-pointer hover:border-slate-600" :style="{ marginLeft: depth(d.path) * 14 + 'px' }" :data-testid="`docs-row-${d.path}`" @dblclick="openDoc(d.path)">
                <FileText class="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <div class="min-w-0 flex-1" @click="openDoc(d.path)">
                  <div class="text-sm text-slate-200 light:text-slate-800 truncate">{{ d.title }}</div>
                  <div class="text-xs text-slate-500 font-mono truncate">{{ d.path }} <span class="text-slate-600">→ {{ d.route }}</span></div>
                </div>
                <span v-if="d.hidden" class="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">hidden</span>
                <span :class="['text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded', d.isPublic ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300']">{{ d.isPublic ? 'public' : 'private' }}</span>
                <button class="text-xs font-semibold text-indigo-400 hover:text-indigo-300" @click="openDoc(d.path)">Edit</button>
                <button class="text-xs font-semibold text-rose-400 hover:text-rose-300" @click="removePath(d.path)">Delete</button>
              </div>
            </div>
            <div v-if="tree.files.length" class="text-xs text-slate-500">
              <span class="font-semibold text-slate-400">Other files</span> ({{ tree.files.length }}): <span class="font-mono">{{ tree.files.slice(0, 8).join(', ') }}{{ tree.files.length > 8 ? ' …' : '' }}</span>
              <span class="block">Refer to them from a document with a relative path, or use <em>Insert image</em> in the editor.</span>
            </div>
            <ul v-if="tree.warnings.length" class="text-xs text-amber-300 space-y-0.5 list-disc pl-5">
              <li v-for="w in tree.warnings" :key="w">{{ w }}</li>
            </ul>
          </template>

          <!-- Index -->
          <template v-else-if="tab === 'index'">
            <div class="flex items-center gap-2 flex-wrap">
              <div class="flex rounded-lg overflow-hidden border border-slate-700 light:border-slate-300 text-xs font-semibold">
                <button data-testid="docs-nav-mode-visual" :class="['px-3 py-1.5', navMode === 'visual' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200']" @click="switchMode('visual')">Visual</button>
                <button data-testid="docs-nav-mode-text" :class="['px-3 py-1.5', navMode === 'text' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200']" @click="switchMode('text')">Text ({{ tree.navFile }})</button>
              </div>
              <span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] uppercase">{{ navStatus }}</span>
              <div class="ml-auto flex items-center gap-2">
                <button class="text-xs font-semibold text-indigo-400 hover:text-indigo-300" @click="fillFromFolders">Start from the folders</button>
                <button v-if="tree.navSource === 'manual' || tree.navText !== null" class="text-xs font-semibold text-rose-400 hover:text-rose-300" @click="removeNavFile">Use the folders again</button>
              </div>
            </div>

            <DocsNavEditor v-if="navMode === 'visual'" :root="navRoot" :documents="tree.documents" @change="onTreeChange" />
            <template v-else>
              <textarea v-model="navText" data-testid="docs-nav-text" spellcheck="false" rows="18" placeholder="Leave empty to follow the folders. Example:&#10;- title: Getting started&#10;  items:&#10;    - doc: install.md&#10;    - doc: first-site.md&#10;      title: Your first site&#10;- link: https://example.org&#10;  title: Changelog"
                class="w-full rounded-lg bg-slate-950 light:bg-white border border-slate-700 light:border-slate-300 text-xs font-mono text-slate-200 light:text-slate-800 p-2 outline-none focus:border-indigo-500"></textarea>
            </template>

            <div class="flex items-center gap-2">
              <button class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200" @click="checkNav">Check</button>
              <button data-testid="docs-nav-save" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50" :disabled="!!busy || (navMode === 'text' && !navText.trim())" @click="saveNav">Save index</button>
            </div>
            <ul v-if="navErrors.length" class="text-xs text-rose-300 space-y-0.5 list-disc pl-5"><li v-for="e in navErrors" :key="e">{{ e }}</li></ul>
            <ul v-if="navWarnings.length" class="text-xs text-amber-300 space-y-0.5 list-disc pl-5"><li v-for="w in navWarnings" :key="w">{{ w }}</li></ul>
            <p v-if="checked && !navErrors.length" class="text-xs text-emerald-400">The index is valid.</p>
          </template>

          <!-- Publish -->
          <template v-else-if="tab === 'publish'">
            <div class="space-y-3 max-w-3xl">
              <p class="text-xs text-slate-400">Publishing makes <strong>static HTML</strong>: one page per document, the index, search (the index of the words is a file the browser downloads) and the images the documents use. The folder can be put on any web server, with no connection to this CMS. Only <strong>public</strong> files are published ({{ publicCount }} of {{ tree.documents.length }} documents are public).</p>
              <label class="block text-xs text-slate-400">Path the site is served under (<span class="font-mono">/</span> for a domain of its own)
                <input v-model="publishBase" class="mt-1 w-48 rounded-lg bg-slate-950 light:bg-white border border-slate-700 light:border-slate-300 text-sm font-mono text-slate-200 light:text-slate-800 px-3 py-1.5 outline-none focus:border-indigo-500" />
              </label>
              <label class="block text-xs text-slate-400">Public address (optional, for the sitemap)
                <input v-model="publishSiteUrl" placeholder="https://docs.example.com" class="mt-1 w-full rounded-lg bg-slate-950 light:bg-white border border-slate-700 light:border-slate-300 text-sm font-mono text-slate-200 light:text-slate-800 px-3 py-1.5 outline-none focus:border-indigo-500" />
              </label>
              <div class="text-xs text-slate-400">Run this in the Whoobe repository (or choose <em>Documentation</em> in <span class="font-mono">./publish-site.sh</span>):</div>
              <pre data-testid="docs-publish-command" class="rounded-lg bg-slate-950 border border-slate-800 p-3 text-xs font-mono text-slate-200 whitespace-pre-wrap break-all">{{ publishCommand }}</pre>
              <button class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200" @click="copyPublishCommand">{{ copied ? 'Copied' : 'Copy command' }}</button>
              <p class="text-xs text-slate-500">Then copy the output folder to the server (<span class="font-mono">rsync -a --delete ./sites/{{ website.rootPath.replace('/', '') }}/ user@host:/var/www/docs/</span>). Broken links are listed when it is generated (add <span class="font-mono">--strict</span> to make them an error).</p>
            </div>
          </template>

          <!-- Settings -->
          <template v-else>
            <div class="space-y-3 max-w-xl">
              <label class="block text-xs text-slate-400">Title of the site
                <input v-model="settingsForm.title" class="mt-1 w-full rounded-lg bg-slate-950 light:bg-white border border-slate-700 light:border-slate-300 text-sm text-slate-200 light:text-slate-800 px-3 py-1.5 outline-none focus:border-indigo-500" />
              </label>
              <label class="block text-xs text-slate-400">Source folder (in the asset library)
                <input v-model="settingsForm.sourceFolder" class="mt-1 w-full rounded-lg bg-slate-950 light:bg-white border border-slate-700 light:border-slate-300 text-sm font-mono text-slate-200 light:text-slate-800 px-3 py-1.5 outline-none focus:border-indigo-500" />
              </label>
              <label class="block text-xs text-slate-400">Home document (optional, default <span class="font-mono">index.md</span>)
                <input v-model="settingsForm.homeDoc" placeholder="index.md" class="mt-1 w-full rounded-lg bg-slate-950 light:bg-white border border-slate-700 light:border-slate-300 text-sm font-mono text-slate-200 light:text-slate-800 px-3 py-1.5 outline-none focus:border-indigo-500" />
              </label>
              <button class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50" :disabled="!!busy" @click="saveSettings">Save settings</button>
              <p class="text-xs text-slate-500">Changing the source folder does not move any file.</p>
            </div>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ExternalLink, FileText } from '@lucide/vue'
import { loadSearchIndex, searchDocs } from '@whoobe-cms/core/docs-search'
import { getDefaultCoreApiUrl } from '../../utils/auth-api'
import { useDamStore } from '../../stores/damStore'
import { useWebsitesStore } from '../../stores/websitesStore'
import { useTabsStore, docsSiteTabId, type DocsSiteSubTab } from '../../stores/tabsStore'
import { useDocsSitesStore } from '../../stores/docsSitesStore'
import { uploadAssetToDam, deleteAssetFromDam } from '../../utils/dam-api'
import { docsPreviewUrl, checkDocsNav, cleanRelativePath, type NavNode } from '../../utils/docs-sites-api'
import { editToYaml, navToEdit, type EditNode } from '../../utils/docs-nav-edit'
import DocsNavEditor from './DocsNavEditor.vue'

const props = defineProps<{ websiteId: string }>()

const damStore = useDamStore()
const websitesStore = useWebsitesStore()
const tabsStore = useTabsStore()
const docsStore = useDocsSitesStore()
const coreApi = () => getDefaultCoreApiUrl()
const dam = () => damStore.config

const website = computed(() => websitesStore.websites.find((w) => w.id === props.websiteId) ?? null)
const tree = computed(() => docsStore.trees[props.websiteId] ?? null)
const loading = computed(() => !!docsStore.loading[props.websiteId])
const busy = ref('')
const localError = ref('')
const error = computed(() => localError.value || docsStore.errors[props.websiteId] || '')
const uploadPublic = ref(true)
const filesInput = ref<HTMLInputElement | null>(null)
const folderInput = ref<HTMLInputElement | null>(null)

const tabs = [{ key: 'documents', name: 'Documents' }, { key: 'index', name: 'Index' }, { key: 'publish', name: 'Publish' }, { key: 'settings', name: 'Settings' }] as const
const tab = computed<DocsSiteSubTab>(() => tabsStore.tabs.find((t) => t.id === docsSiteTabId(props.websiteId))?.docsSubTab ?? 'documents')
const setTab = (k: DocsSiteSubTab) => tabsStore.setDocsSubTab(props.websiteId, k)
const previewUrl = computed(() => (website.value ? docsPreviewUrl(website.value.rootPath) : ''))

async function load() {
  await docsStore.load(props.websiteId)
  const t = tree.value
  if (t) {
    if (!navDirty.value) navText.value = t.navText ?? ''
    const d = ((website.value?.settings ?? {}) as any).docs ?? {}
    settingsForm.value = { title: t.config.title, sourceFolder: t.config.sourceFolder, homeDoc: d.homeDoc ?? '' }
  }
}
// the tree is also reloaded by the tabs of the documents; here only the text fields follow the first load
watch(() => props.websiteId, () => { void load() }, { immediate: true })

// ---- documents --------------------------------------------------------------------------------------------

const filter = ref('')
const depth = (path: string) => path.split('/').length - 1
const visibleDocuments = computed(() => {
  const q = filter.value.trim().toLowerCase()
  const all = [...(tree.value?.documents ?? [])].sort((a, b) => a.path.localeCompare(b.path, 'en', { numeric: true }))
  return q ? all.filter((d) => d.title.toLowerCase().includes(q) || d.path.toLowerCase().includes(q)) : all
})

// search in the text: the index of the words (the one the site uses, private documents included) is read once and searched here
let searcher: ((q: string) => ReturnType<typeof searchDocs>) | null = null
let searcherFor = ''
const textMatches = ref<{ id: string; path: string; title: string; page: string; excerpt: string }[]>([])
let filterTimer: ReturnType<typeof setTimeout> | null = null
function onFilter() {
  if (filterTimer) clearTimeout(filterTimer)
  filterTimer = setTimeout(runTextSearch, 250)
}
async function runTextSearch() {
  const q = filter.value.trim()
  if (q.length < 2 || !tree.value) { textMatches.value = []; return }
  const sig = tree.value.documents.map((d) => `${d.path}:${d.version}`).join('|')
  if (!searcher || searcherFor !== sig) {
    try {
      const res = await fetch(`${coreApi().replace(/\/+$/, '')}/docs-sites/${props.websiteId}/search-index`, { credentials: 'include' })
      if (!res.ok) throw new Error()
      const index = loadSearchIndex(await res.text())
      searcher = (query: string) => searchDocs(index, query, 8)
      searcherFor = sig
    } catch { textMatches.value = []; return }
  }
  const byRoute = new Map((tree.value.documents).map((d) => [d.route === '' ? '/' : d.route, d.path]))
  textMatches.value = (searcher?.(q) ?? []).flatMap((h) => {
    const path = byRoute.get(h.route === '' ? '/' : h.route)
    return path ? [{ id: h.id, path, title: h.title, page: h.page, excerpt: h.excerpt }] : []
  })
}

function openDoc(path: string) { tabsStore.openDocsDocument(props.websiteId, path) }

// ---- files ------------------------------------------------------------------------------------------------

const mimeOf = (name: string): string => {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return ({ md: 'text/markdown', markdown: 'text/markdown', yml: 'application/yaml', yaml: 'application/yaml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf' } as Record<string, string>)[ext] ?? 'application/octet-stream'
}
const folder = () => tree.value!.config.sourceFolder

async function putFile(rel: string, data: Blob, isPublic: boolean) {
  const clean = cleanRelativePath(rel)
  if (!clean) throw new Error(`"${rel}" is not a valid path`)
  const filename = clean.split('/').pop() as string
  await uploadAssetToDam(dam().assetProcessorUrl, new Blob([data], { type: mimeOf(filename) }), filename, `${folder()}/${clean}`, isPublic, dam().folderRules)
}

async function onFiles(event: Event, keepFolders: boolean) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  if (!files.length) return
  localError.value = ''
  const failed: string[] = []
  let n = 0
  for (const f of files) {
    // a dropped folder keeps its inner structure (the first segment is the folder's own name: it is the source folder itself)
    const rel = keepFolders ? ((f as any).webkitRelativePath as string).split('/').slice(1).join('/') : f.name
    busy.value = `Uploading ${++n}/${files.length}: ${rel}`
    try { await putFile(rel, f, uploadPublic.value) } catch (e: any) { failed.push(`${rel}: ${e?.message || 'failed'}`) }
  }
  busy.value = ''
  if (failed.length) localError.value = `${failed.length} file(s) not stored:\n` + failed.slice(0, 5).join('\n')
  await load()
}

function newDocument() {
  const typed = prompt('Path of the new document, relative to the source folder (e.g. guide/install.md):', 'new-page.md')
  if (!typed) return
  let rel = cleanRelativePath(typed)
  if (!rel) { alert('That is not a valid path.'); return }
  if (!/\.(md|markdown)$/i.test(rel)) rel += '.md'
  if (tree.value?.documents.some((d) => d.path === rel)) { alert('A document with that path exists already.'); return }
  const name = (rel.split('/').pop() as string).replace(/\.(md|markdown)$/i, '').replace(/^\d+[-_.]\s*/, '').replace(/[-_]+/g, ' ')
  const title = name.charAt(0).toUpperCase() + name.slice(1)
  tabsStore.openDocsDocument(props.websiteId, rel, `---\ntitle: ${title}\n---\n\n# ${title}\n\n`)
}

async function removePath(path: string) {
  if (!confirm(`Delete "${path}" from the asset library?`)) return
  try {
    await deleteAssetFromDam(dam().assetProcessorUrl, `${folder()}/${path}`, dam().folderRules)
    tabsStore.forceCloseDocsDocument(props.websiteId, path)
    await load()
  } catch (e: any) {
    localError.value = e?.message || 'Could not delete the file'
  }
}

// ---- index ------------------------------------------------------------------------------------------------

const navText = ref('')
const navDirty = ref(false)
const navMode = ref<'visual' | 'text'>('visual')
const navRoot = ref<EditNode>({ id: 'root', kind: 'root', items: [] })
const treeDirty = ref(false)
const navErrors = ref<string[]>([])
const navWarnings = ref<string[]>([])
const checked = ref(false)
const navStatus = computed(() => (navDirty.value || treeDirty.value ? 'unsaved changes' : tree.value?.navSource === 'manual' ? 'written by hand' : 'from the folders'))

/** The tree being edited starts from the index in use (the written one, or the one rebuilt from the folders). */
function resetTree(nav: NavNode[] | undefined = tree.value?.nav) {
  navRoot.value = navToEdit(nav ?? [], tree.value?.documents ?? [])
  treeDirty.value = false
}
watch(() => tree.value, (t, old) => { if (t && (!old || (!treeDirty.value && !navDirty.value))) resetTree(t.nav) }, { immediate: true })
watch(navText, (v) => { navDirty.value = v !== (tree.value?.navText ?? '') })
function onTreeChange() { treeDirty.value = true; checked.value = false }

/** The text the file would contain now. */
const currentText = () => (navMode.value === 'visual' ? editToYaml(navRoot.value) : navText.value)

async function switchMode(mode: 'visual' | 'text') {
  if (mode === navMode.value) return
  navErrors.value = []; navWarnings.value = []
  if (mode === 'text') {
    if (treeDirty.value || !navText.value.trim()) navText.value = editToYaml(navRoot.value)
    navMode.value = 'text'
    return
  }
  // text -> visual: the server reads the text (the same reading that serves the site) and the tree follows
  if (!navText.value.trim()) { resetTree(tree.value?.autoNav); navMode.value = 'visual'; return }
  const r = await checkDocsNav(coreApi(), props.websiteId, navText.value).catch((e) => ({ ok: false, errors: [e?.message || 'Check failed'], warnings: [] as string[], nav: [] as NavNode[] }))
  if (!r.ok) { navErrors.value = r.errors; return }          // stays in the text until it is valid
  navRoot.value = navToEdit(r.nav, tree.value?.documents ?? [])
  treeDirty.value = navDirty.value
  navMode.value = 'visual'
}

function fillFromFolders() {
  resetTree(tree.value?.autoNav)
  navText.value = editToYaml(navRoot.value)
  treeDirty.value = true
  checked.value = false
  navErrors.value = []; navWarnings.value = []
}
async function checkNav(): Promise<boolean> {
  navErrors.value = []; navWarnings.value = []
  try {
    const r = await checkDocsNav(coreApi(), props.websiteId, currentText())
    navErrors.value = r.errors; navWarnings.value = r.warnings
    checked.value = r.ok
    return r.ok
  } catch (e: any) {
    navErrors.value = [e?.message || 'Check failed']
    return false
  }
}
async function saveNav() {
  if (!tree.value) return
  const text = currentText()
  if (!text.trim()) { navErrors.value = ['The index is empty: use “Use the folders again” to follow the folders.']; return }
  navText.value = text
  if (!(await checkNav())) return
  busy.value = 'Saving the index…'
  try {
    await putFile(tree.value.navFile, new Blob([text]), true)
    checked.value = false
    treeDirty.value = false
    await load()
    navDirty.value = false
    resetTree(tree.value?.nav)
  } catch (e: any) {
    localError.value = e?.message || 'Could not save the index'
  } finally {
    busy.value = ''
  }
}
async function removeNavFile() {
  if (!tree.value || !confirm('Delete the index file and follow the folders again?')) return
  try {
    await deleteAssetFromDam(dam().assetProcessorUrl, `${folder()}/${tree.value.navFile}`, dam().folderRules)
    checked.value = false; navErrors.value = []; navWarnings.value = []
    treeDirty.value = false; navDirty.value = false
    await load()
    resetTree(tree.value?.nav)
  } catch (e: any) {
    localError.value = e?.message || 'Could not delete the index file'
  }
}

// ---- publish ----------------------------------------------------------------------------------------------

const publishBase = ref('/')
const publishSiteUrl = ref('')
const copied = ref(false)
const publicCount = computed(() => tree.value?.documents.filter((d) => d.isPublic).length ?? 0)
const shellQuote = (v: string) => (/^[A-Za-z0-9_@%+=:,./-]+$/.test(v) ? v : `'${v.replace(/'/g, `'\\''`)}'`)
const publishCommand = computed(() => {
  const w = website.value
  if (!w) return ''
  const parts = ['node packages/publish/bin/whoobe-publish.js --kind docs', `--api-url ${shellQuote(coreApi())}`, `--website-id ${w.id}`, `--out-dir ./sites/${w.rootPath.replace(/^\//, '') || 'docs'}`]
  const asset = dam().assetProcessorUrl.replace(/\/+$/, '')
  if (asset && asset !== coreApi().replace(/\/+$/, '')) parts.push(`--asset-base-url ${shellQuote(asset)}`)
  if (publishBase.value.trim() && publishBase.value.trim() !== '/') parts.push(`--base-path ${shellQuote(publishBase.value.trim())}`)
  if (publishSiteUrl.value.trim()) parts.push(`--site-url ${shellQuote(publishSiteUrl.value.trim())}`)
  return parts.join(' \\\n  ')
})
async function copyPublishCommand() {
  try { await navigator.clipboard.writeText(publishCommand.value.replace(/ \\\n  /g, ' ')); copied.value = true; setTimeout(() => { copied.value = false }, 1500) } catch { /* the text is selectable */ }
}

// ---- settings ---------------------------------------------------------------------------------------------

const settingsForm = ref({ title: '', sourceFolder: '', homeDoc: '' })
async function saveSettings() {
  const w = website.value
  if (!w) return
  const folderPath = cleanRelativePath(settingsForm.value.sourceFolder)
  if (!folderPath) { localError.value = 'The source folder is not a valid path'; return }
  busy.value = 'Saving…'
  localError.value = ''
  try {
    const current = (w.settings ?? {}) as Record<string, any>
    const settings = { ...current, kind: 'docs', docs: { ...(current.docs ?? {}), sourceFolder: '/' + folderPath, title: settingsForm.value.title.trim() || undefined, homeDoc: settingsForm.value.homeDoc.trim() || undefined } }
    await websitesStore.update(w.id, { settings })
    await load()
  } catch (e: any) {
    localError.value = e?.message || 'Could not save the settings'
  } finally {
    busy.value = ''
  }
}
</script>
