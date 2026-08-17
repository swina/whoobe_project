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
import { getPublicPage } from '../pages-api'
import { resolveDocumentData } from '../scripts/data-resolver'
import BlockContainerPreview from '../components/preview/BlockContainerPreview.vue'
import { useThemeStyles } from '../composables/useThemeStyles'

const route = useRoute()
const loading = ref(true)
const error = ref(false)
const doc = ref<any>(null)
const layout = ref<any>(null)

useThemeStyles(() => doc.value)

onMounted(async () => {
  try {
    // ?locale= is set by childHref() from the target page's own real,
    // already-known locale - not guessed from the path (see that function's
    // own comment on why guessing isn't reliable there). When absent, the
    // locale is derived from the path's first segment (pages are stored with
    // the locale prefix, e.g. /it/magazine/), falling back to 'it'.
    const queryLocale = typeof route.query.locale === 'string' && route.query.locale ? route.query.locale : ''
    const locale = queryLocale || route.path.split('/')[1] || 'it'
    const { page, params, layout: pageLayout } = await getPublicPage(locale, route.path)
    // Same "use the raw JSON content directly, no class-instance
    // reconstruction" precedent as database-actions.ts's loadPage().
    doc.value = page.content
    layout.value = pageLayout ?? null
    await resolveDocumentData(doc.value, locale, params)
    // Resolve module trees too, so their data bindings render - with
    // reset=false so each module MERGES into the same resolvedData map
    // instead of wiping the body's bindings (see data-resolver.ts). A
    // broken module must never turn the page into a 404 - resolve
    // defensively.
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
