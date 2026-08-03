// Port of the useful, real slice of whoobe-one-studio's src/scripts/
// database.js (another Vue.prototype.$x plugin) - plain exported functions
// instead, same rationale as editor-actions.ts. `DatabaseClass.js` itself
// (the Dexie subclass) was already ported verbatim in Phase 0 and stayed
// completely dormant until now - this is what actually exercises it.
//
// Not ported: the whole-database export/import backup feature
// (`dexie-export-import`'s `exportDB`/`importDB`, the source's
// `$saveDB`/`$importDB`) and settings CRUD (`$settings`/`$saveSettings`) -
// both real, both just deferred; per-page save/load already proves Dexie
// genuinely works end-to-end (the open question this phase exists to
// answer), and neither has a UI to drive it yet (Settings.vue, the
// import/export-database controls are Phase 3 `desktop`/`common` files).
import { Database } from './DatabaseClass.js'
import type { useEditorStore } from '../store/editor'
import { randomID } from '../helpers'

type EditorStore = ReturnType<typeof useEditorStore>

let db: Database | null = null
function getDb(): Database {
  if (!db) db = new Database()
  return db
}

/** Port of $savePage. Explicitly syncs page.json.blocks to the live
 * editor.document right before persisting, rather than relying on the
 * source's implicit same-object-reference trick (page.json.blocks and
 * editor.document start out as literally the same object in
 * views/Editor.vue, but importDocument()/loadPage() below both *replace*
 * editor.document wholesale with a new object, silently breaking that
 * reference) - explicit sync here is more robust than depending on that
 * identity never being broken. */
export async function savePage(editor: EditorStore): Promise<void> {
  if (!editor.page || !editor.document) return
  editor.page.json.blocks = editor.document

  if (!editor.page.id) {
    editor.page.id = randomID('page')
    await getDb().addPage(editor.page)
  } else {
    await getDb().updatePage(editor.page.id, editor.page)
  }
}

export interface SavedPageSummary {
  id: string
  name: string
  category: string
}

export async function listPages(): Promise<SavedPageSummary[]> {
  const pages = await getDb().getPages('', 100, 0)
  return pages.map((p: any) => ({ id: p.id, name: p.name, category: p.category }))
}

export async function loadPage(editor: EditorStore, id: string): Promise<void> {
  const page = await getDb().pages.get(id)
  if (!page) return
  editor.setPage(page)
  editor.setDocument(page.json.blocks)
  editor.setCurrent(null)
}

export async function deleteSavedPage(id: string): Promise<void> {
  await getDb().deletePage(id)
}
