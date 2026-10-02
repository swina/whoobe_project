/**
 * SEO templates for dynamic pages - a page's SEO settings (meta title,
 * description, canonical, Open Graph, JSON-LD) may contain `{field}` tokens
 * that are filled in from the data record the page is bound to, e.g. a blog
 * article page routed at `/blog/{slug}` can use `{title}` as its meta title.
 *
 * Pure functions, no DB/Vue coupling (same stance as data-binding.ts), so the
 * public API (core-api, for the published output), the editor's preview and
 * any other renderer resolve a template identically.
 *
 * Token syntax: `{name}` or `{Class.name}` (the class prefix is accepted for
 * readability and ignored - the record decides). `name` is looked up on the
 * record first (a top-level column such as `key`, else `attributes[name]`),
 * then in the page's URL params (so `{slug}` works even when the record has
 * no such field). A token that can't be resolved becomes empty rather than
 * leaking `{title}` into the HTML.
 */
import { collectBindings, type BindableNode, type ElementDataBinding } from './data-binding.js'

/** The PageSeo fields that accept `{field}` tokens. `structuredData` too, in
 *  every string value (see resolveSeoTemplates). */
export const SEO_TEMPLATE_FIELDS = ['metaTitle', 'metaDescription', 'canonicalUrl', 'ogTitle', 'ogDescription', 'ogImage'] as const

/** Structural subset of PageSeo (kept here so this module has no DB import),
 *  plus the data-source override. */
export interface SeoTemplateSource {
  metaTitle?: string | null
  metaDescription?: string | null
  canonicalUrl?: string | null
  robots?: { index: boolean; follow: boolean } | null
  ogTitle?: string | null
  ogDescription?: string | null
  ogImage?: string | null
  structuredData?: Record<string, unknown> | null
  /** Element id of the dataBinding that provides the record. Absent/unknown
   *  = the first single-record binding in the page, in document order. */
  sourceBindingId?: string | null
}

export interface SeoRecordLike {
  id?: string
  key?: string
  locale?: string
  attributes?: Record<string, unknown> | null
  [column: string]: unknown
}

export interface SeoContext {
  record?: SeoRecordLike | null
  urlParams?: Record<string, string>
  /** assetId -> public URL, for tokens whose field is an image/asset
   *  reference (`{ assetId }`); look them up with seoAssetIds(). */
  assetUrls?: Record<string, string>
}

const TOKEN = /\{([A-Za-z_][\w.]*)\}/g
const TOP_LEVEL_COLUMNS = new Set(['id', 'key', 'locale', 'classId', 'published', 'publishedAt', 'createdAt', 'updatedAt'])

export function hasSeoTokens(value: unknown): boolean {
  if (typeof value === 'string') return /\{[A-Za-z_][\w.]*\}/.test(value)
  if (Array.isArray(value)) return value.some(hasSeoTokens)
  if (value && typeof value === 'object') return Object.values(value).some(hasSeoTokens)
  return false
}

/** True when any templatable part of this SEO config contains a token. */
export function seoHasTokens(seo: SeoTemplateSource | null | undefined): boolean {
  if (!seo) return false
  return SEO_TEMPLATE_FIELDS.some((f) => hasSeoTokens(seo[f])) || hasSeoTokens(seo.structuredData)
}

/** How a binding relates to "the one record this page is about":
 *  - `record`: resolve mode `first` / `explicit` - always a single record;
 *  - `dynamic`: a `query` whose filter takes a `{param}` from the URL
 *    (`slug = {slug}`) - the "dynamic query" that makes a dynamic page, in
 *    practice one record;
 *  - `list`: any other `query` - a collection (related/latest items...), whose
 *    first record is a poor stand-in for the page's subject. */
export type SeoBindingKind = 'record' | 'dynamic' | 'list'

export interface SeoBindingRef {
  /** Element id carrying the binding (key into the editor's resolved data). */
  nodeId: string
  binding: ElementDataBinding
  kind: SeoBindingKind
}

function hasUrlParamFilter(binding: ElementDataBinding): boolean {
  return (binding.filters ?? []).some((f) => !f.valueIsBinding && typeof f.value === 'string' && /^\{\w+\}$/.test(f.value.trim()))
}

function bindingKind(binding: ElementDataBinding): SeoBindingKind | null {
  if (binding.resolveMode === 'first' || binding.resolveMode === 'explicit') return 'record'
  if (binding.resolveMode === 'query') return hasUrlParamFilter(binding) ? 'dynamic' : 'list'
  return null // parent / currentPage resolve against a context record, not a source of their own
}

/** Every binding the SEO data source can be chosen from, in document order.
 *  A `query` binding yields its first record (the editor's resolved value is
 *  an array, the public query is limited to 1). */
export function findSeoBindings(content: unknown): SeoBindingRef[] {
  if (!content || typeof content !== 'object') return []
  const roots = Array.isArray(content) ? (content as BindableNode[]) : [content as BindableNode]
  const out: SeoBindingRef[] = []
  for (const root of roots) {
    for (const { node, binding } of collectBindings(root)) {
      const kind = bindingKind(binding)
      if (kind && node.id) out.push({ nodeId: node.id, binding, kind })
    }
  }
  return out
}

