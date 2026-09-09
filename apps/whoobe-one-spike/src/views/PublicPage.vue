<template>
  <div v-if="loading" class="p-8 text-center text-gray-400 text-sm">Loading…</div>
  <div v-else-if="error" class="p-8 text-center text-gray-400 text-sm">Page not found</div>
  <template v-else-if="doc">
    <!-- Website-template shell (website-templates.md): the routed page is the
         body, wrapped by the template's header/aside/footer module pages. -->
    <div v-if="layout" class="whoobe-page">
      <header v-if="layout.header" :class="layout.header.className" :style="layout.header.style">
        <BlockContainerPreview v-for="m in layout.header.pages" :key="m.id" :doc="m.content" />
      </header>
      <aside v-if="layout.aside" :class="layout.aside.className" :style="layout.aside.style">
        <BlockContainerPreview v-for="m in layout.aside.pages" :key="m.id" :doc="m.content" />
      </aside>
      <main>
        <BlockContainerPreview :doc="doc" />
      </main>
      <footer v-if="layout.footer" :class="layout.footer.className" :style="layout.footer.style">
        <BlockContainerPreview v-for="m in layout.footer.pages" :key="m.id" :doc="m.content" />
      </footer>
    </div>
    <BlockContainerPreview v-else :doc="doc" />
  </template>
</template>

<script setup lang="ts">
// Catch-all route target (router/index.ts) - a real, resolved render of a
// stored page by its locale + full path, looked up via the public API
// (apps/core-api/src/server.ts's `GET /public/pages/:locale/*`) the same
// way a real visitor's request would be. This is what list-to-detail links
// (BlockContainerPreview.vue's childHref()) open in a new tab: without
// this, clicking one just navigated the browser to a path this app's
// router had no route for at all (a "No match found for location" Vue
// Router warning and a blank page) - see docs/plans/website/website-
// paths.md.
//
// No editor chrome (unlike DocumentPreview.vue's modal treatment) - this
// is meant to look like the actual page, not a preview-within-the-editor.
// When the page's website has a template, `layout` (returned by the public
// API) renders the header/aside/main/footer shell around the body.
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getPublicPage, getPublicPageByPath, type PublicPageLookup, type WhoobeOnePage } from '../pages-api'
import { resolveDocumentData } from '../scripts/data-resolver'
import BlockContainerPreview from '../components/preview/BlockContainerPreview.vue'
import { useThemeStyles } from '../composables/useThemeStyles'
import { useEditorStore } from '../store/editor'
import { fetchTheme } from '../themes-api'

const route = useRoute()
const editor = useEditorStore()
const loading = ref(true)
const error = ref(false)
const doc = ref<any>(null)
const layout = ref<any>(null)

useThemeStyles(() => doc.value)

async function loadPageTheme(page: { themeId?: string | null; websiteId?: string | null }) {
  // If the page has a specific theme, load it directly.
  if (page.themeId) {
    const theme = await fetchTheme(page.themeId)
    if (theme) {
      editor.setWebsiteTheme({ colors: theme.colors ?? [], fonts: theme.fonts ?? [], styles: theme.styles ?? '', tailwindClasses: theme.tailwindClasses ?? '' })
      return
    }
  }
  // Fall back to the website's default theme.
  if (page.websiteId) {
    try {
      const baseUrl = (await import('../core-api-url')).getDefaultCoreApiUrl()
      const res = await fetch(`${baseUrl}/whoobe-one/websites/${page.websiteId}/themes`, { credentials: 'include' })
      if (res.ok) {
        const body = await res.json()
        const webThemes = body.themes ?? []
        const defaultId = body.defaultThemeId ?? ''
        const defaultTheme = webThemes.find((t: any) => t.id === defaultId) ?? webThemes[0]
        if (defaultTheme) {
          editor.setWebsiteTheme({ colors: defaultTheme.colors ?? [], fonts: defaultTheme.fonts ?? [], styles: defaultTheme.styles ?? '', tailwindClasses: defaultTheme.tailwindClasses ?? '' })
        }
      }
    } catch {
      // Silent.
    }
  }
}

onMounted(async () => {
  try {
    const queryLocale = typeof route.query.locale === 'string' && route.query.locale ? route.query.locale : ''

    let page: WhoobeOnePage
    let params: Record<string, string>
    let pageLayout: PublicPageLookup['layout']

    if (queryLocale) {
      // Legacy: locale as ?locale= query param (childHref, FloatingToolbar,
      // PagePreviewTab). Full route path (possibly with rootPath prefix) is
      // sent as-is; the server strips rootPath via ?rootPath=.
      const rootPath = typeof route.query.rootPath === 'string' ? route.query.rootPath : undefined
      const result = await getPublicPage(queryLocale, route.path, rootPath)
      page = result.page
      params = result.params
      pageLayout = result.layout ?? null
    } else {
      // Clean SEO-friendly URL: /{rootPath}/{slug} with no query params.
      // Server auto-detects rootPath from the first path segment.
      const result = await getPublicPageByPath(route.path)
      page = result.page
      params = result.params
      pageLayout = result.layout ?? null
    }

    const locale = page.locale || 'en'
    doc.value = page.content
    layout.value = pageLayout ?? null
    // Load the page's theme before resolving data, so theme styles are
    // available for the rendered content.
    await loadPageTheme(page)
    await resolveDocumentData(doc.value, locale, params)
    for (const slot of [pageLayout?.header, pageLayout?.aside, pageLayout?.footer]) {
      for (const m of slot?.pages ?? []) {
        try {
          await resolveDocumentData(m.content as any, locale, params, false)
        } catch (e) {
          console.warn('[PublicPage] failed to resolve a layout module:', e)
        }
      }
    }
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
})
</script>
