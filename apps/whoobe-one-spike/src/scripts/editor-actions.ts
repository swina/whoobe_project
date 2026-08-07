// Port of the useful, real slice of whoobe-one-studio's src/scripts/
// editor.js - a Vue.prototype.$x plugin (~20 global methods). Per the port
// plan (§2 item 2), a fresh <script setup> rewrite favors plain exported
// functions over app.config.globalProperties - so this is a normal module,
// called as `duplicateCurrent(editor)` rather than `this.$duplicateBlock()`.
//
// Not ported: `$exportCustomLibrary` (needs the UI-Kit gallery/desktop
// library state - Phase 3), `$exportBuild` (the whoobe-one-vite static-site
// export pipeline - a separate companion repo, out of scope entirely),
// `$exportImage`/`$imageInfo` (minor image-download utilities, no new
// pattern beyond what's already proven here). `$block_paste`/
// `$block_duplicate` are the source's own earlier, buggy attempts
// (`$block_duplicate` references `obj` before it's ever assigned -
// `traverse(obj)` with `obj` undefined - a real bug) superseded in the same
// file by `$duplicateBlock`/`$pasteBlock`; only the working versions are
// ported.
//
// `$importBlock` was an empty, unimplemented stub in the source
// (`Vue.prototype.$importBlock = () => {}`) - implemented for real here
// instead of ported as a no-op, since it's the natural symmetric
// counterpart to `$exportBlock`/`$exportDocument`, which *are* real.
import jp from 'jsonpath'
import FileSaver from 'file-saver'
import Block from './BlocksClass.js'
import type Element from './ElementsClass.js'
import type { useEditorStore } from '../store/editor'
import { randomID, findParentAndIndex } from '../helpers'

type WhoobeElement = InstanceType<typeof Element>
type EditorStore = ReturnType<typeof useEditorStore>

/** Deep-clones a plain object graph, assigning every `id` field a fresh
 * random value - used whenever a node is duplicated or pasted, so the copy
 * never collides with the original's id (and any nested ids inside it). */
function traverse<T>(o: T): T {
  for (const key in o as any) {
    const value = (o as any)[key]
    if (value !== null && typeof value === 'object') {
      traverse(value)
    } else if (key === 'id') {
      ;(o as any)[key] = randomID()
    }
  }
  return o
}

/** Same "fresh ids throughout" clone duplicate/paste/import already rely
 * on (traverse(), above), exported for BlockEditor.vue's own drop handler:
 * dropping a saved snippet works exactly like pasting one - the stored
 * node must never be inserted verbatim, or every drop of the same snippet
 * would collide on id with every other instance of it already in the
 * document. */
export function cloneWithFreshIds<T>(node: T): T {
  return traverse(JSON.parse(JSON.stringify(node)))
}

// jp.parent (not jp.query) - query() would return a throwaway array
// containing just the matched *element itself*, not a live reference to
// the "blocks" array that actually contains it; parent() returns that
// array by reference, so splicing it below really mutates the tree.
function findParentBlocks(root: WhoobeElement, id: string): WhoobeElement[] | null {
  const parent = jp.parent(root, `$..blocks[?(@.id=="${id}")]`)
  return Array.isArray(parent) ? (parent as WhoobeElement[]) : null
}

/** Port of $duplicateBlock (the working one - $block_duplicate, the
 * source's earlier attempt in the same file, references an undefined `obj`
 * and would throw). Inserts a deep clone (fresh ids throughout) directly
 * after the original in its parent's children, then deselects. */
export function duplicateCurrent(editor: EditorStore): void {
  if (!editor.document || !editor.current) return
  const parent = findParentBlocks(editor.document, editor.current.id)
  if (!parent) return
  const index = parent.findIndex((p) => p.id === editor.current!.id)
  if (index < 0) return
  const clone = traverse(JSON.parse(JSON.stringify(editor.current)))
  parent.splice(index + 1, 0, clone)
  editor.setCurrent(null)
}

const CLIPBOARD_KEY = 'whoobe-clipboard'

/** Not a direct port - the source's hotkeys.js emits a `copyBlock` bus
 * event with no listener anywhere in the surveyed codebase (the actual
 * localStorage write $pasteBlock/$block_paste read from is never shown
 * being produced). This is the natural, obvious counterpart. */
export function copyCurrentToClipboard(editor: EditorStore): void {
  if (!editor.current) return
  window.localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(editor.current))
}

