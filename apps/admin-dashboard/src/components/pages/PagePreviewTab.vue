<template>
  <div v-if="iframeSrc" class="h-full rounded-xl overflow-hidden border border-slate-800 light:border-slate-200 bg-white">
    <iframe :src="iframeSrc" class="w-full h-full border-0"></iframe>
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
import { ref, computed, onMounted } from 'vue'
import { Eye } from '@lucide/vue'
import { usePagesStore } from '../../stores/pagesStore'
import { useTabsStore } from '../../stores/tabsStore'
import type { WhoobeOnePage } from '../../utils/pages-api'
import { getWhoobeOneSpikeUrl } from '../../utils/editor-urls'

const props = defineProps<{
  pageId: string
}>()

const pagesStore = usePagesStore()
const tabsStore = useTabsStore()
const page = ref<WhoobeOnePage | null>(null)

const currentTab = computed(() => tabsStore.tabs.find((t) => t.itemKind === 'page' && t.itemId === props.pageId))

const iframeSrc = computed(() => {
  const base = getWhoobeOneSpikeUrl()
  const tab = currentTab.value
  // Pass the page's real locale as ?locale= so PublicPage.vue doesn't
  // extract it from the path — slugs that lack a locale prefix (e.g.
  // `/whoobecms` with locale `en`) would otherwise get the wrong locale.
  if (tab?.pagePreviewPath) {
    return `${base}${tab.pagePreviewPath}`
  }
  if (page.value?.published && page.value.slug && !page.value.slug.includes('{')) {
    const slug = page.value.slug
    const locale = page.value.locale || 'en'
    return `${base}${slug}?locale=${encodeURIComponent(locale)}`
  }
  return null
})

onMounted(async () => {
  try {
    page.value = await pagesStore.getPage(props.pageId)
  } catch {
    // ignore
  }
})
</script>
