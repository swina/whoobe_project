<template>
  <div class="min-h-screen bg-white text-gray-800">
    <header class="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-200">
      <div class="max-w-[100rem] mx-auto px-4 h-14 flex items-center gap-4">
        <button class="md:hidden p-1 -ml-1 text-gray-600" aria-label="Menu" @click="menuOpen = !menuOpen">☰</button>
        <a :href="hrefOf('')" class="font-bold text-gray-900 truncate" @click.prevent="go('')">{{ view?.siteTitle || site.title }}</a>
        <span v-if="view?.draft" class="hidden sm:inline text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700" title="You are signed in: private documents are shown">preview</span>
        <div class="ml-auto relative w-full max-w-sm">
          <input ref="searchBox" v-model="query" type="search" placeholder="Search the documentation…  (Ctrl K)" aria-label="Search the documentation" data-testid="docs-search"
            autocomplete="off" class="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:bg-white"
            @focus="openSearch" @input="searchOpen = true" @keydown.down.prevent="moveActive(1)" @keydown.up.prevent="moveActive(-1)" @keydown.enter.prevent="chooseActive" @keydown.esc="closeSearch" @blur="closeSoon" />
          <div v-if="searchOpen && query.trim()" class="absolute right-0 left-0 mt-1 max-h-[70vh] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl z-30" data-testid="docs-results" role="listbox">
            <div v-if="searchError" class="px-3 py-2 text-xs text-rose-600">{{ searchError }}</div>
            <div v-else-if="!results.length" class="px-3 py-3 text-sm text-gray-500">No results for “{{ query.trim() }}”.</div>
            <a v-for="(r, i) in results" :key="r.id" :href="hrefOf(r.route)" role="option" :aria-selected="i === active" data-testid="docs-result"
              :class="['block px-3 py-2 border-b border-gray-100 last:border-0', i === active ? 'bg-indigo-50' : 'hover:bg-gray-50']"
              @mousedown.prevent="choose(r)" @mouseenter="active = i">
              <div class="text-sm font-medium text-gray-900 truncate"><span v-if="r.page" class="text-gray-400 font-normal">{{ r.page }} › </span>{{ r.title }}</div>
              <div v-if="r.breadcrumb" class="text-[11px] text-gray-400 truncate">{{ r.breadcrumb }}</div>
              <div v-if="r.excerpt && !r.page" class="text-xs text-gray-500 line-clamp-2">{{ r.excerpt }}</div>
            </a>
          </div>
        </div>
      </div>
    </header>

    <div class="max-w-[100rem] mx-auto px-4 flex gap-6 lg:gap-10">
      <aside :class="['md:block w-56 shrink-0 py-6 md:sticky md:top-14 md:self-start md:max-h-[calc(100vh-3.5rem)] overflow-y-auto', menuOpen ? 'block fixed inset-x-0 top-14 bottom-0 z-10 bg-white px-4' : 'hidden']" data-testid="docs-nav">
        <DocsNavTree v-if="view" :items="view.nav" :current="view.page.route" :href-of="hrefOf" @go="go" />
      </aside>

      <main class="flex-1 min-w-0 py-8">
        <div v-if="loading" class="text-sm text-gray-400">Loading…</div>
        <div v-else-if="notFound" class="py-16 text-center">
          <h1 class="text-2xl font-bold mb-2">Document not found</h1>
          <p class="text-gray-500 text-sm"><a :href="hrefOf('')" class="text-indigo-600 underline" @click.prevent="go('')">Go to the start page</a></p>
        </div>
        <div v-else-if="errorMessage" class="text-sm text-rose-600">{{ errorMessage }}</div>
        <article v-else-if="view" class="max-w-[62rem]">
          <nav v-if="view.page.breadcrumbs.length > 1" class="text-xs text-gray-500 mb-4 flex flex-wrap gap-1" aria-label="Breadcrumb">
            <template v-for="(b, i) in view.page.breadcrumbs" :key="i">
              <span v-if="i > 0" aria-hidden="true">/</span>
              <a v-if="b.route && i < view.page.breadcrumbs.length - 1" :href="hrefOf(b.route)" class="hover:text-gray-800" @click.prevent="go(b.route)">{{ b.title }}</a>
              <span v-else>{{ b.title }}</span>
            </template>
          </nav>
          <div ref="content" class="doc-content" data-testid="docs-content" @click="onContentClick" v-html="view.page.html"></div>

          <div v-if="view.draft && view.page.warnings?.length" class="mt-8 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <div class="font-semibold mb-1">Problems in this document (shown to editors only)</div>
            <div v-for="w in view.page.warnings" :key="w">{{ w }}</div>
          </div>

          <div class="mt-12 pt-4 border-t border-gray-200 flex justify-between gap-4 text-sm">
            <a v-if="view.page.prev" :href="hrefOf(view.page.prev.route)" class="text-indigo-600 hover:underline" @click.prevent="go(view.page.prev.route)">← {{ view.page.prev.title }}</a><span v-else></span>
            <a v-if="view.page.next" :href="hrefOf(view.page.next.route)" class="text-indigo-600 hover:underline text-right" @click.prevent="go(view.page.next.route)">{{ view.page.next.title }} →</a>
          </div>
          <p v-if="view.page.updatedAt" class="mt-4 text-xs text-gray-400">Last updated {{ new Date(view.page.updatedAt).toLocaleDateString() }}</p>
        </article>
      </main>

      <aside v-if="view && view.page.headings.length" class="hidden lg:block w-48 shrink-0 py-8 sticky top-14 self-start max-h-[calc(100vh-3.5rem)] overflow-y-auto" data-testid="docs-toc">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">On this page</div>
        <ul class="space-y-0.5 text-[13px] leading-snug">
          <li v-for="h in view.page.headings" :key="h.id" :class="h.depth === 3 ? 'ml-3' : ''">
            <a :href="'#' + h.id" :class="['block truncate', activeHeading === h.id ? 'text-indigo-600 font-medium' : 'text-gray-500 hover:text-gray-800']" @click.prevent="scrollTo(h.id)">{{ h.text }}</a>
          </li>
        </ul>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
