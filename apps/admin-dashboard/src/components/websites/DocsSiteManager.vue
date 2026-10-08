<template>
  <div v-if="isOpen" class="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4" @click.self="$emit('close')">
    <div class="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl bg-slate-900 light:bg-white border border-slate-700 light:border-slate-300 shadow-2xl">
      <div class="flex items-center justify-between px-5 py-3 border-b border-slate-800 light:border-slate-200 shrink-0">
        <div class="min-w-0">
          <h3 class="text-sm font-semibold text-slate-100 light:text-slate-900 truncate">Documentation: {{ website?.name }}</h3>
          <p class="text-xs text-slate-500 truncate">Source folder <span class="font-mono">{{ tree?.config.sourceFolder }}</span> in the asset library</p>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <a v-if="previewUrl" :href="previewUrl" target="_blank" rel="noopener" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"><ExternalLink class="w-3 h-3" />Preview site</a>
          <button class="text-slate-400 hover:text-slate-200" aria-label="Close" @click="$emit('close')"><X class="w-4 h-4" /></button>
        </div>
      </div>

      <div class="flex items-center gap-2 px-5 pt-3 shrink-0">
        <button v-for="t in tabs" :key="t.key" :data-testid="`docs-tab-${t.key}`" @click="tab = t.key"
          :class="['px-3 py-1.5 rounded-lg text-xs font-semibold transition', tab === t.key ? 'bg-slate-800 light:bg-slate-200 text-slate-100 light:text-slate-900' : 'text-slate-500 hover:text-slate-300 light:hover:text-slate-700']">{{ t.name }}</button>
        <span v-if="tree?.warnings.length" class="ml-auto text-xs text-amber-400">{{ tree.warnings.length }} warning(s)</span>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
        <div v-if="error" class="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">{{ error }}</div>
        <div v-if="busy" class="text-xs text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 rounded-lg px-3 py-2 truncate">{{ busy }}</div>
        <div v-if="loading" class="text-xs text-slate-500 py-6 text-center">Loading…</div>

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
            <p class="text-xs text-slate-500">Markdown files (and the images and files they use) in this folder are the documentation. Folders are sections; the index follows them unless you write one in the <em>Index</em> tab. Only <strong>public</strong> files are shown on the published site.</p>

            <div v-if="tree.documents.length === 0" class="text-xs text-slate-500 italic text-center py-6">No documents yet. Create one or upload your .md files.</div>
            <div v-else class="space-y-1">
              <div v-for="d in sortedDocuments" :key="d.path" class="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-slate-50" :data-testid="`docs-row-${d.path}`">
                <FileText class="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <div class="min-w-0 flex-1">
                  <div class="text-sm text-slate-200 light:text-slate-800 truncate">{{ d.title }}</div>
                  <div class="text-xs text-slate-500 font-mono truncate">{{ d.path }} <span class="text-slate-600">→ {{ d.route }}</span></div>
                </div>
                <span v-if="d.hidden" class="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">hidden</span>
                <span :class="['text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded', d.isPublic ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300']">{{ d.isPublic ? 'public' : 'private' }}</span>
                <button class="text-xs font-semibold text-indigo-400 hover:text-indigo-300" @click="openEditor(d)">Edit</button>
                <button class="text-xs font-semibold text-rose-400 hover:text-rose-300" @click="removePath(d.path)">Delete</button>
              </div>
            </div>
            <div v-if="tree.files.length" class="text-xs text-slate-500">
              <span class="font-semibold text-slate-400">Other files</span> ({{ tree.files.length }}): <span class="font-mono">{{ tree.files.slice(0, 8).join(', ') }}{{ tree.files.length > 8 ? ' …' : '' }}</span>
              <span class="block">Refer to them from a document with a relative path, e.g. <span class="font-mono">![](../images/{{ tree.files[0].split('/').pop() }})</span>.</span>
            </div>
            <ul v-if="tree.warnings.length" class="text-xs text-amber-300 space-y-0.5 list-disc pl-5">
              <li v-for="w in tree.warnings" :key="w">{{ w }}</li>
            </ul>
          </template>

          <!-- Index -->
          <template v-else-if="tab === 'index'">
            <div class="grid md:grid-cols-2 gap-4">
              <div class="space-y-2">
                <div class="text-xs text-slate-400">
                  <span class="font-semibold text-slate-300">Current index</span>
                  <span class="ml-2 px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] uppercase">{{ (checked ? 'preview of your text' : tree.navSource === 'manual' ? 'written by hand' : 'from the folders') }}</span>
                </div>
                <div class="rounded-lg border border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-slate-50 p-2 text-sm max-h-[50vh] overflow-y-auto">
                  <div v-if="displayedNav.length === 0" class="text-xs text-slate-500 italic p-2">Nothing to list yet.</div>
                  <div v-for="(n, i) in displayedNav" :key="i" :style="{ paddingLeft: n.depth * 16 + 'px' }" class="py-0.5 flex items-center gap-1.5">
                    <span :class="n.kind === 'section' ? 'font-semibold text-slate-200 light:text-slate-800' : n.kind === 'link' ? 'text-sky-400' : 'text-slate-300 light:text-slate-700'" class="truncate">{{ n.title }}</span>
                    <span v-if="n.target" class="text-[10px] font-mono text-slate-600 truncate">{{ n.target }}</span>
                  </div>
                </div>
              </div>
              <div class="space-y-2">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs font-semibold text-slate-300">{{ tree.navFile }}</span>
                  <div class="flex items-center gap-2">
                    <button class="text-xs font-semibold text-indigo-400 hover:text-indigo-300" @click="fillFromFolders">Start from the folders</button>
                    <button v-if="tree.navSource === 'manual' || tree.navText !== null" class="text-xs font-semibold text-rose-400 hover:text-rose-300" @click="removeNavFile">Use the folders again</button>
                  </div>
                </div>
                <textarea v-model="navText" data-testid="docs-nav-text" spellcheck="false" rows="14" placeholder="Leave empty to follow the folders. Example:&#10;- title: Getting started&#10;  items:&#10;    - doc: install.md&#10;    - doc: first-site.md&#10;      title: Your first site&#10;- link: https://example.org&#10;  title: Changelog"
                  class="w-full rounded-lg bg-slate-950 light:bg-white border border-slate-700 light:border-slate-300 text-xs font-mono text-slate-200 light:text-slate-800 p-2 outline-none focus:border-indigo-500"></textarea>
                <div class="flex items-center gap-2">
                  <button class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200" @click="checkNav">Check</button>
                  <button data-testid="docs-nav-save" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50" :disabled="!!busy || !navText.trim()" @click="saveNav">Save index</button>
                </div>
                <ul v-if="navErrors.length" class="text-xs text-rose-300 space-y-0.5 list-disc pl-5"><li v-for="e in navErrors" :key="e">{{ e }}</li></ul>
                <ul v-if="navWarnings.length" class="text-xs text-amber-300 space-y-0.5 list-disc pl-5"><li v-for="w in navWarnings" :key="w">{{ w }}</li></ul>
                <p v-if="checked && !navErrors.length" class="text-xs text-emerald-400">The text is valid.</p>
              </div>
            </div>
          </template>

          <!-- Publish -->
          <template v-else-if="tab === 'publish'">
            <div class="space-y-3 max-w-3xl">
              <p class="text-xs text-slate-400">Publishing makes <strong>static HTML</strong>: one page per document, the index, search (the index of the words is a file the browser downloads) and the images the documents use. The folder can be put on any web server, with no connection to this CMS. Only <strong>public</strong> files are published ({{ publicCount }} of {{ tree?.documents.length }} documents are public).</p>
              <label class="block text-xs text-slate-400">Path the site is served under (<span class="font-mono">/</span> for a domain of its own)
                <input v-model="publishBase" class="mt-1 w-48 rounded-lg bg-slate-950 light:bg-white border border-slate-700 light:border-slate-300 text-sm font-mono text-slate-200 light:text-slate-800 px-3 py-1.5 outline-none focus:border-indigo-500" />
              </label>
              <label class="block text-xs text-slate-400">Public address (optional, for the sitemap)
                <input v-model="publishSiteUrl" placeholder="https://docs.example.com" class="mt-1 w-full rounded-lg bg-slate-950 light:bg-white border border-slate-700 light:border-slate-300 text-sm font-mono text-slate-200 light:text-slate-800 px-3 py-1.5 outline-none focus:border-indigo-500" />
              </label>
              <div class="text-xs text-slate-400">Run this in the Whoobe repository (or choose <em>Documentation</em> in <span class="font-mono">./publish-site.sh</span>):</div>
              <pre data-testid="docs-publish-command" class="rounded-lg bg-slate-950 border border-slate-800 p-3 text-xs font-mono text-slate-200 whitespace-pre-wrap break-all">{{ publishCommand }}</pre>
              <button class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200" @click="copyPublishCommand">{{ copied ? 'Copied' : 'Copy command' }}</button>
              <p class="text-xs text-slate-500">Then copy the output folder to the server (<span class="font-mono">rsync -a --delete ./sites/{{ website?.rootPath.replace('/', '') }}/ user@host:/var/www/docs/</span>). A page links to files with an address inside the folder; broken links are listed when it is generated (add <span class="font-mono">--strict</span> to make them an error).</p>
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

    <!-- Editor -->
    <div v-if="editing" class="fixed inset-0 z-[210] bg-black/70 flex items-center justify-center p-4" @click.self="closeEditor">
      <div class="w-full max-w-6xl h-[90vh] flex flex-col rounded-2xl bg-slate-900 light:bg-white border border-slate-700 light:border-slate-300 shadow-2xl">
        <div class="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 light:border-slate-200 shrink-0 gap-3">
          <div class="min-w-0">
            <div class="text-sm font-semibold text-slate-100 light:text-slate-900 truncate">{{ editing.path }}</div>
            <div class="text-xs text-slate-500 truncate">{{ dirty ? 'Unsaved changes' : 'Saved' }}</div>
          </div>
          <div class="flex items-center gap-3 shrink-0">
            <button data-testid="docs-insert-image" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200" @click="imageDialog = true">Insert image</button>
            <label class="text-xs text-slate-400 flex items-center gap-1.5"><input v-model="editing.isPublic" data-testid="docs-edit-public" type="checkbox" @change="dirty = true" />Public</label>
            <button data-testid="docs-edit-save" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50" :disabled="!!busy || !dirty" @click="saveEditing">Save</button>
            <button class="text-slate-400 hover:text-slate-200" aria-label="Close editor" @click="closeEditor"><X class="w-4 h-4" /></button>
          </div>
        </div>
        <div class="flex-1 min-h-0 grid md:grid-cols-2 gap-px bg-slate-800 light:bg-slate-200">
          <textarea v-model="editing.text" data-testid="docs-edit-text" spellcheck="false" class="min-h-0 resize-none p-3 text-sm font-mono bg-slate-950 light:bg-white text-slate-200 light:text-slate-800 outline-none" @input="onEdit" @keydown.ctrl.s.prevent="saveEditing" @keydown.meta.s.prevent="saveEditing"></textarea>
          <div class="min-h-0 overflow-y-auto bg-slate-900 light:bg-slate-50 p-4">
            <div v-if="preview.warnings.length" class="mb-3 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2"><div v-for="w in preview.warnings" :key="w">{{ w }}</div></div>
            <h1 v-if="preview.title" class="text-xl font-bold text-slate-100 light:text-slate-900 mb-3 hidden">{{ preview.title }}</h1>
            <div data-testid="docs-edit-preview" class="docs-preview" v-html="preview.html"></div>
          </div>
        </div>
      </div>
    </div>
    <DocsImageDialog v-if="imageDialog && editing && tree" :tree="tree" :doc-path="editing.path" @close="imageDialog = false" @insert="insertImage" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { ExternalLink, FileText, X } from '@lucide/vue'
