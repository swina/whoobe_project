<template>
  <div v-if="loading" class="p-8 text-center text-gray-400 text-sm">Loading…</div>
  <div v-else-if="error">
    <template v-if="notFoundLayout">
      <header v-if="notFoundLayout.header" :class="notFoundLayout.header.className" :style="notFoundLayout.header.style" v-bind="slotAlpine(notFoundLayout.header)">
        <BlockContainerPreview v-for="m in notFoundLayout.header?.pages ?? []" :key="m.id" :doc="m.content" />
      </header>
      <main :class="notFoundLayout.main?.className ?? ''" :style="notFoundLayout.main?.style ?? ''" v-bind="slotAlpine(notFoundLayout.main)">
        <BlockContainerPreview v-for="m in notFoundLayout.notFoundPages ?? []" :key="m.id" :doc="m.content" />
      </main>
      <footer v-if="notFoundLayout.footer" :class="notFoundLayout.footer.className" :style="notFoundLayout.footer.style" v-bind="slotAlpine(notFoundLayout.footer)">
        <BlockContainerPreview v-for="m in notFoundLayout.footer?.pages ?? []" :key="m.id" :doc="m.content" />
      </footer>
    </template>
    <div v-else class="p-8 text-center text-gray-400 text-sm">Page not found</div>
  </div>
  <template v-else-if="doc">
    <!-- Website-template shell (website-templates.md): the routed page is the
         body, wrapped by the template's header/aside/footer module pages. -->
    <div v-if="layout" :class="['whoobe-page', layout.body?.className]" :style="layout.body?.style ?? ''" v-bind="slotAlpine(layout.body)">
      <header v-if="layout.header" :class="layout.header.className" :style="layout.header.style" v-bind="slotAlpine(layout.header)">
        <BlockContainerPreview v-for="m in layout.header.pages" :key="m.id" :doc="m.content" />
      </header>
      <aside v-if="layout.aside" :class="layout.aside.className" :style="layout.aside.style" v-bind="slotAlpine(layout.aside)">
        <BlockContainerPreview v-for="m in layout.aside.pages" :key="m.id" :doc="m.content" />
      </aside>
      <main :class="layout.main?.className ?? ''" :style="layout.main?.style ?? ''" v-bind="slotAlpine(layout.main)">
        <BlockContainerPreview :doc="doc" />
      </main>
      <footer v-if="layout.footer" :class="layout.footer.className" :style="layout.footer.style" v-bind="slotAlpine(layout.footer)">
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
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { getPublicPage, getPublicPageByPath, type PublicPageLookup, type WhoobeOnePage } from '../pages-api'
import { resolveDocumentData } from '../scripts/data-resolver'
import BlockContainerPreview from '../components/preview/BlockContainerPreview.vue'
import { useThemeStyles } from '../composables/useThemeStyles'
import { useEditorStore } from '../store/editor'
import { installPreviewLinkPrefix } from '../preview-links'
import { fetchTheme } from '../themes-api'
import { safeAlpineValue } from '../helpers'
import { applyPageSeo } from '../scripts/apply-seo'
import { pickSeoBinding, resolveSeoTemplates } from '@whoobe-cms/core'
import { parentTargetOrigin } from '../scripts/parent-origin'

const route = useRoute()
const editor = useEditorStore()
const loading = ref(true)
const error = ref(false)
const doc = ref<any>(null)
const layout = ref<any>(null)
const notFoundLayout = ref<any>(null)

/** Extract Alpine.js directives from a slot object for v-bind on wrappers.
 *  Coerces non-string values to empty string to avoid `[object Object]`,
 *  and applies safeAlpineValue() on string values so bare identifiers like
 *  `appMenu` get quoted rather than causing ReferenceErrors. */
