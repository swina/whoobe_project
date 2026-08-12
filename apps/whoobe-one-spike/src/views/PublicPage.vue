<template>
  <div v-if="loading" class="p-8 text-center text-gray-400 text-sm">Loading…</div>
  <div v-else-if="error" class="p-8 text-center text-gray-400 text-sm">Page not found</div>
  <BlockContainerPreview v-else-if="doc" :doc="doc" />
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
// No new Pinia/editor-store coupling needed beyond resolveDocumentData's
// own resolvedData bookkeeping: opened via target="_blank", so this is
// always a genuinely fresh tab/app instance regardless, never sharing
// state with an already-open editor tab.
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getPublicPage } from '../pages-api'
import { resolveDocumentData } from '../scripts/data-resolver'
import BlockContainerPreview from '../components/preview/BlockContainerPreview.vue'

const route = useRoute()
const loading = ref(true)
const error = ref(false)
const doc = ref<any>(null)

onMounted(async () => {
  try {
    // ?locale= is set by childHref() from the target page's own real,
    // already-known locale - not guessed from the path (see that
    // function's own comment on why guessing isn't reliable here).
    // Defaults to 'en' for a link typed/pasted by hand with no query string.
    const locale = typeof route.query.locale === 'string' ? route.query.locale : 'it'
    const { page, params } = await getPublicPage(locale, route.path)
    // Same "use the raw JSON content directly, no class-instance
    // reconstruction" precedent as database-actions.ts's loadPage().
    doc.value = page.content
    await resolveDocumentData(doc.value, locale, params)
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
})
</script>
