<template>
  <div class="h-full flex flex-col" data-testid="docs-doc-tab">
    <div class="flex items-center justify-between px-4 py-2 border-b border-slate-800 light:border-slate-200 shrink-0 gap-3">
      <div class="min-w-0">
        <div class="text-sm font-semibold text-slate-100 light:text-slate-900 truncate">{{ path }}</div>
        <div class="text-xs text-slate-500 truncate">{{ siteName }} · {{ status }}</div>
      </div>
      <div class="flex items-center gap-3 shrink-0">
        <a v-if="siteUrl" data-testid="docs-doc-preview" :href="siteUrl" target="_blank" rel="noopener" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/40 flex items-center gap-1.5" title="Open this page in the site (saved version)"><ExternalLink class="w-3.5 h-3.5" />Preview</a>
        <button data-testid="docs-insert-image" class="btn btn-secondary" :disabled="!loaded" @click="imageDialog = true">Insert image</button>
        <label class="text-xs text-slate-400 flex items-center gap-1.5"><input v-model="isPublic" data-testid="docs-edit-public" type="checkbox" @change="markDirty" />Public</label>
        <button data-testid="docs-edit-save" class="btn btn-primary" :disabled="!!busy || !dirty" @click="save">Save</button>
      </div>
    </div>
    <div v-if="error" class="mx-4 mt-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 whitespace-pre-line">{{ error }}</div>
    <div class="flex-1 min-h-0 grid md:grid-cols-2 gap-px bg-slate-800 light:bg-slate-200 mt-2">
      <textarea ref="textarea" v-model="text" data-testid="docs-edit-text" spellcheck="false" :disabled="!loaded" class="min-h-0 resize-none p-3 text-sm font-mono bg-slate-950 light:bg-white text-slate-200 light:text-slate-800 outline-none" @input="onEdit" @keydown.ctrl.s.prevent="save" @keydown.meta.s.prevent="save"></textarea>
      <div class="min-h-0 overflow-y-auto bg-slate-900 light:bg-slate-50 p-4">
        <div v-if="preview.warnings.length" class="mb-3 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2"><div v-for="w in preview.warnings" :key="w">{{ w }}</div></div>
        <div ref="previewEl" data-testid="docs-edit-preview" class="docs-preview" v-html="preview.html"></div>
      </div>
    </div>
    <DocsImageDialog v-if="imageDialog && tree" :tree="tree" :doc-path="path" @close="imageDialog = false" @insert="insertImage" />
  </div>
</template>

<script setup lang="ts">
// One document of a documentation site in a tab of its own (docs/plans/docs-sites/docs-site-plan.md): the Markdown on one side,
// the page as it will look on the other. The tab asks before it is closed with unsaved changes (tabsStore `dirty`).
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ExternalLink } from '@lucide/vue'
import { getDefaultCoreApiUrl } from '../../utils/auth-api'
import { useDamStore } from '../../stores/damStore'
import { useWebsitesStore } from '../../stores/websitesStore'
import { useTabsStore, docsDocTabId } from '../../stores/tabsStore'
import { useDocsSitesStore } from '../../stores/docsSitesStore'
import { uploadAssetToDam } from '../../utils/dam-api'
import { docsPreviewUrl, readDocsFile, renderDocsDraft, cleanRelativePath } from '../../utils/docs-sites-api'
import DocsImageDialog from './DocsImageDialog.vue'
import { drawMermaid } from '../../utils/docs-mermaid'

const props = defineProps<{ websiteId: string; path: string }>()

const dam = useDamStore()
const websites = useWebsitesStore()
const tabs = useTabsStore()
const docsStore = useDocsSitesStore()
const tabId = docsDocTabId(props.websiteId, props.path)

const tree = computed(() => docsStore.trees[props.websiteId] ?? null)
const website = computed(() => websites.websites.find((w) => w.id === props.websiteId) ?? null)
const siteName = computed(() => website.value?.name ?? '')
const doc = computed(() => tree.value?.documents.find((d) => d.path === props.path) ?? null)
const siteUrl = computed(() => {
  if (!website.value || !doc.value) return ''
  return docsPreviewUrl(website.value.rootPath).replace(/\/$/, '') + (doc.value.route === '/' ? '/' : doc.value.route)
})