import { getDefaultCoreApiUrl } from '../../utils/auth-api'
import { useDamStore } from '../../stores/damStore'
import { useWebsitesStore } from '../../stores/websitesStore'
import { uploadAssetToDam, deleteAssetFromDam } from '../../utils/dam-api'
import DocsImageDialog from './DocsImageDialog.vue'
import type { WebsiteRecord } from '../../utils/websites-api'
import {
  docsPreviewUrl, fetchDocsSiteTree, renderDocsDraft, checkDocsNav, readDocsFile, cleanRelativePath, navToYaml, flattenNavForDisplay,
  type DocsDocument, type DocsSiteTree, type NavNode,
} from '../../utils/docs-sites-api'

const props = defineProps<{ isOpen: boolean; website: WebsiteRecord | null }>()
defineEmits<{ close: [] }>()

const damStore = useDamStore()
const websitesStore = useWebsitesStore()
const coreApi = () => getDefaultCoreApiUrl()
const tabs = [{ key: 'documents', name: 'Documents' }, { key: 'index', name: 'Index' }, { key: 'publish', name: 'Publish' }, { key: 'settings', name: 'Settings' }] as const
const tab = ref<'documents' | 'index' | 'publish' | 'settings'>('documents')
const tree = ref<DocsSiteTree | null>(null)
const loading = ref(false)
const busy = ref('')
const error = ref('')
const uploadPublic = ref(true)
const filesInput = ref<HTMLInputElement | null>(null)
const folderInput = ref<HTMLInputElement | null>(null)

