// Allow-list sanitizer for the HTML that page content, data fields and form messages carry ("rich text").
// Every renderer (the editor, the admin previews, the public API output, the SDK adapters) feeds such strings to
// innerHTML / v-html, so anything an author - or an anonymous visitor through a public form - can put in a field
// would otherwise run as script in the viewer's session. This keeps formatting, links and images, and removes
// scripts, event handlers, javascript: URLs, frames, forms, all styles but colour/background-colour/text-align, and anything not listed.
import sanitizeHtml from 'sanitize-html'

const ALLOWED_TAGS = [
  'a', 'abbr', 'b', 'blockquote', 'br', 'cite', 'code', 'dd', 'del', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 's', 'small',
  'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
]

const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[A-Za-z0-9+/=]+$/i

// Inline styles the rich text editor produces (text colour, highlight, alignment). Only these three properties,
// only plain colour/keyword values: no url(), expression(), var() or anything else that could load or run something.
const COLOR_VALUE = [/^#[0-9a-f]{3,8}$/i, /^rgba?\(\s*[\d.]+%?\s*(?:,\s*|\s+)[\d.]+%?\s*(?:,\s*|\s+)[\d.]+%?\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/i, /^hsla?\(\s*[\d.]+(?:deg)?\s*(?:,\s*|\s+)[\d.]+%\s*(?:,\s*|\s+)[\d.]+%\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/i, /^[a-z]{3,20}$/i]

const RICH_TEXT: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    '*': ['class', 'title', 'lang', 'dir', 'style'],   // no id/name (DOM clobbering), no on*; style is cut down by allowedStyles
    a: ['href', 'target', 'rel', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
    ol: ['start'],
  },
  allowedStyles: {
    '*': { color: COLOR_VALUE, 'background-color': COLOR_VALUE, 'text-align': [/^(?:left|right|center|justify)$/] },
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: {
    a: (tagName, attribs) => {
      const out = { ...attribs }
      if (out.target) out.rel = 'noopener noreferrer'
      return { tagName, attribs: out }
    },
    img: (tagName, attribs) => {
      const out = { ...attribs }
      // data: images only for raster formats (an SVG data URL can carry script when opened on its own)
      if (out.src?.toLowerCase().startsWith('data:') && !SAFE_DATA_IMAGE.test(out.src)) delete out.src
      return { tagName, attribs: out }
    },
  },
}

export function sanitizeRichText(html: unknown): string {
  if (html === null || html === undefined) return ''
  return sanitizeHtml(String(html), RICH_TEXT)
}

// A contenteditable adds inline styles of its own while it is edited (a pasted fragment, two lines merged: font-size,
// font-family, a colour and a white background copied from wherever the text came from). The inline styles the
// author gave on purpose are the ones the content already had - the colours of the rich text editor (TipTap) -
// so after an edit only those are kept. Styles are compared by their declarations, not their spelling.
const normalizeStyle = (v: string): string => v.replace(/&quot;/g, '"').toLowerCase().replace(/\s+/g, '').replace(/;+$/, '')

export function dropForeignInlineStyles(edited: string, original: unknown): string {
  const known = new Set<string>()
  for (const m of String(original ?? '').matchAll(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) known.add(normalizeStyle(m[1] ?? m[2] ?? ''))
  return edited.replace(/\sstyle\s*=\s*"([^"]*)"/gi, (whole, value: string) => (known.has(normalizeStyle(value)) ? whole : ''))
}

const SVG_TAGS = [
  'svg', 'g', 'defs', 'path', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'rect', 'text', 'tspan', 'title', 'desc',
  'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'symbol', 'use',
]
const SVG_ATTRS = [
  'viewBox', 'width', 'height', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
  'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'fill-opacity', 'stroke-opacity', 'fill-rule', 'clip-rule', 'd',
  'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'transform', 'xmlns', 'class', 'id',
  'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'preserveAspectRatio', 'clip-path', 'mask',
  'font-size', 'font-family', 'text-anchor', 'dominant-baseline', 'version', 'role', 'aria-hidden', 'focusable',
]

const SVG: sanitizeHtml.IOptions = {
  allowedTags: SVG_TAGS,
  allowedAttributes: { '*': SVG_ATTRS },
  parser: { lowerCaseTags: false, lowerCaseAttributeNames: false },
  disallowedTagsMode: 'discard',
  // `use` may only point inside the same document (an external reference could load a script-bearing SVG)
  transformTags: { use: (tagName, attribs) => ({ tagName, attribs: Object.fromEntries(Object.entries(attribs).filter(([k, v]) => !/href$/i.test(k) || String(v).startsWith('#'))) }) },
}

/** Inline SVG markup (icons, illustrations): shapes and presentation attributes only. */
export function sanitizeSvg(svg: unknown): string {
  if (svg === null || svg === undefined) return ''
  return sanitizeHtml(String(svg), SVG)
}
