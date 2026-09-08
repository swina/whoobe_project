// Persistence layer for this app's own editor data - Templates and Kits.
//
// Used to be entirely local: Dexie/IndexedDB via DatabaseClass.js (ported
// verbatim in Phase 0, first actually exercised in Phase 2). Moved to the
// real backend (apps/core-api + Postgres, same database everything else in
// this monorepo already uses) instead - this editor's data needs to live
// there ahead of being integrated for real, not sit in the browser's own
// local storage where nothing else can reach it. DatabaseClass.js itself
// is left in place, genuinely unused now - the same "ported but dormant"
// situation BlocksClass.js/DatabaseClass.js were both already in from
// Phase 0 through Phase 2, just in reverse this time (dormant *after*
// being used, not before).
//
// "Template" was the user-facing name for what this app's UI called a
// "page" before that - a whole document built by putting saved snippets (a
// subset of elements) together - see SaveSnippetModal.vue's own header
// comment for the snippet half of that distinction.
//
// As of the CMS integration plan (docs/plans/cms/whoobe-one-editor-
// integration-plan.md §4/Phase 1), the functions below (savePage/listPages/
// loadPage/getTemplateGallery/saveAsNewTemplate/deleteSavedPage) talk to
// the new real page store (pages-api.ts, whoobe_pages) instead of the old
// templates-api.ts/whoobe_one_templates - "Template" stopped being the
// right word once this is the CMS's actual, publishable page content, not
// a reusable starting-point document. whoobe_one_templates itself is left
// in place, untouched, unaffected - a real, separate, unmigrated table
// (Phase 0's own decision), just no longer what this file's own functions
// read/write. `editor.page` (a `Block` instance) keeps its existing
// `name`/`category`/`path` fields exactly as before - this is a data-layer
// swap only (Phase 1's own scope), not a UI/editor-model change, so
// `path` maps onto the new schema's `slug` field at the API boundary
// here, rather than renaming anything BlockEditor.vue itself touches.
// `editor.page.description` is no longer sent at all - the new schema has
// no equivalent field (superseded by `seo.metaDescription`, a more
// purpose-built "describe this page" concept - see pages-api.ts), and
// nothing in this app's own UI ever prompts for or displays it today, so
// this drops a field that was already inert in practice, not a visible
// regression.
import Block from './BlocksClass.js'
import Element from './ElementsClass.js'
import type { useEditorStore } from '../store/editor'
import { randomID, clean } from '../helpers'
import { cloneWithFreshIds } from './editor-actions'
import {
  listPages as apiListPages,
  getPage as apiGetPage,
  createPage as apiCreatePage,
  updatePage as apiUpdatePage,
  deletePage as apiDeletePage,
} from '../pages-api'
import {
  getMailTemplate as apiGetMailTemplate,
  createMailTemplate as apiCreateMailTemplate,
  updateMailTemplate as apiUpdateMailTemplate,
} from '../mail-templates-api'
import {
  getSnippet as apiGetSnippet,
  createSnippet as apiCreateSnippet,
  updateSnippet as apiUpdateSnippet,
} from '../snippets-api'
import { getDefaultCoreApiUrl } from '../core-api-url'
import {
  listKits as apiListKits,
  getKit as apiGetKit,
  createKit as apiCreateKit,
  addTemplateToKit as apiAddTemplateToKit,
  deleteKit as apiDeleteKit,
} from '../kits-api'

type EditorStore = ReturnType<typeof useEditorStore>

/**
 * Fetches all themes from all websites — used by snippet editors that don't
 * belong to a specific website. Sets the first found theme as active.
 */
export async function loadAllThemes(editor: EditorStore): Promise<void> {
  try {
    const baseUrl = getDefaultCoreApiUrl()
    const res = await fetch(`${baseUrl}/whoobe-one/themes/all`, { credentials: 'include' })
    if (!res.ok) return
    const body = await res.json()
    const websites = body.websites ?? []
    const allThemes: { id: string; name: string; colors: { name: string; hex: string }[]; fonts: string[]; styles: string; tailwindClasses: string }[] = []
    for (const site of websites) {
      for (const t of site.themes ?? []) {
        allThemes.push({ id: `${site.websiteId}:${t.id}`, name: `${t.name} (${site.websiteName})`, colors: t.colors ?? [], fonts: t.fonts ?? [], styles: t.styles ?? '', tailwindClasses: t.tailwindClasses ?? '' })
      }
    }
    editor.setWebsiteThemes(allThemes)
    if (allThemes.length > 0) {
      editor.setWebsiteTheme({ colors: allThemes[0].colors ?? [], fonts: allThemes[0].fonts ?? [], styles: allThemes[0].styles ?? '', tailwindClasses: allThemes[0].tailwindClasses ?? '' })
    }
  } catch {
    // Silent.
  }
}

