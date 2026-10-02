<template>
  <div v-if="iframeSrc" class="h-full flex flex-col gap-2">
    <details v-if="page" class="shrink-0 rounded-xl border border-slate-800 light:border-slate-200 px-3 py-2 text-xs">
      <summary class="cursor-pointer font-semibold text-slate-400">
        SEO applied to this preview
        <span v-if="seoIsDynamic" class="ml-2 font-normal text-indigo-400">dynamic - values filled from the data record</span>
        <span v-if="seoWarnings.length" class="ml-2 text-amber-400">{{ seoWarnings.length }} warning(s)</span>
      </summary>
      <div class="mt-2 space-y-2">
        <div class="rounded-lg bg-white p-2 text-left">
          <div class="text-[11px] text-green-700 truncate">{{ seoCanonical }}</div>
          <div class="text-base text-blue-700 leading-snug truncate">{{ seoTitle }}</div>
          <div class="text-xs text-slate-600 line-clamp-2">{{ seoDescription || 'No meta description' }}</div>
        </div>
        <dl class="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-slate-400">
          <dt>Robots</dt>
          <dd class="font-mono">{{ seoRobots }}</dd>
          <dt>OG title</dt>
          <dd class="truncate">{{ effectiveSeo?.ogTitle || seoTitle }}</dd>
          <dt>OG image</dt>
          <dd class="truncate font-mono">{{ effectiveSeo?.ogImage || '—' }}</dd>
          <dt>Structured data</dt>
          <dd>{{ effectiveSeo?.structuredData && Object.keys(effectiveSeo.structuredData).length ? 'JSON-LD present' : '—' }}</dd>
        </dl>
        <ul v-if="seoWarnings.length" class="list-disc pl-4 text-amber-400">
          <li v-for="w in seoWarnings" :key="w">{{ w }}</li>
        </ul>
      </div>
    </details>
    <div class="flex-1 min-h-0 rounded-xl overflow-hidden border border-slate-800 light:border-slate-200 bg-white">
      <iframe ref="iframeEl" :src="iframeSrc" class="w-full h-full border-0"></iframe>
    </div>
  </div>
  <div v-else-if="!page?.published" class="flex flex-col items-center justify-center h-full space-y-3 text-center">
    <Eye class="w-10 h-10 text-slate-600" />
    <p class="text-sm font-semibold text-slate-400">Page Preview</p>
    <p class="text-xs text-slate-600 mb-3">Publish the page to see the live preview.</p>
  </div>
  <div v-else class="flex flex-col items-center justify-center h-full space-y-3 text-center">
    <Eye class="w-10 h-10 text-slate-600" />
    <p class="text-sm font-semibold text-slate-400">Page Preview</p>
    <p class="text-xs text-slate-500 mb-1">
      This page's path is a dynamic pattern (<span class="font-mono text-indigo-400">{{ page.slug }}</span>) —
      previewing it needs one specific record.
    </p>
    <p class="text-xs text-slate-600">
      Open the <span class="font-semibold">Editor</span> tab and use its own Preview → "Preview as path",
      or click a list-to-detail link pointing at this page.
    </p>
  </div>
</template>

<script setup lang="ts">
// Renders the real, resolved page inline via an <iframe> pointed at
// apps/whoobe-one-spike's own PublicPage.vue catch-all route - reuses all
// of that app's already-correct resolution/rendering logic (collection
// bindings, {placeholder} filter substitution, list-to-detail hrefs)
// rather than re-porting any of it into admin-dashboard a second time.
//
// pagePreviewPath/pagePreviewLocale (set by tabsStore.ts's openPagePreview,
// the receiving end of a list-to-detail-link postMessage - see
// DashboardLayout.vue) target one specific resolved record; absent, this
// falls back to the page's own static slug (works the same way for any
// non-dynamic page). A dynamic page with no override shows a notice
// instead of guessing - see docs/plans/website/website-paths.md.
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Eye } from '@lucide/vue'
import { usePagesStore } from '../../stores/pagesStore'
import { useTabsStore } from '../../stores/tabsStore'
import { useWebsitesStore } from '../../stores/websitesStore'
import type { WhoobeOnePage, PageSeo } from '../../utils/pages-api'
import { seoHasTokens, hasSeoTokens } from '@whoobe-cms/core'
import { getWhoobeOneSpikeUrl } from '../../utils/editor-urls'