function slotAlpine(slot: { alpine?: Record<string, string> } | null | undefined): Record<string, string> {
  const src = slot?.alpine
  if (!src) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(src)) {
    out[k] = typeof v === 'string' ? safeAlpineValue(v, k) : ''
  }
  return out
}

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

      // Fetch website to get its global themeId link (has styles/tailwindClasses)
      let globalStyles = ''
      let globalTwClasses = ''
      try {
        const siteRes = await fetch(`${baseUrl}/whoobe-one/websites/${page.websiteId}`, { credentials: 'include' })
        if (siteRes.ok) {
          const siteBody = await siteRes.json()
          const siteThemeId: string | null = siteBody.website?.themeId ?? null
          if (siteThemeId) {
            const gt = await fetchTheme(siteThemeId)
            if (gt) {
              globalStyles = gt.styles ?? ''
              globalTwClasses = gt.tailwindClasses ?? ''
            }
          }
        }
      } catch {
        // Silent.
      }

      const res = await fetch(`${baseUrl}/whoobe-one/websites/${page.websiteId}/themes`, { credentials: 'include' })
      if (res.ok) {
        const body = await res.json()
        const webThemes = body.themes ?? []
        const defaultId = body.defaultThemeId ?? ''
        const defaultTheme = webThemes.find((t: any) => t.id === defaultId) ?? webThemes[0]
        if (defaultTheme) {
          editor.setWebsiteTheme({
            colors: defaultTheme.colors ?? [],
            fonts: defaultTheme.fonts ?? [],
            styles: globalStyles || (defaultTheme.styles ?? ''),
            tailwindClasses: globalTwClasses || (defaultTheme.tailwindClasses ?? '')
          })
          return
        }
      }

      // No website themes found, but we have a linked global theme — apply it as standalone
      if (globalStyles || globalTwClasses) {
        editor.setWebsiteTheme({ colors: [], fonts: [], styles: globalStyles, tailwindClasses: globalTwClasses })
      }
    } catch {
      // Silent.
    }
  }
}

async function fetchStripHtmlComments() {
  try {
    const baseUrl = (await import('../core-api-url')).getDefaultCoreApiUrl()
    const res = await fetch(`${baseUrl}/whoobe-one/settings/strip-html-comments`)
    if (res.ok) {
      const body = await res.json()
      editor.setStripHtmlComments(!!body.enabled)
    }
  } catch {
    // Non-critical — falls back to leaving comments in place.
  }
}

// Applies the page's SEO to <head>. A dynamic page's meta fields may contain
// `{field}` tokens; they're filled from the page's SEO data source - the
// binding it picked, else its first single-record binding - using the record
// the preview already resolved (so drafts show too, unlike the public API).
// An image/asset token (e.g. an OG image) can only be turned into a URL
// server-side, so that one field falls back to the server's resolved copy.
// The result is also posted to the embedding admin-dashboard (Page > Preview's
// SEO panel), which can't read this iframe's <head>.
function applyDynamicSeo(page: WhoobeOnePage, params: Record<string, string>, serverSeo: PublicPageLookup['seoResolved']) {
  const picked = pickSeoBinding(page.content, page.seo?.sourceBindingId)
  const resolved = picked ? editor.resolvedData[picked.nodeId] : null
  const record = Array.isArray(resolved) ? resolved[0] : resolved
  const seo = resolveSeoTemplates(page.seo, { record: record as any, urlParams: params })
  if (seo && serverSeo?.ogImage && !seo.ogImage) seo.ogImage = serverSeo.ogImage
  applyPageSeo({ title: page.title, seo })
  if (window.parent !== window) {
    try {
      window.parent.postMessage({ type: 'whoobe-one:seo-resolved', pageId: page.id, seo, title: page.title }, parentTargetOrigin())
    } catch {
      // Cross-origin posting is best-effort.
    }
  }
}

// The links of the page are the site's own absolute paths: keep them inside the editor where it is mounted under a
// base path (see preview-links.ts).
let removeLinkPrefix = () => {}
onBeforeUnmount(() => removeLinkPrefix())

