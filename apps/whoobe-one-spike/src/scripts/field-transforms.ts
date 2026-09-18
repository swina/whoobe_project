// Field transformers for bound data: turn a raw resolved field value (from
// data-resolver.ts) into a display-ready TransformResult before
// BlockElement.vue/BlockElementPreview.vue's displayContent/displayAlt
// computeds render it. Configured per-binding from the "data binding"
// group in TailwindCustomizer.vue's sidebar (DataBindingTransformControl.vue)
// - see docs/plans (field transformer plan) for the full design.

export type TransformType = 'date' | 'url' | 'number' | 'truncate' | 'valueMap'

export interface DateTransformOptions {
  dateStyle: 'short' | 'medium' | 'long' | 'full'
  includeTime: boolean
}

export interface UrlTransformOptions {
  linkText: 'value' | 'custom'
  customText?: string
  openInNewTab: boolean
}

export interface NumberTransformOptions {
  style: 'decimal' | 'currency' | 'percent'
  currency?: string
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  useGrouping: boolean
}

export interface TruncateTransformOptions {
  maxLength: number
  ellipsis: string
}

export interface ValueMapRule {
  /** Matched against String(value) - same equality check a hand-written
   *  `original === 'x' ? ... : ...` ternary chain would use. */
  match: string
  label: string
  className: string
  /** Defaults to '=' (exact string match, the original behavior) when
   *  omitted, so every rule saved before this field existed keeps behaving
   *  exactly as before. '<'/'>' compare numerically - a rule with a
   *  non-numeric `match` or a non-numeric resolved value never matches for
   *  those operators (no crash, no coercion surprises). Kept in sync with
   *  packages/sdk/schema/src/transform.ts's identical type/logic. */
  operator?: '=' | '<' | '>'
}

export interface ValueMapTransformOptions {
  rules: ValueMapRule[]
  /** Applied when no rule's `match` equals the resolved value. An empty
   *  fallbackLabel falls back to the raw value itself (same convention as
   *  the other transformers' empty/passthrough behavior). */
  fallbackLabel: string
  fallbackClassName: string
}

export type FieldTransform =
  | { type: 'none' }
  | { type: 'date'; options: DateTransformOptions }
  | { type: 'url'; options: UrlTransformOptions }
  | { type: 'number'; options: NumberTransformOptions }
  | { type: 'truncate'; options: TruncateTransformOptions }
  | { type: 'valueMap'; options: ValueMapTransformOptions }

export type TransformResult =
  | { kind: 'text'; text: string; className?: string }
  | { kind: 'link'; href: string; text: string; target?: '_blank' | '_self' }

export interface TransformerDefinition<O> {
  type: TransformType
  label: string
  /** ClassFieldDefinition.fieldType values this transformer is offered for
   *  in the sidebar picker, or 'any' to offer it regardless of field type. */
  applicableFieldTypes: string[] | 'any'
  defaultOptions: O
  apply: (value: unknown, options: O, locale?: string) => TransformResult
}

/** http(s), same-origin absolute paths, mailto, tel - blocks javascript:/data:
 *  etc. from becoming a clickable anchor built from stored field data. */
const SAFE_SCHEME_RE = /^(https?:\/\/|mailto:|tel:|\/(?!\/))/i

function textResult(text: string, className?: string): TransformResult {
  return className ? { kind: 'text', text, className } : { kind: 'text', text }
}

const dateTransformer: TransformerDefinition<DateTransformOptions> = {
  type: 'date',
  label: 'Format date',
  applicableFieldTypes: ['date'],
  defaultOptions: { dateStyle: 'medium', includeTime: false },
  apply(value, options, locale) {
    if (value == null || value === '') return textResult('')
    const d = value instanceof Date ? value : new Date(value as any)
    if (Number.isNaN(d.getTime())) return textResult(String(value))
    const fmt = new Intl.DateTimeFormat(locale ?? undefined, {
      dateStyle: options.dateStyle,
      ...(options.includeTime ? { timeStyle: 'short' } : {}),
    })
    return textResult(fmt.format(d))
  },
}

const urlTransformer: TransformerDefinition<UrlTransformOptions> = {
  type: 'url',
  label: 'Turn into link',
  applicableFieldTypes: ['link', 'urlSlug', 'input'],
  defaultOptions: { linkText: 'value', openInNewTab: true },
  apply(value, options) {
    let href: string | null = null
    let fallbackText: string | null = null
    if (value && typeof value === 'object' && 'path' in (value as any)) {
      href = (value as any).path ?? null
      fallbackText = (value as any).text || href
    } else if (typeof value === 'string' && value) {
      href = value
      fallbackText = value
    }
    if (!href || !SAFE_SCHEME_RE.test(href)) {
      return textResult(fallbackText ?? '')
    }
    const text = options.linkText === 'custom' && options.customText ? options.customText : fallbackText ?? href
    return { kind: 'link', href, text, target: options.openInNewTab ? '_blank' : undefined }
  },
}