// The documentation layout (docs/plans/docs-sites/docs-site-plan.md section 7): header with search, the index on the left,
// the page, "on this page" on the right, previous/next. Rendered by the editor application at the website's root path.
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { drawMermaid } from '../docs-mermaid'
import { loadDocsSearch, loadDocsView, type DocsSiteRef, type DocsView, type SearchHit } from '../docs-api'
import DocsNavTree from '../components/DocsNavTree.vue'
import { getDefaultAssetProcessorUrl } from '../dam-api'

const props = defineProps<{ site: DocsSiteRef; route: string }>()
const router = useRouter()

const view = ref<DocsView | null>(null)
const loading = ref(true)
const notFound = ref(false)
const errorMessage = ref('')
const menuOpen = ref(false)
const query = ref('')
const activeHeading = ref('')
const content = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

/** The address of a document of this site, base path of the application included. */
function hrefOf(route: string): string {
  return router.resolve(`${props.site.rootPath}${route === '/' ? '' : route}` || '/').href
}
function go(route: string) {
  menuOpen.value = false
  void router.push(`${props.site.rootPath}${route === '/' ? '' : route}` || '/')
}

async function load() {
  loading.value = true; notFound.value = false; errorMessage.value = ''
  try {
    view.value = await loadDocsView(props.site, props.route)
    document.title = `${view.value.page.title} | ${view.value.siteTitle}`
  } catch (e: any) {
    view.value = null
    if (e?.status === 404) notFound.value = true
    else errorMessage.value = e?.message || 'The documentation could not be loaded'
  } finally {
    loading.value = false
  }
  await nextTick()
  watchHeadings()
  void drawMermaid(content.value)
  const hash = window.location.hash.slice(1)
  if (hash) scrollTo(hash, false); else window.scrollTo({ top: 0 })
}

function scrollTo(id: string, smooth = true) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
  history.replaceState(history.state, '', `#${id}`)
  activeHeading.value = id
}