/**
 * Fetches the website themes from the backend (stored in websites.settings.themes)
 * and sets them in the editor store. The default theme is set as the active
 * websiteTheme, and all themes are available for the user to pick from.
 */
export async function loadWebsiteTheme(editor: EditorStore, websiteId: string): Promise<void> {
  try {
    const baseUrl = getDefaultCoreApiUrl()
    const res = await fetch(`${baseUrl}/whoobe-one/websites/${websiteId}/themes`, { credentials: 'include' })
    if (!res.ok) return
    const body = await res.json()
    const themes = body.themes ?? []
    const defaultId = body.defaultThemeId ?? ''
    editor.setWebsiteThemes(themes.map((t: any) => ({ id: t.id, name: t.name, colors: t.colors ?? [], fonts: t.fonts ?? [], styles: t.styles ?? '', tailwindClasses: t.tailwindClasses ?? '' })))
    const defaultTheme = themes.find((t: any) => t.id === defaultId) ?? themes[0]
    if (defaultTheme) {
      editor.setWebsiteTheme({ colors: defaultTheme.colors ?? [], fonts: defaultTheme.fonts ?? [], styles: defaultTheme.styles ?? '', tailwindClasses: defaultTheme.tailwindClasses ?? '' })
    }
  } catch {
    // Silent — website theme is optional; the editor works fine without it.
  }
}
type WhoobeElement = InstanceType<typeof Element>

export interface SavedTemplateSummary {
  id: string
  name: string
  category: string
  path: string
}

/** Saves the current document as a template. `path` is required only the
 * first time a document is saved (when it has no `id` yet, i.e. it's
 * genuinely new) - the caller (BlockEditor.vue's onSave()) is responsible
 * for actually asking the user for one; an already-saved template keeps
 * whatever path it was given originally (changing it later isn't in scope
 * here). Snapshots editor.document to plain JSON before sending - it's a
 * live Vue reactive Proxy, not something that should ever be serialized
 * directly (the exact DataCloneError this app already hit once for the
 * old Dexie-backed version of this same function, back when it stored
 * editor.page - a class instance with prototype methods - directly). */
export async function savePage(editor: EditorStore, path?: string): Promise<void> {
  if (!editor.page || !editor.document) return
  editor.page.json.blocks = editor.document
  const content = JSON.parse(JSON.stringify(editor.document))

  if (!editor.page.id) {
    const created = await apiCreatePage({
      title: editor.page.name || 'Untitled',
      category: editor.page.category || '',
      slug: path || '',
      content,
      themeId: editor.pageThemeId ?? null,
    })
    editor.page.id = created.id
    ;(editor.page as any).path = created.slug
  } else {
    await apiUpdatePage(String(editor.page.id), {
      title: editor.page.name || 'Untitled',
      category: editor.page.category || '',
      content,
      themeId: editor.pageThemeId ?? null,
    })
  }
}

/** Changes an already-saved page's own slug/path - the gap savePage()'s
 *  own comment above describes as "not in scope here" (its update branch
 *  never sends `slug` at all). Needed for docs/plans/website/website-
 *  paths.md's own "dynamic paths can be updated by the user" requirement
 *  to hold for pages that already exist, not just brand-new ones. */
export async function updatePageSlug(editor: EditorStore, newSlug: string): Promise<void> {
  if (!editor.page?.id) return
  const updated = await apiUpdatePage(String(editor.page.id), { slug: newSlug })
  ;(editor.page as any).path = updated.slug
}

export async function listPages(): Promise<SavedTemplateSummary[]> {
  const pages = await apiListPages()
  return pages.map((p) => ({ id: p.id, name: p.title, category: p.category, path: p.slug }))
}

