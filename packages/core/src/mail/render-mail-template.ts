import { applyTransform, escapeHtml, type FieldTransform } from './field-transforms.js'
import { substituteTokens, resolveContextPath } from './token-substitution.js'
import { tailwindToInlineCss } from './tailwind-inline.js'
import { fontFamilyStack } from './mail-document.js'
import { looksLikeDamReference } from './mail-image-urls.js'

// Walks the same Element-tree shape apps/whoobe-one-spike/src/scripts/
// ElementsClass.js defines, duck-typed here since that class is a
// frontend-only module packages/core can't import, and emits static HTML
// for a mail body. Deliberately scoped down from the full editor render
// tree - see docs/plans/forms/cms-forms.md's Phase 2 section 3 for the
// full list of what's out of scope and why (no JS runtime in an email:
// Alpine, GSAP, sliders, iframes, nested Dynamic Query repeaters).
//
// Context-aware since docs/plans/forms/mail-templates.md: every render
// receives a `context` object (`{ form: {...}, site?, user?, object? }`)
// rather than a bare submission. `dataBinding` fields resolve against
// `context.form` (unnamespaced fields, keeping page-based templates
// identical to before) or by explicit `form.`-prefixed dot-path; the
// `{namespace.field}` token syntax is additionally substituted over the
// final HTML so it works inside any static text node too.

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

/** Legacy signature - renders a whoobe_pages Element tree against a bare
 *  submission, mapping to `context = { form: submission }`. `imageUrls` is
 *  an optional `reference -> URL` map (see mail-image-urls.ts) used to
 *  resolve DAM-picked image references to public URLs. */
export function renderMailTemplate(
  pageContent: unknown,
  submission: Record<string, unknown>,
  imageUrls?: Record<string, string>,
): string {
  return renderTemplateContent(pageContent, { form: submission }, imageUrls)
}

/** Renders a mail template's Element tree (html kind) against a context
 *  object, with a final `{namespace.field}` token-substitution pass.
 *  `imageUrls` resolves DAM image references (see mail-image-urls.ts). */
export function renderTemplateContent(
  pageContent: unknown,
  context: Record<string, unknown>,
  imageUrls?: Record<string, string>,
): string {
  const html = renderNode(pageContent as MailElementNode | null | undefined, context, imageUrls)
  return substituteTokens(html, context)
}

function renderNode(
  node: MailElementNode | null | undefined,
  context: Record<string, unknown>,
  imageUrls?: Record<string, string>,
): string {
  if (!node || typeof node !== 'object') return ''
  if (node.tag && SKIPPED_TAGS.has(node.tag)) return ''
  // A binding with no `field` is a whole-object/collection binding (the
  // mechanism a Dynamic Query repeater uses) - meaningless against a single
  // flat context, so the whole subtree is omitted rather than guessing at a
  // stringified dump of it.
  if (node.dataBinding && !node.dataBinding.field) return ''

  if (node.type === 'container') {
    const tag = node.semantic || 'div'
    const inner = (node.blocks ?? []).map((child) => renderNode(child, context, imageUrls)).join('')
    return `<${tag}${classAndStyleAttrs(node)}>${inner}</${tag}>`
  }

  return renderLeaf(node, context, imageUrls)
}

function renderLeaf(node: MailElementNode, context: Record<string, unknown>, imageUrls?: Record<string, string>): string {
  if (node.element === 'img') return renderImage(node, context, imageUrls)
  if (!node.element) return ''

  let tag = node.element
  if (node.level) {
    const level = Number(node.level)
    tag = 'h' + (Number.isInteger(level) && level >= 1 && level <= 6 ? level : 1)
  }

  return `<${tag}${classAndStyleAttrs(node)}>${resolveDisplayHtml(node, context)}</${tag}>`
}

/** Resolves a dataBinding `field` against the context: an unnamespaced
 *  field (`firstname`) reads `context.form.firstname` (the page-based
 *  templates' existing behavior); a dot-path (`form.firstname`) goes
 *  through the shared token lookup. */
function resolveBoundField(context: Record<string, unknown>, field: string): unknown {
  if (field.includes('.')) {
    return resolveContextPath(context, field)
  }
  const form = context.form
  if (form != null && typeof form === 'object') {
    return (form as Record<string, unknown>)[field]
  }
  return undefined
}

/** Mirrors BlockElementPreview.vue's displayContent computed. Bound values
 *  are a public visitor's own submission, so they're untrusted input and
 *  are escaped; static content is admin-authored HTML and is sanitized
 *  through a safe-tag whitelist instead (so <b>/<a>/<br> written in the
 *  editor survive into the email). */
