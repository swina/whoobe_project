<template>
  <BlockEditor />
</template>

<script setup lang="ts">
// Seeds a demo document directly (Phase 0 scope stopped short of porting
// BlockElements.vue's full "add element" sidebar palette or templates.js's
// snippet builders - see docs/plans/cms/whoobe-one-studio-vue3-port-
// plan.md §5, Phase 2/3). A hand-built nested tree here is enough to
// exercise every behavior the spike needs to prove: contenteditable text on
// two different tag types, an image, a button, and real nesting depth so
// drag-and-drop across containers is actually meaningful to test.
//
// Moved here from App.vue as part of Phase 1's router port: this is now
// the /editor route's view component (mirrors the source repo's own
// views/Editor.vue, which similarly wraps BlockEditor.vue), rather than
// something App.vue mounted unconditionally.
//
// Phase 2 addition: also creates editor.page, a Block (BlocksClass.js)
// wrapping the same document as its json.blocks - mirroring the source's
// own actions.js (createEmptyBlock()/openDefaultBlock() both set `page`
// and `document` from the same object reference). This is what
// database-actions.ts's savePage()/loadPage() persist to IndexedDB.
//
// CMS integration plan (docs/plans/cms/whoobe-one-editor-integration-
// plan.md §6, Phase 3) addition: two query params this route now
// recognizes, both read once here rather than needing a whole bridge -
// `pageId` (open that specific real page instead of seeding the demo
// document - apps/admin-dashboard's own WhoobeOneEmbed.vue is the one
// real caller so far) and `parentOrigin` (marks this as running embedded -
// see store/editor.ts's own `embedded`/`setEmbedded()` comment for what
// that actually gates).
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Element from '../scripts/ElementsClass.js'
import Block from '../scripts/BlocksClass.js'
import BlockEditor from '../components/BlockEditor.vue'
import { useEditorStore } from '../store/editor'
import { loadPage, loadMailTemplate, loadSnippet, loadWebsiteTheme, loadAllThemes, createEmptyMailTemplateRoot, createEmptyDocumentRoot } from '../scripts/database-actions'
import { clean } from '../helpers'
import { getDefaultCoreApiUrl } from '../core-api-url'
import { resolveDocumentData } from '../scripts/data-resolver'

const editor = useEditorStore()
const route = useRoute()

async function fetchDefaultPlaceholder() {
  try {
    const base = getDefaultCoreApiUrl()
    const res = await fetch(`${base}/whoobe-one/settings/default-placeholder-image`, { credentials: 'include' })
    if (res.ok) {
      const body = await res.json()
      if (body.pimcorePath) {
        const urlRes = await fetch(`${base}/api/v1/dam/asset-urls?pimcorePath=${encodeURIComponent(body.pimcorePath)}`, { credentials: 'include' })
        if (urlRes.ok) {
          const urlBody = await urlRes.json()
          if (urlBody.url) {
            editor.setDefaultPlaceholderUrl(urlBody.url)
            ;(window as any).__whoobeDefaultPlaceholder = urlBody.url
          }
        }
      }
    }
  } catch {
    // Non-critical — fall back to the hardcoded SVG placeholder.
  }
}

onMounted(async () => {
  await fetchDefaultPlaceholder()
  const parentOrigin = typeof route.query.parentOrigin === 'string' ? route.query.parentOrigin : null
  if (parentOrigin) editor.setEmbedded(true, parentOrigin)

  // Snippet editing (admin-dashboard's Snippets item): an existing snippet
  // loads its node; a brand-new one seeds an empty document in snippet mode.
  const snippetId = typeof route.query.snippetId === 'string' ? route.query.snippetId : null
  if (snippetId) {
    try {
      await loadSnippet(editor, snippetId)
    } catch (e) {
      console.warn('Failed to load snippet:', e)
      const root = createEmptyDocumentRoot()
      const page = new Block()
      page.name = 'Untitled snippet'
      page.category = ''
      page.json.blocks = root
      editor.setPage(page)
      editor.setDocument(root)
      editor.setCurrent(null)
      editor.setSnippetId(snippetId)
    }
    const wsId = typeof route.query.websiteId === 'string' ? route.query.websiteId : null
    if (wsId) {
      editor.setWebsiteId(wsId)
      await loadWebsiteTheme(editor, wsId)
    } else await loadAllThemes(editor)
    return
  }
  if (route.query.snippetNew !== undefined) {
    const root = createEmptyDocumentRoot()
    const page = new Block()
    page.name = 'Untitled snippet'
    page.category = ''
    page.json.blocks = root
    editor.setPage(page)
    editor.setDocument(root)
    resolveDocumentData(root)
    editor.setCurrent(null)
    editor.setSnippetMode(true)
    const wsId = typeof route.query.websiteId === 'string' ? route.query.websiteId : null
    if (wsId) {
      editor.setWebsiteId(wsId)
      await loadWebsiteTheme(editor, wsId)
    } else await loadAllThemes(editor)
    return
  }

  const mailTemplateId = typeof route.query.mailTemplateId === 'string' ? route.query.mailTemplateId : null
  if (mailTemplateId) {
    try {
      await loadMailTemplate(editor, mailTemplateId)
    } catch (e) {
      // A failed template fetch must never leave a dead blank iframe nor
      // silently become a whoobe_pages save - seed an empty mail-template
      // document (keeping mailTemplateId set) so the editor is usable and a
      // follow-up Save creates a fresh mail template, never a page.
      console.warn('Failed to load mail template:', e)
      const root = createEmptyMailTemplateRoot()
      const page = new Block()
      page.name = 'Untitled mail template'
      page.category = 'html'
      page.json.blocks = root
      editor.setPage(page)
      editor.setDocument(root)
      resolveDocumentData(root)
      editor.setCurrent(null)
      editor.setMailTemplateId(mailTemplateId)
    }
    return
  }

  const pageId = typeof route.query.pageId === 'string' ? route.query.pageId : null
  if (pageId) {
    try {
      await loadPage(editor, pageId)
    } catch (e) {
      console.warn('Failed to load page:', e)
    }
    return
  }

  if (editor.document) return

  const root = new Element().Flexbox({ direction: 'col' }).setIcon('dashboard').setTag('document')
  // Editor-only canvas affordance (min-height) lives in style.css's
  // .whoobe-canvas-root, not in the stored content - see onNew()'s comment.
  root.css.container = clean(root.css.container)
  
  const row = new Element().Flexbox({ direction: 'row' })
  row.css.container = clean(row.css.container + ' items-center')

  const heading = new Element().Heading(1)
  heading.content = 'Drag me, edit me'
  heading.css.css = clean('text-3xl font-bold text-gray-800')

  const paragraph = new Element().Paragraph()
  paragraph.content =
    'Click this paragraph to select it, click again (or click its text) to edit it inline - this is the real contenteditable mechanism, not a form field.'
  paragraph.css.css = clean('text-gray-600 max-w-md')

  row.blocks.push(heading, paragraph)

  const image = new Element().Image()
  image.image = { url: 'https://picsum.photos/seed/whoobe/320/180' }
  image.css.css = clean('w-80 h-auto rounded shadow')

  const button = new Element().Button()
  button.content = 'A button element'
  button.css.css = clean('px-4 py-2 bg-indigo-600 text-white rounded self-start')

  root.blocks.push(row, image, button)

  editor.setDocument(root)
  resolveDocumentData(root)

  const page = new Block()
  page.name = 'My Page'
  page.category = 'Landing page'
  page.json.blocks = root
  editor.setPage(page)
})
</script>
