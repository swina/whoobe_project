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

/** Renders a mail template's Element tree with NO token-substitution pass -
 *  for a destination that has no `context` to resolve at all (a campaign
 *  send is triggered by nobody's form submission/site/user) AND has its
 *  own per-recipient merge-tag syntax the result must reach untouched
 *  (e.g. Brevo's required `{unsubscribe}` tag, or `{{ contact.ATTRIBUTE
 *  }}`). Deliberately a separate function rather than `renderTemplateContent
 *  (pageContent, {})`: TOKEN_RE matches any bare `{word}` or `{word.word}`
 *  substring with no namespace check, including one embedded inside an
 *  ESP's own `{{ }}` syntax - running the substitution pass over an empty
 *  context wouldn't just leave those tags unresolved, it would blank them
 *  out (a missing path resolves to ''), silently corrupting the exact tags
 *  the destination needs. */
export function renderStaticHtml(pageContent: unknown, imageUrls?: Record<string, string>): string {
  return renderNode(pageContent as MailElementNode | null | undefined, {}, imageUrls)
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
    return `<${tag}${classAndStyleAttrs(node, imageUrls)}>${inner}</${tag}>`
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

  return `<${tag}${classAndStyleAttrs(node, imageUrls)}>${resolveDisplayHtml(node, context)}</${tag}>`
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

/** Resolves a static (non-data-bound) `image.url` to a usable src: a full
 *  http(s) URL passes through as-is, a DAM reference (Pimcore-style path or
 *  asset UUID) resolves through the `imageUrls` map (see mail-image-urls.
 *  ts). Returns undefined for anything unresolvable, so callers render no
 *  image at all rather than a broken one. Shared by renderImage() (an
 *  `<img>` element's own `src`) and classAndStyleAttrs() (a container's or
 *  non-`<img>` leaf's CSS background-image - see its own comment). */
function resolveStaticImageSrc(url: string | null | undefined, imageUrls?: Record<string, string>): string | undefined {
  if (typeof url !== 'string') return undefined
  if (/^https?:\/\//i.test(url)) return url
  if (looksLikeDamReference(url) && imageUrls?.[url]) return imageUrls[url]
  return undefined
}

/** Image `src` resolution: a data-bound string value is used as-is; a
 *  static `image.url` goes through resolveStaticImageSrc(). Anything
 *  unresolvable renders no <img> at all rather than a broken src. */
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
  } else {
    src = resolveStaticImageSrc(node.image?.url, imageUrls)
    if (src) alt = node.image?.alt ?? undefined
  }

  if (!src) return ''
  const altAttr = alt ? ` alt="${escapeHtml(alt)}"` : ''
  return `<img src="${escapeHtml(src)}"${altAttr}${classAndStyleAttrs(node, imageUrls)}>`
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

/** Mirrors BlockContainer.vue/BlockElement.vue's own `stile` computed: a
 *  container or non-`<img>` leaf's `image.url` doubles as a CSS
 *  background-image (an `<img>` element uses the same field as its own
 *  `src` instead, via renderImage() - never both). This was previously
 *  missing entirely from static rendering, so any editor-set background
 *  image silently disappeared once rendered for email/a campaign, even
 *  though a plain `<img>` element right next to it rendered fine. */
function classAndStyleAttrs(node: MailElementNode, imageUrls?: Record<string, string>): string {
  const cls = `${node.css?.css ?? ''} ${node.css?.container ?? ''}`.trim()
  let style = ''
  const bgUrl = node.element !== 'img' ? resolveStaticImageSrc(node.image?.url, imageUrls) : undefined
  if (bgUrl) style += `background-image:url(${bgUrl});`
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