const props = defineProps<{
  pageId: string
}>()

const pagesStore = usePagesStore()
const tabsStore = useTabsStore()
const websitesStore = useWebsitesStore()
const page = ref<WhoobeOnePage | null>(null)

const currentTab = computed(() => tabsStore.tabs.find((t) => t.itemKind === 'page' && t.itemId === props.pageId))

const iframeSrc = computed(() => {
  const base = getWhoobeOneSpikeUrl()
  const tab = currentTab.value
  if (tab?.pagePreviewPath) {
    return `${base}${tab.pagePreviewPath}`
  }
  if (page.value?.published && page.value.slug && !page.value.slug.includes('{')) {
    const p = page.value
    const slug = p.slug
    const locale = p.locale || 'en'
    // Look up the website's rootPath so the public API can scope the lookup
    const website = p.websiteId
      ? websitesStore.websites.find((w) => w.id === p.websiteId)
      : undefined
    const rootPath = website?.rootPath || ''
    // Append ?locale and ?rootPath so whoobe-one-spike passes them to the
    // public API, which strips rootPath before looking up the page.
    const query = `?locale=${encodeURIComponent(locale)}${rootPath ? `&rootPath=${encodeURIComponent(rootPath)}` : ''}`
    return `${base}${rootPath}${slug}${query}`
  }
  return null
})

// SEO as the preview actually renders it. A dynamic page's meta fields can
// hold `{field}` tokens; the embedded whoobe-one-spike page resolves them from
// the bound record and posts the result up (PublicPage.vue's applyDynamicSeo) -
// this panel can't read the iframe's <head> itself. Until that message
// arrives it shows the stored values.
const iframeEl = ref<HTMLIFrameElement | null>(null)
const resolvedSeo = ref<PageSeo | null>(null)
const effectiveSeo = computed<PageSeo | null>(() => resolvedSeo.value ?? page.value?.seo ?? null)
const seoIsDynamic = computed(() => seoHasTokens(page.value?.seo))

function onSeoMessage(event: MessageEvent) {
  if (event.data?.type !== 'whoobe-one:seo-resolved') return
  if (event.source !== iframeEl.value?.contentWindow) return
  resolvedSeo.value = (event.data.seo as PageSeo | null) ?? null
}

// A different preview target (another record) is a different page render.
watch(iframeSrc, () => (resolvedSeo.value = null))

const seoTitle = computed(() => effectiveSeo.value?.metaTitle || page.value?.title || '')
const seoDescription = computed(() => effectiveSeo.value?.metaDescription || '')
const seoCanonical = computed(() => effectiveSeo.value?.canonicalUrl || iframeSrc.value?.split('?')[0] || '')
const seoRobots = computed(() => {
  const r = effectiveSeo.value?.robots
  return r ? `${r.index ? 'index' : 'noindex'},${r.follow ? 'follow' : 'nofollow'}` : 'index,follow (default)'
})
// Heuristic length limits search engines typically truncate at.
const seoWarnings = computed(() => {
  const out: string[] = []
  const stored = page.value?.seo
  if (!effectiveSeo.value?.metaTitle) {
    out.push(hasSeoTokens(stored?.metaTitle) ? 'Meta title uses a {field} that resolved empty (no record found, or the field is empty): falling back to the page title.' : 'No meta title: falling back to the page title.')
  } else if (seoTitle.value.length > 60) out.push(`Meta title is ${seoTitle.value.length} chars (~60 max).`)
  if (!seoDescription.value) {
    out.push(hasSeoTokens(stored?.metaDescription) ? 'Meta description uses a {field} that resolved empty (no record found, or the field is empty).' : 'No meta description.')
  } else if (seoDescription.value.length > 160) out.push(`Meta description is ${seoDescription.value.length} chars (~160 max).`)
  if (effectiveSeo.value?.robots && !effectiveSeo.value.robots.index) out.push('Page is set to noindex.')
  if (!effectiveSeo.value?.ogImage) out.push(hasSeoTokens(stored?.ogImage) ? 'Open Graph image uses a {field} that resolved empty.' : 'No Open Graph image.')
  return out
})

onMounted(() => window.addEventListener('message', onSeoMessage))
onUnmounted(() => window.removeEventListener('message', onSeoMessage))

onMounted(async () => {
  try {
    page.value = await pagesStore.getPage(props.pageId)
  } catch {
    // ignore
  }
})
</script>