// Links inside the rendered page: the pipeline marks the addresses of this site (data-doc, written "/guide/install", relative to the
// site); '#x', files, absolute addresses of the host and external ones are left alone.
function onContentClick(e: MouseEvent) {
  const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
  if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return
  const href = a.getAttribute('href') ?? ''
  if (href.startsWith('#')) { e.preventDefault(); scrollTo(decodeURIComponent(href.slice(1))); return }
  if (a.hasAttribute('data-doc')) {                                  // an address inside this site
    const [path, hash] = (a.dataset.docRoute ?? href).split('#')     // the address as written, not the one made real by rewriteContentLinks
    e.preventDefault()
    void router.push(`${props.site.rootPath}${path === '/' ? '' : path}${hash ? '#' + hash : ''}`)
  }
}
// Make the marked addresses real hrefs (hover, middle click) with the site's root path; the files of the documents ("/dam-asset/...")
// are served by the asset processor, which is not always on this origin (local development, a separate host).
function rewriteContentLinks() {
  const assets = getDefaultAssetProcessorUrl().replace(/\/+$/, '')
  content.value?.querySelectorAll<HTMLElement>('img[src^="/dam-asset/"], a[href^="/dam-asset/"]').forEach((el) => {
    const attr = el.tagName === 'IMG' ? 'src' : 'href'
    el.setAttribute(attr, assets + (el.getAttribute(attr) ?? ''))
  })
  content.value?.querySelectorAll<HTMLAnchorElement>('a[data-doc]').forEach((a) => {
    const href = a.dataset.docRoute ?? a.getAttribute('href') ?? ''
    a.dataset.docRoute = href
    const [path, hash] = href.split('#')
    a.setAttribute('href', router.resolve(`${props.site.rootPath}${path === '/' ? '' : path}${hash ? '#' + hash : ''}`).href)
  })
}

function watchHeadings() {
  observer?.disconnect()
  rewriteContentLinks()
  const ids = view.value?.page.headings.map((h) => h.id) ?? []
  if (!ids.length || typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((en) => en.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
    if (visible[0]) activeHeading.value = visible[0].target.id
  }, { rootMargin: '-60px 0px -70% 0px' })
  ids.forEach((id) => { const el = document.getElementById(id); if (el) observer!.observe(el) })
}

// Search: the index of the site is downloaded once (on the first focus) and searched in the browser, so results appear as you type.
const searchBox = ref<HTMLInputElement | null>(null)
const searchOpen = ref(false)
const searchError = ref('')
const results = ref<SearchHit[]>([])
const active = ref(0)
let searcher: ((q: string) => SearchHit[]) | null = null
let searcherLoading: Promise<void> | null = null

async function openSearch() {
  searchOpen.value = true
  if (searcher || searcherLoading) return
  searcherLoading = loadDocsSearch(props.site, !!view.value?.draft).then((fn) => { searcher = fn; runSearch() }).catch((e) => { searchError.value = e?.message || 'Search is not available' }).finally(() => { searcherLoading = null })
}
function runSearch() {
  results.value = searcher && query.value.trim() ? searcher(query.value) : []
  active.value = 0
}
watch(query, runSearch)
function moveActive(d: number) { if (results.value.length) active.value = (active.value + d + results.value.length) % results.value.length }
function chooseActive() { const r = results.value[active.value]; if (r) choose(r) }
function choose(r: SearchHit) {
  closeSearch()
  query.value = ''
  void router.push(`${props.site.rootPath}${r.route === '/' ? '' : r.route}${r.hash ? '#' + r.hash : ''}`)
}
function closeSearch() { searchOpen.value = false; searchBox.value?.blur() }
function closeSoon() { setTimeout(() => { searchOpen.value = false }, 150) }
function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchBox.value?.focus() }
}

watch(() => props.route, load)
onMounted(() => { void load(); window.addEventListener('keydown', onKey) })
onBeforeUnmount(() => { observer?.disconnect(); window.removeEventListener('keydown', onKey) })
</script>

