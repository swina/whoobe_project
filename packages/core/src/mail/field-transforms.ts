// Server-side port of apps/whoobe-one-spike/src/scripts/field-transforms.ts's
// pure functions, for render-mail-template.ts (docs/plans/forms/cms-forms.md's
// Phase 2). Not imported across the package boundary: packages/core is
// depended on BY apps/whoobe-one-spike (via core-api), so an import the
// other way would be circular - the same reasoning apps/whoobe-one-spike's
// own data-resolver.ts gives for duplicating packages/core's sort/filter
// logic client-side instead of importing it. Kept in sync by hand; a
// `FieldTransform` value is a plain JSON shape saved from the editor, so
// this only needs to stay behaviorally identical, not literally shared.

export type TransformType = 'date' | 'url' | 'number' | 'truncate' | 'valueMap'

export interface DateTransformOptions {
  dateStyle: 'short' | 'medium' | 'long' | 'full'
  includeTime: boolean
  timeStyle?: 'short' | 'medium'
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
  match: string
  label: string
  className: string
  /** Defaults to '=' (exact string match, the original behavior) when
   *  omitted, so every rule saved before this field existed keeps behaving
   *  exactly as before. '<'/'>' compare numerically - a rule with a
   *  non-numeric `match` or a non-numeric resolved value never matches for
   *  those operators. Kept in sync with packages/sdk/schema/src/
   *  transform.ts's identical type/logic. */
  operator?: '=' | '<' | '>'
}

export interface ValueMapTransformOptions {
  rules: ValueMapRule[]
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

interface TransformerDefinition<O> {
  apply: (value: unknown, options: O) => TransformResult
}

const SAFE_SCHEME_RE = /^(https?:\/\/|mailto:|tel:|\/(?!\/))/i

function textResult(text: string, className?: string): TransformResult {
  return className ? { kind: 'text', text, className } : { kind: 'text', text }
}

const dateTransformer: TransformerDefinition<DateTransformOptions> = {
  apply(value, options) {
    if (value == null || value === '') return textResult('')
    const d = value instanceof Date ? value : new Date(value as any)
    if (Number.isNaN(d.getTime())) return textResult(String(value))
    const fmt = new Intl.DateTimeFormat(undefined, {
      dateStyle: options.dateStyle,
      ...(options.includeTime ? { timeStyle: options.timeStyle ?? 'short' } : {}),
    })
    return textResult(fmt.format(d))
  },
}

const urlTransformer: TransformerDefinition<UrlTransformOptions> = {
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
    return textResult(fmt.format(n) + (options.style === 'percent' ? '%' : ''))
  },
}

const truncateTransformer: TransformerDefinition<TruncateTransformOptions> = {
  apply(value, options) {
    const text = value == null ? '' : String(value)
    if (text.length <= options.maxLength) return textResult(text)
    return textResult(text.slice(0, options.maxLength).trimEnd() + (options.ellipsis || '…'))
  },
}

function matchesValueMapRule(str: string, rule: ValueMapRule): boolean {
  const operator = rule.operator ?? '='
  if (operator === '=') return rule.match === str
  const numericValue = Number(str)
  const numericMatch = Number(rule.match)
  if (Number.isNaN(numericValue) || Number.isNaN(numericMatch)) return false
  return operator === '<' ? numericValue < numericMatch : numericValue > numericMatch
}

const valueMapTransformer: TransformerDefinition<ValueMapTransformOptions> = {
  apply(value, options) {
    const str = value == null ? '' : String(value)
    const rule = options.rules?.find((r) => matchesValueMapRule(str, r))
    if (rule) return textResult(rule.label || str, rule.className)
    return textResult(options.fallbackLabel || str, options.fallbackClassName)
  },
}

const TRANSFORMERS: Record<TransformType, TransformerDefinition<any>> = {
  date: dateTransformer,
  url: urlTransformer,
  number: numberTransformer,
  truncate: truncateTransformer,
  valueMap: valueMapTransformer,
}

/** Single entry point, mirroring the client copy - never throws, falls back
 *  to 'none' behavior on any internal error. */
export function applyTransform(value: unknown, transform: FieldTransform | null | undefined): TransformResult {
  if (!transform || transform.type === 'none') {
    if (value == null) return textResult('')
    if (typeof value === 'string' || typeof value === 'number') return textResult(String(value))
    return textResult('')
  }
  const def = TRANSFORMERS[transform.type] as TransformerDefinition<any> | undefined
  if (!def) return applyTransform(value, { type: 'none' })
  try {
    return def.apply(value, (transform as any).options)
  } catch {
    return applyTransform(value, { type: 'none' })
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