const sortedDocuments = computed(() => [...(tree.value?.documents ?? [])].sort((a, b) => a.path.localeCompare(b.path, 'en', { numeric: true })))
const previewUrl = computed(() => (props.website ? docsPreviewUrl(props.website.rootPath) : ''))

async function load() {
  if (!props.website) return
  loading.value = true
  error.value = ''
  try {
    tree.value = await fetchDocsSiteTree(coreApi(), props.website.id)
    navText.value = tree.value.navText ?? ''
    const d = ((props.website.settings ?? {}) as any).docs ?? {}
    settingsForm.value = { title: tree.value.config.title, sourceFolder: tree.value.config.sourceFolder, homeDoc: d.homeDoc ?? '' }
  } catch (e: any) {
    tree.value = null
    error.value = e?.message || 'Could not load the documentation site'
  } finally {
    loading.value = false
  }
}
watch(() => [props.isOpen, props.website?.id], () => { if (props.isOpen) { tab.value = 'documents'; checked.value = false; void load() } }, { immediate: true })

// ---- files ------------------------------------------------------------------------------------------------

const dam = () => damStore.config
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
  error.value = ''
  const failed: string[] = []
  let n = 0
  for (const f of files) {
    // a dropped folder keeps its inner structure (the first segment is the folder's own name: it is the source folder itself)
    const rel = keepFolders ? ((f as any).webkitRelativePath as string).split('/').slice(1).join('/') : f.name
    busy.value = `Uploading ${++n}/${files.length}: ${rel}`
    try { await putFile(rel, f, uploadPublic.value) } catch (e: any) { failed.push(`${rel}: ${e?.message || 'failed'}`) }
  }
  busy.value = ''
  if (failed.length) error.value = `${failed.length} file(s) not stored:\n` + failed.slice(0, 5).join('\n')
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
  openEditor({ path: rel, title, route: '', hidden: false, isPublic: true, version: 0, sizeBytes: 0, s3Key: '' }, `---\ntitle: ${title}\n---\n\n# ${title}\n\n`)
}