export interface TemplateGalleryItem {
  id: string
  name: string
  category: string
  path: string
  node: any
}

/** For TemplateGalleryModal.vue - unlike listPages() above (name/category/
 * path only, for the old compact dropdown), the gallery needs every saved
 * page's actual content tree up front to render a live thumbnail for each
 * one. Still a single network call, not one-per-page: GET /whoobe-one/
 * pages selects every column (same pattern getWhoobeOneTemplate's own
 * unnarrowed `db.select().from(...)` already established), so `content`
 * is already sitting right there in the same response listPages() itself
 * just throws away. Same pattern as getKitWithTemplates(). */
export async function getTemplateGallery(): Promise<TemplateGalleryItem[]> {
  const pages = await apiListPages()
  return pages.map((p) => ({ id: p.id, name: p.title, category: p.category, path: p.slug, node: p.content }))
}

export async function loadPage(editor: EditorStore, id: string): Promise<void> {
  const saved = await apiGetPage(id)

  const page = new Block()
  page.id = saved.id as any
  page.name = saved.title
  page.category = saved.category
  ;(page as any).path = saved.slug
  page.json.blocks = saved.content

  editor.setPage(page)
  editor.setDocument(saved.content as any)
  editor.setCurrent(null)
  editor.setPageThemeId(saved.themeId)
  editor.setWebsiteId(saved.websiteId)
  editor.setLocale((saved as any).locale || 'en')

  if (saved.websiteId) {
    await loadWebsiteTheme(editor, saved.websiteId)
  }
}

/** Loads an HTML mail template into the editor (docs/plans/forms/mail-
 *  templates.md) - the same shape as loadPage() above, but the content
 *  comes from a mail_templates row's `content` Element tree instead of a
 *  whoobe_pages row. The editor store's `mailTemplateId` is set so the
 *  editor's Save writes back to the template, not a page. A brand-new
 *  template has null content - an empty document root is seeded so the
 *  canvas is usable immediately (drag-to-add works and Save persists). */
export async function loadMailTemplate(editor: EditorStore, id: string): Promise<void> {
  const saved = await apiGetMailTemplate(id)
  // saved.content is untyped jsonb in the API client - the editor only ever
  // opens `html` templates, so it's an Element tree when present.
  const doc = (saved.content as WhoobeElement | null) ?? createEmptyMailTemplateRoot()

  const page = new Block()
  page.id = saved.id as any
  page.name = saved.name
  page.category = saved.kind
  page.json.blocks = doc

  editor.setPage(page)
  editor.setDocument(doc)
  editor.setCurrent(null)
  editor.setMailTemplateId(id)
}

/** An empty, immediately-usable document root for a mail template with no
 *  content yet - mirrors the onNew()/demo-seed roots elsewhere in this app
 *  (a col flexbox tagged `document` with the standard minimum height). */
export function createEmptyMailTemplateRoot(): WhoobeElement {
  const root = new Element().Flexbox({ direction: 'col' }).setIcon('dashboard').setTag('document')
  root.css.container = clean((root.css.container || '') + ' gap-4 min-h-[600px] bg-white')
  return root
}

/** A clean empty document root (a col flexbox tagged `document`) with no
 *  baked-in layout classes - used for new snippets/pages. The canvas
 *  min-height is editor-only (.whoobe-canvas-root), never part of content. */
export function createEmptyDocumentRoot(): WhoobeElement {
  const root = new Element().Flexbox({ direction: 'col' }).setIcon('dashboard').setTag('document')
  root.css.container = clean(root.css.container)
  return root
}

/** Saves the current document as the `html` body of an HTML mail template -
 *  create on first save (no id yet), overwrite in place after that. Mirrors
 *  savePage() but writes to mail_templates and never asks for a path (mail
 *  templates have no slug/URL). If the document is somehow null (it isn't
 *  after loadMailTemplate, which seeds an empty root) an empty root is
 *  seeded so the save always has something to persist. */