/** The binding to take the SEO record from: the one the page picked
 *  (`sourceBindingId`) when it still exists, else the first binding that
 *  identifies one record (`record` or `dynamic`). A page with only list
 *  bindings has no automatic source - a list's first item is not "the page's
 *  record" unless the author says so. */
export function pickSeoBinding(content: unknown, sourceBindingId?: string | null): SeoBindingRef | null {
  const all = findSeoBindings(content)
  if (sourceBindingId) {
    const chosen = all.find((b) => b.nodeId === sourceBindingId)
    if (chosen) return chosen
  }
  return all.find((b) => b.kind !== 'list') ?? null
}

/** `{name}` placeholders in a binding's filter values (e.g. `slug = {slug}`)
 *  filled from the page's URL params - whole-string only, like the editor's
 *  data resolver. Returned as plain filters ready for a data-object query. */
export function substituteBindingFilters(
  binding: ElementDataBinding,
  urlParams: Record<string, string> | undefined,
): { field: string; operator: string; value: unknown }[] {
  return (binding.filters ?? [])
    .filter((f) => !f.valueIsBinding)
    .map((f) => {
      let value = f.value
      if (typeof value === 'string') {
        const m = /^\{(\w+)\}$/.exec(value.trim())
        if (m) value = urlParams?.[m[1]] ?? value
      }
      return { field: f.field, operator: f.operator, value }
    })
}

function fieldName(token: string): string {
  const dot = token.lastIndexOf('.')
  return dot === -1 ? token : token.slice(dot + 1)
}

function readField(record: SeoRecordLike | null | undefined, name: string): unknown {
  if (!record) return undefined
  if (TOP_LEVEL_COLUMNS.has(name) && record[name] != null) return record[name]
  const attrs = record.attributes
  return attrs ? attrs[name] : undefined
}

const ENTITIES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" }

/** Meta tags are plain text: drop markup from rich-text values, decode the
 *  common entities and collapse whitespace. */
function toPlainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|amp|lt|gt|quot|apos|#39);/g, (e) => ENTITIES[e] ?? e)
    .replace(/\s+/g, ' ')
    .trim()
}

function stringify(value: unknown, ctx: SeoContext): string {
  if (value == null) return ''
  if (typeof value === 'string') return toPlainText(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map((v) => stringify(v, ctx)).filter(Boolean).join(', ')
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (typeof obj.assetId === 'string') return ctx.assetUrls?.[obj.assetId] ?? ''
    if (typeof obj.path === 'string' && obj.path) return obj.path // link field
    if (typeof obj.text === 'string') return toPlainText(obj.text)
  }
  return ''
}

/** Fills the `{field}` tokens of one template string. */
export function applySeoTemplate(template: string, ctx: SeoContext): string {
  if (!hasSeoTokens(template)) return template
  return template
    .replace(TOKEN, (_m, token: string) => {
      const name = fieldName(token)
      const fromRecord = readField(ctx.record, name)
      if (fromRecord != null && fromRecord !== '') return stringify(fromRecord, ctx)
      return ctx.urlParams?.[name] ?? ''
    })
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function resolveDeep(value: unknown, ctx: SeoContext): unknown {
  if (typeof value === 'string') return applySeoTemplate(value, ctx)
  if (Array.isArray(value)) return value.map((v) => resolveDeep(v, ctx))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveDeep(v, ctx)]))
  }
  return value
}

/** A copy of `seo` with every token resolved. A field whose template resolves
 *  to nothing (record/field missing) becomes `null`, so consumers that fall
 *  back with `??` (meta title -> page title, OG title -> meta title, ...)
 *  still do. A config with no tokens is returned unchanged. */
export function resolveSeoTemplates<T extends SeoTemplateSource>(seo: T | null | undefined, ctx: SeoContext): T | null {
  if (!seo) return null
  if (!seoHasTokens(seo)) return seo
  const out = { ...seo } as Record<string, unknown>
  for (const f of SEO_TEMPLATE_FIELDS) {
    const v = seo[f]
    if (typeof v === 'string' && hasSeoTokens(v)) out[f] = applySeoTemplate(v, ctx) || null
  }
  if (seo.structuredData && hasSeoTokens(seo.structuredData)) {
    out.structuredData = resolveDeep(seo.structuredData, ctx) as Record<string, unknown>
  }
  return out as T
}

/** Asset ids referenced by the template's tokens on this record, so a caller
 *  can look their URLs up (async) before resolving - see SeoContext.assetUrls. */
export function seoAssetIds(seo: SeoTemplateSource | null | undefined, record: SeoRecordLike | null | undefined): string[] {
  if (!seo || !record) return []
  const ids = new Set<string>()
  const scan = (value: unknown) => {
    if (typeof value === 'string') {
      for (const m of value.matchAll(TOKEN)) {
        const v = readField(record, fieldName(m[1]))
        if (v && typeof v === 'object' && typeof (v as { assetId?: unknown }).assetId === 'string') ids.add((v as { assetId: string }).assetId)
      }
    } else if (Array.isArray(value)) value.forEach(scan)
    else if (value && typeof value === 'object') Object.values(value).forEach(scan)
  }
  for (const f of SEO_TEMPLATE_FIELDS) scan(seo[f])
  scan(seo.structuredData)
  return [...ids]
}
