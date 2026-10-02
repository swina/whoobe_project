// Captures a DOM element (the editor's desktop preview) as a small WebP data
// URL, to store as a page/snippet thumbnail. Pure client-side (html-to-image
// serialises the live DOM into an SVG foreignObject and rasterises it), so
// fidelity is "good, not pixel-perfect": cross-origin images without CORS
// headers, iframes and some web fonts may not render.
import { toCanvas } from 'html-to-image'
import { parentTargetOrigin } from './parent-origin'

const OUTPUT_WIDTH = 640
const ASPECT = 10 / 16 // above-the-fold crop, 16:10

// Nodes html-to-image can't clone into its SVG foreignObject (a nested
// browsing context or a live media element makes the whole raster fail to
// load): left out of the capture instead of aborting it.
const SKIP_TAGS = new Set(['IFRAME', 'VIDEO', 'AUDIO', 'CANVAS', 'SCRIPT', 'OBJECT', 'EMBED'])

// html-to-image rejects with a DOM Event (the failed <img>'s onerror), not an
// Error - turn whatever it threw into something readable.
function describeCaptureError(e: unknown): string {
  if (e instanceof Error) return e.message
  const target = (e as Event | undefined)?.target as (HTMLImageElement | undefined)
  if (target && 'src' in target) return 'could not render the preview as an image (SVG load failed)'
  return typeof e === 'string' ? e : 'unknown error'
}

// html-to-image serialises the DOM as XML inside an SVG <foreignObject>, and
// the browser refuses to load that SVG if any attribute name isn't a valid XML
// name. The builder's elements carry Alpine directives (`@click`, `:class`,
// `x-on:click`, `x-bind:...`), which are valid in HTML but not in XML - one
// such attribute anywhere in the tree makes the whole capture fail with an
// <img> load error. So capture a sanitised, offscreen clone instead.
const XML_SAFE_ATTR = /^(?:xlink:href|xml:lang|[A-Za-z_][A-Za-z0-9_.-]*)$/

function sanitizeForXml(root: HTMLElement): void {
  const nodes: Element[] = [root, ...Array.from(root.querySelectorAll('*'))]
  for (const node of nodes) {
    for (const attr of Array.from(node.attributes)) {
      if (!XML_SAFE_ATTR.test(attr.name) || attr.name.startsWith('on')) node.removeAttribute(attr.name)
    }
  }
}

// Only the top `height` px end up in the thumbnail, so drop every part of the
// clone that lies entirely below it. Walks the live element and its clone in
// parallel (identical structure) and measures the live one. Besides being much
// faster for a long snippet/page, it shrinks the XML html-to-image has to
// serialise and load as an SVG, and removes whatever sits below the fold.
function pruneBelowFold(live: Element, copy: Element, top: number, height: number): void {
  const liveKids = Array.from(live.children)
  const copyKids = Array.from(copy.children)
  for (let i = liveKids.length - 1; i >= 0; i--) {
    const rect = liveKids[i].getBoundingClientRect()
    if (rect.top - top >= height) copyKids[i]?.remove()
    else if (rect.bottom - top > height) pruneBelowFold(liveKids[i], copyKids[i], top, height)
  }
}

/** Why would this DOM not load as an SVG foreignObject? Re-parse its XML
 *  serialisation the way the browser will and return the parser's message. */
function xmlProblem(node: HTMLElement): string | null {
  try {
    const xml = new XMLSerializer().serializeToString(node)
    const doc = new DOMParser().parseFromString(xml, 'application/xhtml+xml')
    const err = doc.querySelector('parsererror')
    return err ? (err.textContent ?? 'XML parse error').replace(/\s+/g, ' ').trim().slice(0, 240) : null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

const PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

function render(node: HTMLElement, width: number, height: number): Promise<HTMLCanvasElement> {
  return toCanvas(node, {
    width,
    height,
    pixelRatio: 1,
    cacheBust: true,
    backgroundColor: '#ffffff',
    // Embedding web fonts means fetching every cross-origin stylesheet;
    // one blocked fetch used to fail the whole capture. System fallback
    // fonts in the thumbnail are an acceptable trade.
    skipFonts: true,
    filter: (n) => !(n instanceof HTMLElement && SKIP_TAGS.has(n.tagName)),
    // Shown for an image that can't be fetched (e.g. no CORS headers)
    // instead of failing the capture.
    imagePlaceholder: PLACEHOLDER,
  })
}

function describeNode(node: Element): string {
  const cls = (node.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 3).join('.')
  return `<${node.tagName.toLowerCase()}${cls ? '.' + cls : ''}>`
}

/** The whole tree failed to load as an SVG, so find the subtrees that are to
 *  blame: render each child on its own, descend into the ones that fail, and
 *  remove the leaves that still fail. Returns a description of what was cut,
 *  so a single bad element costs one block of the thumbnail rather than the
 *  whole capture. */
async function removeUnrenderable(parent: HTMLElement, removed: string[]): Promise<void> {
  for (const child of Array.from(parent.children) as HTMLElement[]) {
    const w = Math.max(1, Math.round(child.getBoundingClientRect().width))
    const h = Math.max(1, Math.min(2000, Math.round(child.getBoundingClientRect().height)))
    try {
      await render(child, w, h)
    } catch {
      if (child.children.length) await removeUnrenderable(child, removed)
      else {
        removed.push(describeNode(child))
        child.remove()
      }
    }
  }
}

export interface ThumbnailCapture {
  dataUrl: string
  /** Elements left out because the browser couldn't render them as an image. */
  skipped: string[]
}

export async function captureElementThumbnail(el: HTMLElement): Promise<ThumbnailCapture> {
  const width = Math.max(1, el.clientWidth)
  const height = Math.max(1, Math.min(el.scrollHeight, Math.round(width * ASPECT)))

  // Attached to the document (offscreen) so Tailwind's classes still resolve
  // to computed styles, which html-to-image inlines into each node.
  const clone = el.cloneNode(true) as HTMLElement
  pruneBelowFold(el, clone, el.getBoundingClientRect().top, height)
  sanitizeForXml(clone)
  const holder = document.createElement('div')
  holder.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;pointer-events:none;`
  holder.appendChild(clone)
  document.body.appendChild(holder)

  const skipped: string[] = []
  let source: HTMLCanvasElement
  try {
    try {
      source = await render(clone, width, height)
    } catch (first) {
      console.warn('[capture-thumbnail] full render failed, locating the culprit:', first, xmlProblem(clone) ?? '(XML re-parse is clean)')
      await removeUnrenderable(clone, skipped)
      if (!skipped.length) throw first
      console.warn('[capture-thumbnail] left out:', skipped)
      source = await render(clone, width, height)
    }
  } catch (e) {
    const problem = xmlProblem(clone)
    console.error('[capture-thumbnail] html-to-image failed:', e, problem ?? '(XML re-parse is clean)')
    throw new Error(`Capture failed: ${problem ?? describeCaptureError(e)}`)
  } finally {
    holder.remove()
  }

  const out = document.createElement('canvas')
  out.width = OUTPUT_WIDTH
  out.height = Math.round((OUTPUT_WIDTH * source.height) / source.width)
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, out.width, out.height)
  return { dataUrl: out.toDataURL('image/webp', 0.8), skipped }
}

/** Tells the embedding admin-dashboard (if any) to refresh its lists. */
export function notifyParentThumbnailSaved(kind: 'page' | 'snippet', id: string) {
  if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
    try {
      window.parent.postMessage({ type: 'whoobe-one:thumbnail-saved', kind, id }, parentTargetOrigin())
    } catch {
      // Ignore cross-origin posting errors.
    }
  }
}