export async function saveMailTemplate(editor: EditorStore): Promise<void> {
  if (!editor.page) return
  if (!editor.document) {
    const root = createEmptyMailTemplateRoot()
    editor.setDocument(root)
    editor.page.json.blocks = root
  }
  editor.page.json.blocks = editor.document
  const content = JSON.parse(JSON.stringify(editor.document))

  if (!editor.page.id) {
    const created = await apiCreateMailTemplate({
      name: editor.page.name || 'Untitled',
      kind: 'html',
      content,
    })
    editor.page.id = created.id
    editor.setMailTemplateId(created.id)
  } else {
    await apiUpdateMailTemplate(String(editor.page.id), {
      name: editor.page.name || 'Untitled',
      content,
    })
  }
}

export async function deleteSavedPage(id: string): Promise<void> {
  await apiDeletePage(id)
}

/** Loads a whoobe_one_snippets subtree into the editor (admin-dashboard's
 *  Snippets main item). `editor.page` holds the snippet's id/name/category,
 *  and the store's snippet mode is set so Save writes back to the snippet.
 *
 *  The snippet's stored `node` is a reusable Element *subtree* (a container
 *  without a `document` tag). The editor canvas expects a document-tagged
 *  root (it renders the `.whoobe-canvas-root` floor and treats the root as
 *  the drop target / dragula container at the top level), so the snippet is
 *  opened inside a wrapping document root: the stored node becomes the
 *  document's single child. `saveSnippet()` unwraps on the way out, so the
 *  stored snippet stays a clean subtree rather than accumulating a
 *  document-wrapper layer on every edit. */
export async function loadSnippet(editor: EditorStore, id: string): Promise<void> {
  const saved = await apiGetSnippet(id)

  // The document shell the editor canvas needs; snippet content becomes
  // its single child (or, if a stored node is missing/empty, an empty
  // document root so snippet mode is still usable).
  const root = createEmptyDocumentRoot()
  if (saved.node && typeof saved.node === 'object') {
    root.blocks = [saved.node as WhoobeElement]
  }

  const page = new Block()
  page.id = saved.id as any
  page.name = saved.name
  page.category = saved.category
  page.json.blocks = root

  editor.setPage(page)
  editor.setDocument(root)
  editor.setCurrent(null)
  editor.setSnippetId(id)
}

/** Saves the current document as a whoobe_one_snippets subtree - create on
 *  first save (no id yet), overwrite in place after that. Mirrors
 *  saveMailTemplate() but for snippets; never asks for a name/path (the
 *  snippet's name comes from editor.page, set on creation).
 *
 *  Unwraps the document root that loadSnippet() wraps the snippet in: the
 *  stored snippet `node` is the document's single child, not the document
 *  wrapper itself, so re-saving never accumulates a `document` tag on the
 *  snippet subtree. If the user arranged multiple top-level blocks while
 *  editing, those become a single container subtree holding them all. */
export async function saveSnippet(editor: EditorStore): Promise<void> {
  if (!editor.page || !editor.document) return
  editor.page.json.blocks = editor.document
  const doc = editor.document as any
  let node: unknown = doc

  if (doc && typeof doc === 'object' && doc.tag === 'document') {
    const children = Array.isArray(doc.blocks) ? doc.blocks : []
    if (children.length === 1) {
      node = children[0]
    } else if (children.length > 1) {
      const wrapper = new Element().Flexbox({ direction: 'col' })
      wrapper.css.css = clean(wrapper.css.css)
      wrapper.blocks = children
      node = wrapper
    } else {
      node = new Element().Flexbox({ direction: 'col' })
    }
  }

  const storedNode = JSON.parse(JSON.stringify(node))

  if (!editor.page.id) {
    const created = await apiCreateSnippet({
      name: editor.page.name || 'Untitled',
      category: editor.page.category || '',
      node: storedNode,
    })
    editor.page.id = created.id
    editor.setSnippetId(created.id)
  } else {
    await apiUpdateSnippet(String(editor.page.id), {
      name: editor.page.name || 'Untitled',
      category: editor.page.category || '',
      node: storedNode,
    })
  }

  // Notify the embedding admin-dashboard that a snippet was saved, so it
  // can refresh its snippet list.
  notifyParentSnippetSaved()
}

/** Posts a 'whoobe-one:snippet-saved' message to the parent window (the
 *  admin-dashboard that embeds this editor), so the dashboard can refresh
 *  its snippet list. Only fires when running inside an iframe (parentOrigin
 *  is set by ?parentOrigin= in Editor.vue). */
