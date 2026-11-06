// "Export PDF" of a website page (dashboard Page > Preview): the page is opened at its own address with `?print=true`
// and PublicPage.vue renders it as a visitor sees it - the website template's header/aside/footer around the body, the
// page's theme (colours, fonts, custom CSS). Once everything is on screen this opens the browser's print dialog, where
// "Save as PDF" writes the file. No server-side browser: the PDF is the browser's own rendering of the real page.

/** Is the page opened for printing (`?print=true`)? */
export function isPrintRequest(search: string = typeof window === 'undefined' ? '' : window.location.search): boolean {
  return new URLSearchParams(search).get('print') === 'true'
}

// What the screen needs and paper does not, or prints badly:
// - backgrounds and colours of the theme are printed (browsers drop them by default);
// - a fixed or sticky template header would repeat over the content of every sheet: it prints once, in its place;
// - elements hidden until scrolled into view (reveal animations) are shown;
// - `[data-print-hidden]` (the draft badge) is not printed.
export const PRINT_CSS = `
@page { margin: 12mm; }
@media print {
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .whoobe-page > header, .whoobe-page > aside, .whoobe-page > footer { position: static !important; }
  [data-aos], .aos-init, .animate__animated { opacity: 1 !important; transform: none !important; animation: none !important; }
  img, svg, video, figure { break-inside: avoid; }
  [data-print-hidden] { display: none !important; }
}
`

function installPrintCss(doc: Document): void {
  if (doc.getElementById('whoobe-print-css')) return
  const style = doc.createElement('style')
  style.id = 'whoobe-print-css'
  style.textContent = PRINT_CSS
  doc.head.appendChild(style)
}

/** Resolves when every <img> of the document has loaded or failed (lazy images are made eager first), or after `timeoutMs`. */
export function imagesReady(doc: Document, timeoutMs: number): Promise<void> {
  const pending = Array.from(doc.images).filter((img) => {
    if (img.loading === 'lazy') img.loading = 'eager'
    return !img.complete
  })
  if (!pending.length) return Promise.resolve()
  const all = Promise.all(pending.map((img) => new Promise<void>((resolve) => {
    img.addEventListener('load', () => resolve(), { once: true })
    img.addEventListener('error', () => resolve(), { once: true })
  })))
  return Promise.race([all.then(() => undefined), new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))])
}

/** Opens the print dialog once the rendered page is complete: fonts loaded, images loaded (at most `timeoutMs`), and a
 *  short settle for the in-browser Tailwind engine to style the nodes just rendered. */
export async function printWhenReady(win: Window = window, timeoutMs = 15000): Promise<void> {
  const doc = win.document
  installPrintCss(doc)
  try { await (doc as any).fonts?.ready } catch { /* fonts are best-effort */ }
  await imagesReady(doc, timeoutMs)
  await new Promise((resolve) => setTimeout(resolve, 400))
  win.print()
}

// "Export PDF" from the editor's Preview: the document being edited, saved or not, printed inside its website's template
// and theme. The editor leaves the document in localStorage (shared by the new tab, unlike sessionStorage) under the page
// id and opens the page's own address with `print=true&editorDoc=<id>`; PublicPage.vue loads the page and its template
// as usual, then takes the document (once: it is removed when read) in place of the saved content.
const EDITOR_DOC_KEY = 'whoobe-print-doc:'
const EDITOR_DOC_MAX_AGE_MS = 10 * 60 * 1000

export function stashEditorDoc(pageId: string, doc: unknown, storage: Storage = localStorage): void {
  storage.setItem(EDITOR_DOC_KEY + pageId, JSON.stringify({ at: Date.now(), doc }))
}

/** The document the editor left for `pageId`, removed as it is read; null if none, unreadable or older than 10 minutes. */
export function takeEditorDoc(pageId: string, storage: Storage = localStorage, now = Date.now()): unknown | null {
  const key = EDITOR_DOC_KEY + pageId
  const raw = storage.getItem(key)
  if (raw === null) return null
  storage.removeItem(key)
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed?.at !== 'number' || now - parsed.at > EDITOR_DOC_MAX_AGE_MS) return null
    return parsed.doc ?? null
  } catch {
    return null
  }
}

/** Address of a page printed from the editor: `<origin><base><rootPath><path>?locale&rootPath&draft&print&editorDoc`.
 *  `path` is the page's slug, or for a dynamic page the concrete path typed in "Preview as path". Draft, so a page that
 *  is not published yet is found too (the editor's session is the one that opens it). */
export function editorPrintUrl(o: { origin: string; base: string; rootPath: string; path: string; locale: string; pageId: string }): string {
  const base = o.base.replace(/\/+$/, '')
  const rootPath = o.rootPath.replace(/\/+$/, '')
  const path = o.path.startsWith('/') ? o.path : '/' + o.path
  const q = new URLSearchParams({ locale: o.locale || 'en' })
  if (rootPath) q.set('rootPath', rootPath)
  q.set('draft', 'true')
  q.set('print', 'true')
  q.set('editorDoc', o.pageId)
  return `${o.origin}${base}${rootPath}${path}?${q.toString()}`
}
