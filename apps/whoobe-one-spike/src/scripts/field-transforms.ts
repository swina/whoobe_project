// Field transformers for bound data: turn a raw resolved field value (from
// data-resolver.ts) into a display-ready TransformResult before
// BlockElement.vue/BlockElementPreview.vue's displayContent/displayAlt
// computeds render it. Configured per-binding from the "data binding"
// group in TailwindCustomizer.vue's sidebar (DataBindingTransformControl.vue)
// - see docs/plans (field transformer plan) for the full design.

export type TransformType = 'date' | 'url' | 'number' | 'truncate'

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

export type FieldTransform =
  | { type: 'none' }
  | { type: 'date'; options: DateTransformOptions }
  | { type: 'url'; options: UrlTransformOptions }
  | { type: 'number'; options: NumberTransformOptions }
  | { type: 'truncate'; options: TruncateTransformOptions }

export type TransformResult =
  | { kind: 'text'; text: string }
  | { kind: 'link'; href: string; text: string; target?: '_blank' | '_self' }

export interface TransformerDefinition<O> {
  type: TransformType
  label: string
  /** ClassFieldDefinition.fieldType values this transformer is offered for
   *  in the sidebar picker, or 'any' to offer it regardless of field type. */
  applicableFieldTypes: string[] | 'any'
  defaultOptions: O
  apply: (value: unknown, options: O) => TransformResult
}

/** http(s), same-origin absolute paths, mailto, tel - blocks javascript:/data:
 *  etc. from becoming a clickable anchor built from stored field data. */
const SAFE_SCHEME_RE = /^(https?:\/\/|mailto:|tel:|\/(?!\/))/i

function textResult(text: string): TransformResult {
  return { kind: 'text', text }
}

const dateTransformer: TransformerDefinition<DateTransformOptions> = {
  type: 'date',
  label: 'Format date',
  applicableFieldTypes: ['date'],
  defaultOptions: { dateStyle: 'medium', includeTime: false },
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

export const TRANSFORMERS = {
  date: dateTransformer,
  url: urlTransformer,
  number: numberTransformer,
  truncate: truncateTransformer,
} satisfies Record<TransformType, TransformerDefinition<any>>

export function transformersForFieldType(fieldType: string | null | undefined): TransformerDefinition<any>[] {
  return Object.values(TRANSFORMERS).filter(
    (t) => t.applicableFieldTypes === 'any' || (fieldType != null && t.applicableFieldTypes.includes(fieldType))
  )
}

/** Single entry point every render computed calls. Never throws - on any
 *  internal error, falls back to the same behavior as 'none'. */
export function applyTransform(value: unknown, transform: FieldTransform | null | undefined): TransformResult {
  if (!transform || transform.type === 'none') {
    if (value == null) return textResult('')
    if (typeof value === 'string' || typeof value === 'number') return textResult(String(value))
    return textResult('')
  }
  const def = TRANSFORMERS[transform.type] as TransformerDefinition<any> | undefined
  if (!def) return applyTransform(value, { type: 'none' })
  try {
    return def.apply(value, (transform as any).options ?? def.defaultOptions)
  } catch (e) {
    console.warn(`[field-transforms] "${transform.type}" failed:`, e)
    return applyTransform(value, { type: 'none' })
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