function notifyParentSnippetSaved() {
  if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
    try {
      window.parent.postMessage({ type: 'whoobe-one:snippet-saved' }, '*')
    } catch {
      // Silently ignore cross-origin posting errors.
    }
  }
}

/** "Save As" - always creates a brand new template, regardless of whether
 * the current document already has one. Real, reported gap: `savePage()`
 * above only ever has two modes baked into one function - create (no id
 * yet) or overwrite-in-place (already has one) - with no way to take an
 * already-saved template and branch off a distinct copy of it instead.
 * `name`/`path` come from the caller (BlockEditor.vue's onSaveAs(), via
 * prompts) rather than reusing the current template's own - path has its
 * own unique-constraint (see savePage()'s comment), so reusing the
 * original's path here would always 409. `editor.page` itself is
 * repointed at the newly created template afterward, not left as the
 * original - "Save As" means you keep editing the new copy from here on,
 * matching what "Save As" means in every other editor, not a one-off
 * export that leaves the original document "current". */
export async function saveAsNewTemplate(editor: EditorStore, name: string, path: string): Promise<void> {
  if (!editor.document) return
  const content = JSON.parse(JSON.stringify(editor.document))

  const created = await apiCreatePage({
    title: name,
    category: editor.page?.category || '',
    slug: path,
    content,
  })

  const page = new Block()
  page.id = created.id as any
  page.name = created.title
  page.category = created.category
  ;(page as any).path = created.slug
  page.json.blocks = editor.document

  editor.setPage(page)
}

// --- Kits: named, categorized collections of templates ---
//
// whoobe-one-studio's own public/kits/*.json "UI Kit" format - the repo's
// 7 real kit files are now seeded server-side (packages/core/src/db/
// seed.ts's seedWhoobeOneKits(), vendored into packages/core/seed-data/
// kits/), not fetched from this app's own static assets and imported
// client-side the way an earlier round of this feature worked - a real
// backend seed step is the right owner for its own reference data, the
// same way it already owns seeding the default admin user/roles/
// permissions.

export interface KitSummary {
  id: string
  name: string
  description: string
  category: string
  templateCount: number
}

export async function listKits(): Promise<KitSummary[]> {
  const kits = await apiListKits()
  return kits.map((k) => ({
    id: k.id,
    name: k.name,
    description: k.description || '',
    category: k.category,
    templateCount: k.templateCount,
  }))
}

export interface KitTemplateSummary {
  id: string
  name: string
  category: string
  description: string
}

export async function getKitTemplates(kitId: string): Promise<KitTemplateSummary[]> {
  const kit = await apiGetKit(kitId)
  return kit.templates.map((t) => ({ id: t.id, name: t.name, category: t.category, description: t.description }))
}

export interface KitGalleryTemplate {
  id: string
  name: string
  category: string
  node: any
}

export interface KitGallery {
  id: string
  name: string
  category: string
  templates: KitGalleryTemplate[]
}

/** For KitGalleryModal.vue - unlike getKitTemplates() above (name/category/
 * description only, for the compact sidebar list), the gallery needs every
 * template's actual root node up front to render a live thumbnail for each
 * one, not just its metadata. */
export async function getKitWithTemplates(kitId: string): Promise<KitGallery> {
  const kit = await apiGetKit(kitId)
  return {
    id: kit.id,
    name: kit.name,
    category: kit.category,
    templates: kit.templates.map((t) => ({ id: t.id, name: t.name, category: t.category, node: t.json.blocks })),
  }
}

/** Read-only lookup for DocumentPreview.vue - previewing a kit template
 * shouldn't regenerate ids the way actually loading one does (nothing is
 * being inserted anywhere, so there's no id-collision risk to guard
 * against). */
export async function getKitTemplateDoc(kitId: string, templateId: string): Promise<any | null> {
  const kit = await apiGetKit(kitId)
  const template = kit.templates.find((t) => t.id === templateId)
  return template?.json?.blocks ?? null
}

export type LoadKitTemplateResult = 'loaded' | 'no-container-selected' | 'not-found'