const numberTransformer: TransformerDefinition<NumberTransformOptions> = {
  type: 'number',
  label: 'Format number',
  applicableFieldTypes: ['numeric'],
  defaultOptions: { style: 'decimal', useGrouping: true },
  apply(value, options) {
    const n = typeof value === 'number' ? value : Number(value)
    if (value == null || value === '' || Number.isNaN(n)) return textResult(value == null ? '' : String(value))
    const fmt = new Intl.NumberFormat(undefined, {
      style: options.style === 'percent' ? 'decimal' : options.style,
      currency: options.style === 'currency' ? options.currency || 'USD' : undefined,
      minimumFractionDigits: options.minimumFractionDigits,
      maximumFractionDigits: options.maximumFractionDigits,
      useGrouping: options.useGrouping,
    })
    // Stored numeric value is already the human percent number (42 -> "42%"),
    // not a 0-1 fraction - Intl's own 'percent' style would multiply by 100,
    // which would be wrong for this convention, so it's applied as 'decimal'
    // and the '%' is appended manually instead.
    return textResult(fmt.format(n) + (options.style === 'percent' ? '%' : ''))
  },
}

const truncateTransformer: TransformerDefinition<TruncateTransformOptions> = {
  type: 'truncate',
  label: 'Truncate text',
  applicableFieldTypes: 'any',
  defaultOptions: { maxLength: 120, ellipsis: '…' },
  apply(value, options) {
    const text = value == null ? '' : String(value)
    if (text.length <= options.maxLength) return textResult(text)
    return textResult(text.slice(0, options.maxLength).trimEnd() + (options.ellipsis || '…'))
  },
}

// Native Vue :class/text binding, not Alpine - a data-bound repeater (e.g.
// BlockContainerPreview.vue's paginated list) reuses DOM nodes/component
// instances across pages, and Alpine's directive lifecycle (x-init/x-data
// scope) doesn't reliably re-run on a node it already initialized once
// that content changes underneath it (see docs/plans - the Alpine-badge
// approach broke on page 2+ of a paginated Dynamic Query). This transformer
// gets the same "value -> label + class" badge result through Vue's own
// reactivity instead, which patches correctly regardless of DOM/instance
// reuse.
function matchesValueMapRule(str: string, rule: ValueMapRule): boolean {
  const operator = rule.operator ?? '='
  if (operator === '=') return rule.match === str
  const numericValue = Number(str)
  const numericMatch = Number(rule.match)
  if (Number.isNaN(numericValue) || Number.isNaN(numericMatch)) return false
  return operator === '<' ? numericValue < numericMatch : numericValue > numericMatch
}

const valueMapTransformer: TransformerDefinition<ValueMapTransformOptions> = {
  type: 'valueMap',
  label: 'Map value to label/class',
  applicableFieldTypes: 'any',
  defaultOptions: { rules: [], fallbackLabel: '', fallbackClassName: '' },
  apply(value, options) {
    const str = value == null ? '' : String(value)
    const rule = options.rules?.find((r) => matchesValueMapRule(str, r))
    if (rule) return textResult(rule.label || str, rule.className)
    return textResult(options.fallbackLabel || str, options.fallbackClassName)
  },
}

export const TRANSFORMERS = {
  date: dateTransformer,
  url: urlTransformer,
  number: numberTransformer,
  truncate: truncateTransformer,
  valueMap: valueMapTransformer,
} satisfies Record<TransformType, TransformerDefinition<any>>

export function transformersForFieldType(fieldType: string | null | undefined): TransformerDefinition<any>[] {
  return Object.values(TRANSFORMERS).filter(
    (t) => t.applicableFieldTypes === 'any' || (fieldType != null && t.applicableFieldTypes.includes(fieldType))
  )
}

/** Single entry point every render computed calls. Never throws - on any
 *  internal error, falls back to the same behavior as 'none'. */
export function applyTransform(value: unknown, transform: FieldTransform | null | undefined, locale?: string): TransformResult {
  if (!transform || transform.type === 'none') {
    if (value == null) return textResult('')
    if (typeof value === 'string' || typeof value === 'number') return textResult(String(value))
    return textResult('')
  }
  const def = TRANSFORMERS[transform.type] as TransformerDefinition<any> | undefined
  if (!def) return applyTransform(value, { type: 'none' })
  try {
    return def.apply(value, (transform as any).options ?? def.defaultOptions, locale)
  } catch (e) {
    console.warn(`[field-transforms] "${transform.type}" failed:`, e)
    return applyTransform(value, { type: 'none' })
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// Strips `<!-- ... -->` comment nodes (e.g. Word/HTML paste artifacts like
// `<!--[if ...]-->` or `<!--StartFragment-->`) out of a rich-text field's
// raw HTML before it's rendered via v-html. Gated behind the Settings >
// General "Remove HTML Comments in Page Preview" toggle - see editor.ts's
// `stripHtmlComments` and BlockElementPreview.vue's `renderedContent`.
export function stripHtmlComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '')
}
