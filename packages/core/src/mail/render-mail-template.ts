import { applyTransform, escapeHtml, type FieldTransform } from './field-transforms.js'

// Walks the same Element-tree shape apps/whoobe-one-spike/src/scripts/
// ElementsClass.js defines, duck-typed here since that class is a
// frontend-only module packages/core can't import, and emits static HTML
// for a mail body. Deliberately scoped down from the full editor render
// tree - see docs/plans/forms/cms-forms.md's Phase 2 section 3 for the
// full list of what's out of scope and why (no JS runtime in an email:
// Alpine, GSAP, sliders, iframes, nested Dynamic Query repeaters).

interface MailElementNode {
  type?: string
  tag?: string
  element?: string
  semantic?: string
  level?: number
  content?: string
  css?: { css?: string; container?: string }
  style?: string
  font?: string
  image?: { url?: string | null; alt?: string | null }
  dataBinding?: { field?: string | null; transform?: FieldTransform | null } | null
  blocks?: MailElementNode[]
}

// A static email has no JS runtime, so none of these make sense: a slider
// needs client-side cycling, embeds need an iframe, and a nested form
// inside another form's own notification email is nonsensical.
const SKIPPED_TAGS = new Set(['slider', 'youtube', 'vimeo', 'form'])

export function renderMailTemplate(pageContent: unknown, submission: Record<string, unknown>): string {
  return renderNode(pageContent as MailElementNode | null | undefined, submission)
}

function renderNode(node: MailElementNode | null | undefined, submission: Record<string, unknown>): string {
  if (!node || typeof node !== 'object') return ''
  if (node.tag && SKIPPED_TAGS.has(node.tag)) return ''
  // A binding with no `field` is a whole-object/collection binding (the
  // mechanism a Dynamic Query repeater uses) - meaningless against a single
  // flat submission object, so the whole subtree is omitted rather than
  // guessing at a stringified dump of it.
  if (node.dataBinding && !node.dataBinding.field) return ''

  if (node.type === 'container') {
    const tag = node.semantic || 'div'
    const inner = (node.blocks ?? []).map((child) => renderNode(child, submission)).join('')
    return `<${tag}${classAndStyleAttrs(node)}>${inner}</${tag}>`
  }

  return renderLeaf(node, submission)
}

function renderLeaf(node: MailElementNode, submission: Record<string, unknown>): string {
  if (node.element === 'img') return renderImage(node, submission)
  if (!node.element) return ''

  let tag = node.element
  if (node.level) {
    const level = Number(node.level)
    tag = 'h' + (Number.isInteger(level) && level >= 1 && level <= 6 ? level : 1)
  }

  return `<${tag}${classAndStyleAttrs(node)}>${resolveDisplayHtml(node, submission)}</${tag}>`
}

/** Mirrors BlockElementPreview.vue's displayContent computed, escaping
 *  the resolved text/link parts (which that client-side computed doesn't,
 *  since it renders trusted admin-authored Data Object values) - here the
 *  bound value is a public visitor's own submission, so it's untrusted
 *  input flowing into an HTML email and must be escaped. */
function resolveDisplayHtml(node: MailElementNode, submission: Record<string, unknown>): string {
  const db = node.dataBinding
  if (db && db.field) {
    const result = applyTransform(submission[db.field], db.transform)
    if (result.kind === 'link') {
      const targetAttr = result.target ? ` target="${result.target}" rel="noopener noreferrer"` : ''
      return `<a href="${escapeHtml(result.href)}"${targetAttr}>${escapeHtml(result.text)}</a>`
    }
    return escapeHtml(result.text)
  }
  return escapeHtml(node.content ?? '')
}

/** Only a plain string URL is resolved, whether static or bound - an
 *  asset-reference value ({ assetId }) is skipped (no <img> at all) since
 *  resolving it needs the DAM's async URL-signing flow this synchronous
 *  renderer doesn't have (documented gap, not a silent break). */
function renderImage(node: MailElementNode, submission: Record<string, unknown>): string {
  const db = node.dataBinding
  let src: string | undefined
  let alt: string | undefined

  if (db && db.field) {
    const value = submission[db.field]
    if (typeof value === 'string') {
      src = value
      alt = db.transform && db.transform.type !== 'none' ? applyTransform(value, db.transform).text || undefined : value
    }
  } else if (typeof node.image?.url === 'string' && /^https?:\/\//i.test(node.image.url)) {
    src = node.image.url
    alt = node.image.alt ?? undefined
  }

  if (!src) return ''
  const altAttr = alt ? ` alt="${escapeHtml(alt)}"` : ''
  return `<img src="${escapeHtml(src)}"${altAttr}${classAndStyleAttrs(node)}>`
}

function classAndStyleAttrs(node: MailElementNode): string {
  const cls = `${node.css?.css ?? ''} ${node.css?.container ?? ''}`.trim()
  let style = ''
  if (node.font) style += `font-family:"${node.font.replaceAll('+', ' ')}";`
  if (node.style) style += node.style
  let attrs = ''
  if (cls) attrs += ` class="${escapeHtml(cls)}"`
  if (style) attrs += ` style="${escapeHtml(style)}"`
  return attrs
}