<style scoped>
.doc-content :deep(h1) { font-size: 2rem; font-weight: 800; margin: 0 0 1rem; line-height: 1.2; }
.doc-content :deep(h2) { font-size: 1.5rem; font-weight: 700; margin: 2.2rem 0 .75rem; padding-top: .5rem; border-top: 1px solid #e5e7eb; scroll-margin-top: 4.5rem; }
.doc-content :deep(h3) { font-size: 1.2rem; font-weight: 600; margin: 1.6rem 0 .5rem; scroll-margin-top: 4.5rem; }
.doc-content :deep(h4) { font-weight: 600; margin: 1.2rem 0 .4rem; scroll-margin-top: 4.5rem; }
.doc-content :deep(p), .doc-content :deep(ul), .doc-content :deep(ol), .doc-content :deep(pre), .doc-content :deep(table), .doc-content :deep(blockquote), .doc-content :deep(.doc-admonition) { margin: 0 0 1rem; line-height: 1.7; }
.doc-content :deep(ul) { list-style: disc; padding-left: 1.5rem; }
.doc-content :deep(ol) { list-style: decimal; padding-left: 1.5rem; }
.doc-content :deep(li > ul), .doc-content :deep(li > ol) { margin: .25rem 0 0; }
.doc-content :deep(a) { color: #4f46e5; text-decoration: underline; }
.doc-content :deep(.doc-anchor) { margin-left: .5rem; color: #9ca3af; text-decoration: none; opacity: 0; font-weight: 400; }
.doc-content :deep(h1:hover .doc-anchor), .doc-content :deep(h2:hover .doc-anchor), .doc-content :deep(h3:hover .doc-anchor), .doc-content :deep(h4:hover .doc-anchor) { opacity: 1; }
.doc-content :deep(pre) { background: #0f172a; color: #e2e8f0; padding: 1rem; border-radius: .6rem; overflow-x: auto; font-size: .85rem; line-height: 1.55; }
.doc-content :deep(code) { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .88em; }
.doc-content :deep(:not(pre) > code) { background: #f1f5f9; color: #be185d; padding: .1rem .35rem; border-radius: .3rem; }
.doc-content :deep(table) { border-collapse: collapse; display: block; overflow-x: auto; }
.doc-content :deep(th), .doc-content :deep(td) { border: 1px solid #e5e7eb; padding: .4rem .75rem; text-align: left; }
.doc-content :deep(th) { background: #f9fafb; font-weight: 600; }
.doc-content :deep(blockquote) { border-left: 4px solid #c7d2fe; padding-left: 1rem; color: #4b5563; }
.doc-content :deep(img) { max-width: 100%; height: auto; border-radius: .4rem; }
.doc-content :deep(img.doc-img-left), .doc-content :deep(img.doc-img-center), .doc-content :deep(img.doc-img-right) { display: block; }
.doc-content :deep(img.doc-img-center) { margin: 1rem auto; }
.doc-content :deep(img.doc-img-right) { margin: 1rem 0 1rem auto; }
.doc-content :deep(img.doc-img-left) { margin: 1rem auto 1rem 0; }
.doc-content :deep(img.doc-img-float-left) { float: left; margin: .25rem 1.25rem 1rem 0; }
.doc-content :deep(img.doc-img-float-right) { float: right; margin: .25rem 0 1rem 1.25rem; }
.doc-content :deep(h1), .doc-content :deep(h2), .doc-content :deep(h3), .doc-content :deep(pre), .doc-content :deep(table) { clear: both; }
.doc-content :deep(hr) { border: 0; border-top: 1px solid #e5e7eb; margin: 2rem 0; }
.doc-content :deep(.doc-admonition) { border-left: 4px solid #6366f1; background: #eef2ff; padding: .75rem 1rem; border-radius: .5rem; }
.doc-content :deep(.doc-admonition-tip) { border-color: #10b981; background: #ecfdf5; }
.doc-content :deep(.doc-admonition-warning) { border-color: #f59e0b; background: #fffbeb; }
.doc-content :deep(.doc-admonition-danger) { border-color: #ef4444; background: #fef2f2; }
.doc-content :deep(.doc-admonition-title) { font-weight: 700; margin: 0 0 .25rem; }
.doc-content :deep(.doc-admonition > :last-child) { margin-bottom: 0; }
</style>