function resolveDisplayHtml(node: MailElementNode, context: Record<string, unknown>): string {
  const db = node.dataBinding
  if (db && db.field) {
    const result = applyTransform(resolveBoundField(context, db.field), db.transform)
    if (result.kind === 'link') {
      const targetAttr = result.target ? ` target="${result.target}" rel="noopener noreferrer"` : ''
      return `<a href="${escapeHtml(result.href)}"${targetAttr}>${escapeHtml(result.text)}</a>`
    }
    return escapeHtml(result.text)
  }
  return sanitizeInlineHtml(node.content ?? '')
}

/** Image `src` resolution: a data-bound string value is used as-is; a
 *  static `image.url` works when it's a full http(s) URL or a DAM reference
 *  that has a resolved URL in the `imageUrls` map (see mail-image-urls.ts).
 *  Anything unresolvable renders no <img> at all rather than a broken src. */
function renderImage(node: MailElementNode, context: Record<string, unknown>, imageUrls?: Record<string, string>): string {
  const db = node.dataBinding
  let src: string | undefined
  let alt: string | undefined

  if (db && db.field) {
    const value = resolveBoundField(context, db.field)
    if (typeof value === 'string') {
      src = value
      alt = db.transform && db.transform.type !== 'none' ? applyTransform(value, db.transform).text || undefined : value
    }
  } else if (typeof node.image?.url === 'string') {
    const url = node.image.url
    if (/^https?:\/\//i.test(url)) {
      src = url
      alt = node.image.alt ?? undefined
    } else if (looksLikeDamReference(url) && imageUrls?.[url]) {
      src = imageUrls[url]
      alt = node.image.alt ?? undefined
    }
  }

  if (!src) return ''
  const altAttr = alt ? ` alt="${escapeHtml(alt)}"` : ''
  return `<img src="${escapeHtml(src)}"${altAttr}${classAndStyleAttrs(node)}>`
}

// Static content is admin-authored HTML (the editor stores contenteditable
// innerHTML - including real <b>/<a> markup - straight into content), so it
// must render as HTML, not escaped text. It's still sanitized: only a
// whitelist of safe inline/flow tags survives, all attributes are dropped
// except a safe `href` on links, and anything else is escaped. Bound values
// (public form input) are NOT run through here - they stay fully escaped
// in resolveDisplayHtml().
const SAFE_CONTENT_TAGS = new Set([
  'a', 'b', 'strong', 'i', 'em', 'u', 'br', 'span', 'small', 'sub', 'sup',
  'mark', 'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
  'blockquote', 'hr', 'pre', 'code',
])

const SAFE_URL_RE = /^(https?:\/\/|mailto:|tel:|\/(?!\/))/i

function sanitizeInlineHtml(text: string): string {
  return text.replace(/<[^>]*>/g, (raw) => {
    const m = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/.exec(raw)
    if (!m) return escapeHtml(raw)
    const name = m[2].toLowerCase()
    if (!SAFE_CONTENT_TAGS.has(name)) return escapeHtml(raw)
    const closing = m[1] === '/'
    if (name === 'a') {
      if (closing) return '</a>'
      const href = /href\s*=\s*["']([^"']*)["']/i.exec(m[3] ?? '')
      if (!href || !SAFE_URL_RE.test(href[1])) return escapeHtml(raw)
      return `<a href="${escapeHtml(href[1])}">`
    }
    return closing ? `</${name}>` : `<${name}>`
  })
}

function classAndStyleAttrs(node: MailElementNode): string {
  const cls = `${node.css?.css ?? ''} ${node.css?.container ?? ''}`.trim()
  let style = ''
  if (node.font) style += `font-family:${fontFamilyStack(node.font)};`
  if (node.style) style += node.style
  let attrs = ''
  if (cls) attrs += ` class="${escapeHtml(cls)}"`
  // The element's Tailwind utility classes become inline styles - without
  // this the email renders unstyled, since clients don't load the editor's
  // stylesheet (see tailwind-inline.ts). Explicit inline `style`/`font`
  // come last so they win over the compiled utilities.
  const styleAttr = [tailwindToInlineCss(cls), style].filter(Boolean).join(';')
  if (styleAttr) attrs += ` style="${escapeHtml(styleAttr)}"`
  return attrs
}

/** Collects the distinct editor-set font families used anywhere in an
 *  Element tree, so the mail document's <head> can link their Google Fonts
 *  CSS (see mail-document.ts). Empty strings and duplicates are dropped. */
export function collectMailFonts(content: unknown): string[] {
  const seen = new Set<string>()
  const walk = (node: MailElementNode | null | undefined): void => {
    if (!node || typeof node !== 'object') return
    if (node.font) seen.add(node.font)
    if (Array.isArray(node.blocks)) node.blocks.forEach(walk)
  }
  walk(content as MailElementNode)
  return [...seen]
}