/** A saved template's root is whatever node was `editor.document` at save
 * time (see `savePage()`/`addTemplateToKit()` above) - and `editor.document`
 * itself is always tagged `'document'` by convention (`views/Editor.vue`'s
 * `.setTag('document')` on its own seeded root). That's the right tag when
 * the node really is *the* document, but a template gets inserted as a new
 * *child* of whatever container the user has selected - at that point it's
 * just another nested container, and a corner tag reading "document" on a
 * node buried three levels deep is confusing/wrong, not descriptive. Unwraps
 * one level (the template's own first child becomes the inserted root)
 * whenever the root is a `'document'`-tagged node with something inside it
 * to unwrap to; left untouched if it has no children at all, since there's
 * no "next element" to fall back to in that case. */
function unwrapDocumentRoot(node: WhoobeElement): WhoobeElement {
  if ((node as any).tag === 'document' && node.blocks?.length) return node.blocks[0]
  return node
}

/** Loads one template out of a kit *into the currently selected
 * container* - the same behavior as dragging a saved snippet or a palette
 * element in, not a replacement for the whole document. Requires a
 * container to be selected first (checked before the network call, so an
 * obviously-doomed request never goes out at all) - unlike a plain
 * element, a template can be an arbitrarily large subtree, and there's no
 * sane "which container did you mean" default to fall back to the way
 * there is for a single dropped element.
 *
 * Fresh ids throughout (cloneWithFreshIds(), the same treatment dropping a
 * saved snippet already gets - the stored node must never be inserted
 * verbatim, or loading the same template twice would collide on id with
 * the first instance). Neither `editor.document` nor `editor.page` are
 * touched - this is exactly "add this template's content as a new child",
 * not "start a new document", so the document/template you were already
 * editing keeps its own name/category/path untouched. */
export async function loadKitTemplateIntoEditor(
  editor: EditorStore,
  kitId: string,
  templateId: string
): Promise<LoadKitTemplateResult> {
  const target = editor.current as any
  if (!target || target.type !== 'container') return 'no-container-selected'

  const kit = await apiGetKit(kitId)
  const template = kit.templates.find((t) => t.id === templateId)
  if (!template) return 'not-found'

  const cloned = unwrapDocumentRoot(cloneWithFreshIds(template.json.blocks))
  target.blocks.push(cloned)
  // A real, reported bug fixed here: this used to select the newly-
  // inserted node (`editor.setCurrent(cloned)`), matching how dropping a
  // snippet on the canvas selects it too - but that's safe on the canvas
  // because the *next* drop's target is wherever the user drags to next,
  // chosen fresh each time. Load's target is `editor.current` itself, so
  // reassigning it here silently redirected every *subsequent* Load onto
  // whatever was just inserted (also a container, so the guard above kept
  // passing) instead of the container the user actually selected - each
  // template ended up nested inside the previous one rather than
  // appended as a sibling, which read as "it keeps loading the same
  // template" since nothing new ever appeared where the user was looking.
  // Leaving `editor.current` untouched means it's still `target`, so
  // loading several templates back to back all land in the same place.
  return 'loaded'
}

/** "Add to a kit" - appends the current document as a new template entry,
 * either into an existing kit (by id) or a brand new one (name+category).
 * Snapshots to plain JSON first, same reasoning as savePage() above. */
export async function addTemplateToKit(
  editor: EditorStore,
  target: { kitId: string } | { newKitName: string; newKitCategory: string },
  templateMeta: { name: string; category: string; description?: string }
): Promise<void> {
  if (!editor.document) return
  const node = JSON.parse(JSON.stringify(editor.document))

  const newTemplate = {
    id: randomID('page'),
    blocks_id: randomID('component'),
    name: templateMeta.name,
    description: templateMeta.description || '',
    category: templateMeta.category,
    tags: [],
    json: { build: { purgeCSS: null, images: null, fonts: null, plugins: null }, blocks: node },
    html: null,
    image: '',
    enabled: true,
    premium: false,
    stars: 0,
    favorite: false,
  }

  if ('kitId' in target) {
    await apiAddTemplateToKit(target.kitId, newTemplate)
  } else {
    await apiCreateKit({ name: target.newKitName, category: target.newKitCategory, templates: [newTemplate] })
  }
}

export async function deleteKit(id: string): Promise<void> {
  await apiDeleteKit(id)
}