/** Port of $pasteBlock, fixed rather than ported verbatim: the source (and
 * this file's own first pass) gated on `current?.blocks` truthiness, but
 * every Element - leaf or container - gets `blocks: []` from the base
 * constructor (ElementsClass.js), so that guard was always true and pasting
 * onto a selected leaf silently pushed into a `.blocks` array nothing ever
 * renders (the same bug FloatingToolbar.vue's `isContainer` computed had to
 * fix for its own container-only actions). Real behavior now: paste into
 * the selected element if it's an actual container (`type === 'container'`,
 * the same discriminator BlockContainer.vue's own render dispatch uses);
 * otherwise insert as a sibling right after the selected element, in its
 * own parent - the same "insert after original" placement duplicateCurrent()
 * already uses. Nothing selected falls back to appending at the document
 * root, so the shortcut/menu action always does something rather than
 * silently no-op. */
export function pasteClipboardInto(editor: EditorStore): void {
  const raw = window.localStorage.getItem(CLIPBOARD_KEY)
  if (!raw || !editor.document) return
  const clone = traverse(JSON.parse(raw))

  const current = editor.current as (WhoobeElement & { type?: string }) | null
  if (current && current.type === 'container') {
    current.blocks.push(clone)
    return
  }
  if (current) {
    const found = findParentAndIndex(editor.document, current.id)
    if (found) {
      found.parent.blocks.splice(found.index + 1, 0, clone)
      return
    }
  }
  editor.document.blocks.push(clone)
}

/** Port of $exportBlock - downloads just the selected node as JSON. */
export function exportBlock(editor: EditorStore): void {
  if (!editor.current) return
  const blob = new Blob([JSON.stringify(editor.current)], { type: 'application/json' })
  FileSaver.saveAs(blob, 'whoobe-block.json')
}

function removeNestedObjectsKey(node: any, arrayKey: string, deleteKey: string): any {
  delete node[deleteKey]
  ;(node[arrayKey] ?? []).forEach((child: any) => removeNestedObjectsKey(child, arrayKey, deleteKey))
  return node
}

/** Port of $exportDocument - downloads the whole current page as JSON,
 * including purge metadata (Tailwind classes/images/fonts actually used,
 * via BlocksClass.js's purge()) needed for a purged static build. */
export function exportDocument(editor: EditorStore, confirmSave = true): void {
  if (!editor.document) return
  if (confirmSave && !window.confirm('Save Page?')) return

  const pagePurge = new Block()
  pagePurge.json.blocks = editor.document
  pagePurge.purge()

  const page = editor.page ? { ...editor.page } : new Block()
  page.json = {
    blocks: JSON.parse(JSON.stringify(editor.document)),
    build: pagePurge.json.build,
  }
  removeNestedObjectsKey(page.json.blocks, 'blocks', 'coords')
  removeNestedObjectsKey(page.json.blocks, 'blocks', 'tailwind')

  const blob = new Blob([JSON.stringify(page)], { type: 'application/json' })
  FileSaver.saveAs(blob, `${page.name || 'whoobe-document'}.json`)
}

/** Not a port - $importBlock was an empty stub in the source (see file
 * header). Reads a previously-exported document/block JSON file back in,
 * assigning fresh ids throughout the same way duplicate/paste do, so
 * re-importing a file twice never collides with itself. */
export async function importDocument(editor: EditorStore, file: File): Promise<void> {
  const text = await file.text()
  const parsed = JSON.parse(text)
  const root: WhoobeElement = parsed?.json?.blocks ?? parsed
  const withFreshIds = traverse(root)
  editor.setDocument(withFreshIds)
  editor.setCurrent(null)
}

/** Port of $beautify - a hand-rolled HTML pretty-printer (indents on open
 * tags, dedents on close tags, skips indenting after a self-closing-ish
 * "input" tag) used for the JS/HTML editors and static-page export -
 * pure string logic, no DOM/Vue coupling, ported unchanged. */
export function beautify(html = ''): string {
  if (!html) return ''
  const tab = '\t'
  let result = ''
  let indent = ''

  html.split(/>\s*</).forEach((element) => {
    if (element.match(/^\/\w/)) {
      indent = indent.substring(tab.length)
    }
    result += indent + '<' + element + '>\r\n'
    if (element.match(/^<?\w[^>]*[^/]$/) && !element.startsWith('input')) {
      indent += tab
    }
  })
  return result.substring(1, result.length - 3)
}

/** Port of $purgeCSS - collects every Tailwind class actually referenced
 * anywhere in the tree (css.css/css.container), deduped and sorted. */
export function purgeCSS(editor: EditorStore): string[] {
  if (!editor.document) return []
  const css = (jp.query(editor.document, '$..blocks..css.css') as string[]).filter(Boolean).join(',').split(' ').filter(Boolean)
  const containers = (jp.query(editor.document, '$..blocks..css.container') as string[]).filter(Boolean).join(',').split(' ').filter(Boolean)
  return [...new Set([...css, ...containers])].sort()
}