async function removePath(path: string) {
  if (!confirm(`Delete "${path}" from the asset library?`)) return
  try {
    await deleteAssetFromDam(dam().assetProcessorUrl, `${folder()}/${path}`, dam().folderRules)
    await load()
  } catch (e: any) {
    error.value = e?.message || 'Could not delete the file'
  }
}

// ---- editor -----------------------------------------------------------------------------------------------

const editing = ref<{ path: string; text: string; isPublic: boolean; isNew: boolean } | null>(null)
const dirty = ref(false)
const preview = ref<{ title: string; html: string; warnings: string[] }>({ title: '', html: '', warnings: [] })
let timer: ReturnType<typeof setTimeout> | null = null
let seq = 0

async function openEditor(d: DocsDocument, initial?: string) {
  error.value = ''
  try {
    const text = initial ?? await readDocsFile(dam().assetProcessorUrl, d.s3Key)
    editing.value = { path: d.path, text, isPublic: d.isPublic, isNew: initial !== undefined }
    dirty.value = initial !== undefined
    await refreshPreview()
  } catch (e: any) {
    error.value = e?.message || 'Could not open the document'
  }
}

async function refreshPreview() {
  if (!editing.value || !props.website) return
  const mine = ++seq
  try {
    const r = await renderDocsDraft(coreApi(), props.website.id, editing.value.path, editing.value.text)
    // the files of the documents are served by the asset processor, which may not be on this origin (local development)
    const assets = dam().assetProcessorUrl.replace(/\/+$/, '')
    if (mine === seq) preview.value = { title: r.title, html: r.html.replace(/(src|href)="\/dam-asset\//g, `$1="${assets}/dam-asset/`), warnings: r.warnings }
  } catch (e: any) {
    if (mine === seq) preview.value = { title: '', html: '', warnings: [e?.message || 'Preview failed'] }
  }
}
function onEdit() {
  dirty.value = true
  if (timer) clearTimeout(timer)
  timer = setTimeout(refreshPreview, 350)
}
onBeforeUnmount(() => { if (timer) clearTimeout(timer) })

async function saveEditing() {
  const e = editing.value
  if (!e || !dirty.value) return
  busy.value = `Saving ${e.path}…`
  try {
    await putFile(e.path, new Blob([e.text]), e.isPublic)
    dirty.value = false
    e.isNew = false
    await load()
  } catch (err: any) {
    error.value = err?.message || 'Could not save the document'
  } finally {
    busy.value = ''
  }
}
const imageDialog = ref(false)
/** Puts the Markdown of the chosen image at the cursor of the editor (on its own line when the cursor is mid-line). */
async function insertImage(md: string) {
  imageDialog.value = false
  const e = editing.value
  if (!e) return
  const ta = document.querySelector<HTMLTextAreaElement>('[data-testid="docs-edit-text"]')
  const at = ta ? ta.selectionStart : e.text.length
  const end = ta ? ta.selectionEnd : at
  const before = e.text.slice(0, at)
  const after = e.text.slice(end)
  const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
  const trail = after.startsWith('\n') ? '' : '\n\n'
  e.text = before + lead + md + trail + after
  dirty.value = true
  await load()          // the image may be new: the folder's file list (and the preview's links) follow
  await refreshPreview()
}
function closeEditor() {
  if (dirty.value && !confirm('Discard the unsaved changes?')) return
  editing.value = null
  dirty.value = false
}

// ---- index ------------------------------------------------------------------------------------------------

const navText = ref('')
const navErrors = ref<string[]>([])
const navWarnings = ref<string[]>([])
const checkedNav = ref<NavNode[] | null>(null)
const checked = ref(false)
const displayedNav = computed(() => flattenNavForDisplay(checked.value && checkedNav.value ? checkedNav.value : tree.value?.nav ?? []))

function fillFromFolders() {
  navText.value = navToYaml(tree.value?.autoNav ?? [])
  checked.value = false
  navErrors.value = []; navWarnings.value = []
}
async function checkNav(): Promise<boolean> {
  if (!props.website) return false
  navErrors.value = []; navWarnings.value = []
  try {
    const r = await checkDocsNav(coreApi(), props.website.id, navText.value)
    navErrors.value = r.errors; navWarnings.value = r.warnings
    checkedNav.value = r.ok ? r.nav : null
    checked.value = r.ok
    return r.ok
  } catch (e: any) {
    navErrors.value = [e?.message || 'Check failed']
    return false
  }
}
async function saveNav() {
  if (!tree.value || !(await checkNav())) return
  busy.value = 'Saving the index…'
  try {
    await putFile(tree.value.navFile, new Blob([navText.value]), true)
    checked.value = false
    await load()
  } catch (e: any) {
    error.value = e?.message || 'Could not save the index'
  } finally {
    busy.value = ''
  }
}
async function removeNavFile() {
  if (!tree.value || !confirm('Delete the index file and follow the folders again?')) return
  try {
    await deleteAssetFromDam(dam().assetProcessorUrl, `${folder()}/${tree.value.navFile}`, dam().folderRules)
    checked.value = false; navErrors.value = []; navWarnings.value = []
    await load()
  } catch (e: any) {
    error.value = e?.message || 'Could not delete the index file'
  }
}

// ---- publish ----------------------------------------------------------------------------------------------

const publishBase = ref('/')
const publishSiteUrl = ref('')
const copied = ref(false)
const publicCount = computed(() => tree.value?.documents.filter((d) => d.isPublic).length ?? 0)
const shellQuote = (v: string) => (/^[A-Za-z0-9_@%+=:,./-]+$/.test(v) ? v : `'${v.replace(/'/g, `'\\''`)}'`)
const publishCommand = computed(() => {
  const w = props.website
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
  if (!props.website) return
  const folderPath = cleanRelativePath(settingsForm.value.sourceFolder)
  if (!folderPath) { error.value = 'The source folder is not a valid path'; return }
  busy.value = 'Saving…'
  try {
    const current = (props.website.settings ?? {}) as Record<string, any>
    const settings = { ...current, kind: 'docs', docs: { ...(current.docs ?? {}), sourceFolder: '/' + folderPath, title: settingsForm.value.title.trim() || undefined, homeDoc: settingsForm.value.homeDoc.trim() || undefined } }
    const updated = await websitesStore.update(props.website.id, { settings })
    if (updated && props.website) props.website.settings = updated.settings
    await load()
  } catch (e: any) {
    error.value = e?.message || 'Could not save the settings'
  } finally {
    busy.value = ''
  }
}
</script>

<style scoped>
.docs-preview :deep(h1) { font-size: 1.6rem; font-weight: 700; margin: 0 0 .75rem; }
.docs-preview :deep(h2) { font-size: 1.25rem; font-weight: 700; margin: 1.4rem 0 .5rem; }
.docs-preview :deep(h3) { font-size: 1.05rem; font-weight: 600; margin: 1.1rem 0 .4rem; }
.docs-preview :deep(p), .docs-preview :deep(ul), .docs-preview :deep(ol), .docs-preview :deep(pre), .docs-preview :deep(table), .docs-preview :deep(blockquote) { margin: 0 0 .8rem; }
.docs-preview :deep(ul) { list-style: disc; padding-left: 1.4rem; }
.docs-preview :deep(ol) { list-style: decimal; padding-left: 1.4rem; }
.docs-preview :deep(a) { color: #818cf8; text-decoration: underline; }
.docs-preview :deep(pre) { background: #0b1020; color: #e2e8f0; padding: .75rem; border-radius: .5rem; overflow-x: auto; font-size: .8rem; }
.docs-preview :deep(code) { font-family: ui-monospace, monospace; font-size: .85em; }
.docs-preview :deep(:not(pre) > code) { background: rgba(148,163,184,.2); padding: .1rem .3rem; border-radius: .25rem; }
.docs-preview :deep(table) { border-collapse: collapse; }
.docs-preview :deep(th), .docs-preview :deep(td) { border: 1px solid rgba(148,163,184,.35); padding: .25rem .6rem; }
.docs-preview :deep(blockquote) { border-left: 3px solid #6366f1; padding-left: .8rem; color: #94a3b8; }
.docs-preview :deep(img) { max-width: 100%; height: auto; }
.docs-preview :deep(img.doc-img-left), .docs-preview :deep(img.doc-img-center), .docs-preview :deep(img.doc-img-right) { display: block; }
.docs-preview :deep(img.doc-img-center) { margin: .8rem auto; }
.docs-preview :deep(img.doc-img-right) { margin: .8rem 0 .8rem auto; }
.docs-preview :deep(img.doc-img-left) { margin: .8rem auto .8rem 0; }
.docs-preview :deep(img.doc-img-float-left) { float: left; margin: .2rem 1rem .8rem 0; }
.docs-preview :deep(img.doc-img-float-right) { float: right; margin: .2rem 0 .8rem 1rem; }
.docs-preview :deep(h1), .docs-preview :deep(h2), .docs-preview :deep(h3), .docs-preview :deep(pre) { clear: both; }
.docs-preview :deep(.doc-anchor) { margin-left: .4rem; opacity: 0; text-decoration: none; }
.docs-preview :deep(h1:hover .doc-anchor), .docs-preview :deep(h2:hover .doc-anchor), .docs-preview :deep(h3:hover .doc-anchor) { opacity: .6; }
.docs-preview :deep(.doc-admonition) { border-left: 4px solid #6366f1; background: rgba(99,102,241,.1); padding: .6rem .8rem; border-radius: .4rem; margin: 0 0 .8rem; }
.docs-preview :deep(.doc-admonition-warning) { border-color: #f59e0b; background: rgba(245,158,11,.1); }
.docs-preview :deep(.doc-admonition-danger) { border-color: #ef4444; background: rgba(239,68,68,.1); }
.docs-preview :deep(.doc-admonition-tip) { border-color: #10b981; background: rgba(16,185,129,.1); }
.docs-preview :deep(.doc-admonition-title) { font-weight: 700; margin: 0 0 .25rem; }
</style>
