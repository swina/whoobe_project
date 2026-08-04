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
// "Template" is the user-facing name for what this app's UI called a
// "page" until now - a whole document built by putting saved snippets (a
// subset of elements) together - see SaveSnippetModal.vue's own header
// comment for the snippet half of that distinction.
import Block from './BlocksClass.js'
import type Element from './ElementsClass.js'
import type { useEditorStore } from '../store/editor'
import { randomID } from '../helpers'
import { cloneWithFreshIds } from './editor-actions'
import {
  listTemplates as apiListTemplates,
  getTemplate as apiGetTemplate,
  createTemplate as apiCreateTemplate,
  updateTemplate as apiUpdateTemplate,
  deleteTemplate as apiDeleteTemplate,
} from '../templates-api'
import {
  listKits as apiListKits,
  getKit as apiGetKit,
  createKit as apiCreateKit,
  addTemplateToKit as apiAddTemplateToKit,
  deleteKit as apiDeleteKit,
} from '../kits-api'

type EditorStore = ReturnType<typeof useEditorStore>
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
  const node = JSON.parse(JSON.stringify(editor.document))

  if (!editor.page.id) {
    const created = await apiCreateTemplate({
      name: editor.page.name || 'Untitled',
      category: editor.page.category || '',
      path: path || '',
      description: editor.page.description || null,
      node,
    })
    editor.page.id = created.id
    ;(editor.page as any).path = created.path
  } else {
    await apiUpdateTemplate(String(editor.page.id), {
      name: editor.page.name || 'Untitled',
      category: editor.page.category || '',
      description: editor.page.description || null,
      node,
    })
  }
}

export async function listPages(): Promise<SavedTemplateSummary[]> {
  const templates = await apiListTemplates()
  return templates.map((t) => ({ id: t.id, name: t.name, category: t.category, path: t.path }))
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
 * template's actual root node up front to render a live thumbnail for each
 * one. Still a single network call, not one-per-template: GET /whoobe-one/
 * templates already selects every column (confirmed from its own real
 * implementation, listWhoobeOneTemplates() in packages/core - a plain
 * `db.select().from(whoobeOneTemplates)`, not a narrowed column list), so
 * `node` is already sitting right there in the same response listPages()
 * itself just throws away. Same pattern as getKitWithTemplates(). */
export async function getTemplateGallery(): Promise<TemplateGalleryItem[]> {
  const templates = await apiListTemplates()
  return templates.map((t) => ({ id: t.id, name: t.name, category: t.category, path: t.path, node: t.node }))
}

export async function loadPage(editor: EditorStore, id: string): Promise<void> {
  const template = await apiGetTemplate(id)

  const page = new Block()
  page.id = template.id as any
  page.name = template.name
  page.category = template.category
  page.description = template.description || ''
  ;(page as any).path = template.path
  page.json.blocks = template.node

  editor.setPage(page)
  editor.setDocument(template.node as any)
  editor.setCurrent(null)
}

export async function deleteSavedPage(id: string): Promise<void> {
  await apiDeleteTemplate(id)
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
  const node = JSON.parse(JSON.stringify(editor.document))

  const created = await apiCreateTemplate({
    name,
    category: editor.page?.category || '',
    path,
    description: editor.page?.description || null,
    node,
  })

  const page = new Block()
  page.id = created.id as any
  page.name = created.name
  page.category = created.category
  page.description = created.description || ''
  ;(page as any).path = created.path
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