const text = ref('')
const isPublic = ref(true)
const loaded = ref(false)
const isNew = ref(false)
const dirty = ref(false)
const busy = ref('')
const error = ref('')
const imageDialog = ref(false)
const textarea = ref<HTMLTextAreaElement | null>(null)
const preview = ref<{ html: string; warnings: string[] }>({ html: '', warnings: [] })
const previewEl = ref<HTMLElement | null>(null)
// the preview is replaced as a whole on each change: diagrams are drawn again after it
watch(() => preview.value.html, async () => { await nextTick(); void drawMermaid(previewEl.value) })
const status = computed(() => (busy.value || (dirty.value ? 'Unsaved changes' : isNew.value ? 'Not saved yet' : 'Saved')))

watch(dirty, (v) => tabs.setDirty(tabId, v))

async function init() {
  error.value = ''
  const tab = tabs.tabs.find((t) => t.id === tabId)
  if (!tree.value) await docsStore.load(props.websiteId)
  try {
    if (tab?.docsInitialText !== undefined && !doc.value) {
      text.value = tab.docsInitialText
      isNew.value = true
      isPublic.value = true
      dirty.value = true
    } else if (doc.value) {
      text.value = await readDocsFile(dam.config.assetProcessorUrl, doc.value.s3Key)
      isPublic.value = doc.value.isPublic
    } else {
      throw new Error('This document does not exist (any more)')
    }
    loaded.value = true
    await refreshPreview()
  } catch (e: any) {
    error.value = e?.message || 'Could not open the document'
  }
}
onMounted(init)

let timer: ReturnType<typeof setTimeout> | null = null
let seq = 0
async function refreshPreview() {
  const mine = ++seq
  try {
    const r = await renderDocsDraft(getDefaultCoreApiUrl(), props.websiteId, props.path, text.value)
    // the files of the documents are served by the asset processor, which may not be on this origin (local development)
    const assets = dam.config.assetProcessorUrl.replace(/\/+$/, '')
    if (mine === seq) preview.value = { html: r.html.replace(/(src|href)="\/dam-asset\//g, `$1="${assets}/dam-asset/`), warnings: r.warnings }
  } catch (e: any) {
    if (mine === seq) preview.value = { html: '', warnings: [e?.message || 'Preview failed'] }
  }
}
function markDirty() { dirty.value = true }
function onEdit() {
  dirty.value = true
  if (timer) clearTimeout(timer)
  timer = setTimeout(refreshPreview, 350)
}
function warnBeforeUnload(e: BeforeUnloadEvent) { if (dirty.value) { e.preventDefault(); e.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', warnBeforeUnload))
onBeforeUnmount(() => { if (timer) clearTimeout(timer); window.removeEventListener('beforeunload', warnBeforeUnload) })

async function save() {
  if (!dirty.value || !tree.value) return
  const clean = cleanRelativePath(props.path)
  if (!clean) { error.value = 'The path is not valid'; return }
  busy.value = 'Saving…'
  error.value = ''
  try {
    const filename = clean.split('/').pop() as string
    await uploadAssetToDam(dam.config.assetProcessorUrl, new Blob([text.value], { type: 'text/markdown' }), filename, `${tree.value.config.sourceFolder}/${clean}`, isPublic.value, dam.config.folderRules)
    dirty.value = false
    isNew.value = false
    await docsStore.load(props.websiteId)
  } catch (e: any) {
    error.value = e?.message || 'Could not save the document'
  } finally {
    busy.value = ''
  }
}

/** Puts the Markdown of the chosen image at the cursor (on its own line when the cursor is mid-line). */
async function insertImage(md: string) {
  imageDialog.value = false
  const ta = textarea.value
  const at = ta ? ta.selectionStart : text.value.length
  const end = ta ? ta.selectionEnd : at
  const before = text.value.slice(0, at)
  const after = text.value.slice(end)
  const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
  const trail = after.startsWith('\n') ? '' : '\n\n'
  text.value = before + lead + md + trail + after
  dirty.value = true
  await docsStore.load(props.websiteId)       // the image may be new: the folder's file list (and the preview's links) follow
  await refreshPreview()
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
.docs-preview :deep(.doc-mermaid) { margin: 0 0 .8rem; overflow-x: auto; text-align: center; }
.docs-preview :deep(.doc-mermaid svg) { max-width: 100%; height: auto; }
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