onMounted(async () => {
  removeLinkPrefix = installPreviewLinkPrefix(import.meta.env.BASE_URL)
  fetchStripHtmlComments()
  try {
    const queryLocale = typeof route.query.locale === 'string' && route.query.locale ? route.query.locale : ''

    let page: WhoobeOnePage
    let params: Record<string, string>
    let pageLayout: PublicPageLookup['layout']
    let serverSeo: PublicPageLookup['seoResolved'] = null

    if (queryLocale) {
      // Legacy: locale as ?locale= query param (childHref, FloatingToolbar,
      // PagePreviewTab). Full route path (possibly with rootPath prefix) is
      // sent as-is; the server strips rootPath via ?rootPath=.
      const rootPath = typeof route.query.rootPath === 'string' ? route.query.rootPath : undefined
      const result = await getPublicPage(queryLocale, route.path, rootPath, true)
      page = result.page
      params = result.params
      pageLayout = result.layout ?? null
      serverSeo = result.seoResolved ?? null
    } else {
      // Clean SEO-friendly URL: /{rootPath}/{slug} with no query params.
      // Server auto-detects rootPath from the first path segment.
      const result = await getPublicPageByPath(route.path, true)
      page = result.page
      params = result.params
      pageLayout = result.layout ?? null
      serverSeo = result.seoResolved ?? null
    }

    const locale = page.locale || 'en'
    doc.value = page.content
    layout.value = pageLayout ?? null
    // Load the page's theme before resolving data, so theme styles are
    // available for the rendered content.
    await loadPageTheme(page)
    await resolveDocumentData(doc.value, locale, params)
    applyDynamicSeo(page, params, serverSeo)
    for (const slot of [pageLayout?.header, pageLayout?.aside, pageLayout?.main, pageLayout?.footer, pageLayout?.notFound404]) {
      for (const m of slot?.pages ?? []) {
        try {
          await resolveDocumentData(m.content as any, locale, params, false)
        } catch (e) {
          console.warn('[PublicPage] failed to resolve a layout module:', e)
        }
      }
    }
  } catch {
    // On 404, try to load the website's 404 slot via the public API
    try {
      const baseUrl = (await import('../core-api-url')).getDefaultCoreApiUrl()
      const segs = route.path.split('/').filter(Boolean)
      if (segs.length >= 1) {
        // Resolve website by rootPath via the same public page path logic
        const siteRes = await fetch(`${baseUrl}/whoobe-one/websites?rootPath=/${segs[0]}`, { credentials: 'include' })
        if (siteRes.ok) {
          const sites = await siteRes.json()
          const wsId = Array.isArray(sites) ? sites[0]?.id : (sites as any)?.website?.id
          if (wsId) {
            const nfRes = await fetch(`${baseUrl}/public/404/${wsId}`, { credentials: 'include' })
            if (nfRes.ok) {
              const nfBody = await nfRes.json()
              if (nfBody.notFound) {
                // Fetch the website's default template to get the full layout shell
                const tplRes = await fetch(`${baseUrl}/whoobe-one/websites/${wsId}/templates`, { credentials: 'include' })
                if (tplRes.ok) {
                  const tplBody = await tplRes.json()
                  const tpls: any[] = tplBody.templates ?? []
                  const defaultTpl = tpls.find((t: any) => t.isDefault) ?? tpls[0]
                  notFoundLayout.value = {
                    header: defaultTpl?.layout?.header
                      ? { className: defaultTpl.layout.header.className ?? '', style: defaultTpl.layout.header.style ?? '', pages: [] }
                      : null,
                    main: { className: nfBody.notFound.className ?? '', style: nfBody.notFound.style ?? '' },
                    footer: defaultTpl?.layout?.footer
                      ? { className: defaultTpl.layout.footer.className ?? '', style: defaultTpl.layout.footer.style ?? '', pages: [] }
                      : null,
                    notFoundPages: nfBody.notFound.pages ?? [],
                  }
                } else {
                  notFoundLayout.value = {
                    header: null,
                    main: { className: nfBody.notFound.className ?? '', style: nfBody.notFound.style ?? '' },
                    footer: null,
                    notFoundPages: nfBody.notFound.pages ?? [],
                  }
                }
              }
            }
          }
        }
      }
    } catch {
      // Silent
    }
    error.value = true
  } finally {
    loading.value = false
  }
})
</script>
