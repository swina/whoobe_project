// Data/field resolution for the renderer (docs/plans/cms/headless-sdk-plan.md
// §2) - resolves an element's `dataBinding` against the current context or
// the public API, formats bound values with the shared transform engine, and
// mirrors the editor's escaping rules.

import { applyTransform, escapeHtml, splitUp, type DataBindingFilter, type ElementDataBinding, type FieldTransform, type TransformResult } from '@whoobe-cms/schema'
import type { RenderApi, GatewaySiteAuth } from './api-client.js'
import type { WalkContext } from './walk.js'

/** Fields that live at the record top level, not in `attributes` (mirrors
 *  data-objects-records.ts's TOP_LEVEL_FILTER_FIELDS/SORT_FIELDS). */
const TOP_LEVEL_FIELDS = new Set(['id', 'classId', 'locale', 'key', 'published', 'publishedAt', 'createdAt', 'updatedAt'])

/** Reads a field off a public data-object record (attributes or top-level). */
export function resolveRecordField(record: Record<string, unknown> | null | undefined, field: string): unknown {
  // `^.field`: a field of the item the nested list sits in (docs/plans/cms/nested-bindings.md)
  if (field.startsWith('^.')) {
    const up = splitUp(record, field)
    return resolveRecordField(up.record as Record<string, unknown> | null | undefined, up.path)
  }
  if (!record) return undefined
  if (TOP_LEVEL_FIELDS.has(field)) return record[field]
  const attrs = record.attributes as Record<string, unknown> | undefined
  return attrs?.[field]
}

/** Context plus resolution plumbing threaded through the walk. */
export interface ResolutionScope {
  ctx: WalkContext
  api: RenderApi
}

/** A value that IS, whole-string, a `{name}` placeholder gets substituted
 *  from the current page's own matched urlParams (ctx.urlParams) - e.g. a
 *  container bound with filter `id = {id}` on a page routed at
 *  `/product/{id}` resolves to the one record matching whatever the visitor
 *  actually requested. A value merely CONTAINING a brace elsewhere, or with
 *  no matching param, is left untouched (mirrors the editor's
 *  data-resolver.ts substituteUrlParam, which this is the production
 *  counterpart of). */
function substituteUrlParam(value: unknown, urlParams: Record<string, string> | undefined): unknown {
  if (typeof value !== 'string') return value
  const m = /^\{(\w+)\}$/.exec(value.trim())
  if (!m) return value
  return urlParams?.[m[1]] ?? value
}

function resolveFilterValue(filter: { field: string; operator: string; value?: unknown; valueIsBinding?: boolean }, scope: ResolutionScope): unknown {
  if (filter.valueIsBinding && scope.ctx.record) {
    return resolveRecordField(scope.ctx.record, String(filter.value))
  }
  return substituteUrlParam(filter.value, scope.ctx.urlParams)
}

/** Resolves a container's dataBinding to the record(s) it selects.
 *  `query` yields a collection (repeater); `first`/`explicit` a single
 *  record; `parent`/`currentPage` (and relative bindings) resolve against
 *  the current context record. Mirrors data-resolver.ts's resolveMode
 *  switch - query/first hit the API by class name (no objectId needed). */
export async function resolveDataBinding(
  binding: ElementDataBinding,
  scope: ResolutionScope,
): Promise<{ record: Record<string, unknown> | null; records: Record<string, unknown>[] | null }> {
  if (binding.resolveMode === 'explicit') {
    if (!binding.objectId) return { record: null, records: null }
    const record = await scope.api.getObject(binding.objectId)
    return { record, records: null }
  }
  if (binding.resolveMode === 'query' || binding.resolveMode === 'first') {
    const records = await scope.api.queryObjects({
      class: binding.className,
      filters: (binding.filters ?? []).map((f) => ({ ...f, value: resolveFilterValue(f, scope) })),
      orderBy: binding.orderBy,
      offset: binding.offset,
      limit: binding.limit,
      locale: binding.locale,
    })
    return {
      record: records[0] ?? null,
      records: binding.resolveMode === 'query' ? records : null,
    }
  }
  // 'parent' | 'currentPage' | relative - the consumer/adapter supplies it.
  return { record: scope.ctx.record ?? null, records: null }
}

/** Resolves a *field* binding's raw value (for an element's content/image). */
export async function resolveFieldValue(binding: ElementDataBinding, scope: ResolutionScope): Promise<unknown> {
  if (!binding.field) return undefined
  if (!binding.objectId) {
    return (
      resolveRecordField(scope.ctx.record, binding.field) ??
      resolveRecordField(scope.ctx.form as Record<string, unknown> | undefined, binding.field)
    )
  }
  const resolved = await resolveDataBinding(binding, scope)
  return resolveRecordField(resolved.record, binding.field)
}

export interface GatewayBinding {
  /** 'item': read from the item the element sits in, never fetched (see @whoobe-cms/schema's GatewayBinding). */
  scope?: 'item' | null
  limit?: number | null
  /** Stripped from public content (core-api's sanitizePublicGatewayContent)
   *  once bindingId is resolved - see the doc comment on bindingId below.
   *  Unused by resolveGatewayBinding() itself (bindingId-only), kept purely
   *  so this type still matches @whoobe-cms/schema's authoring-time shape. */
  endpointName?: string
  routePath?: string
  fieldPath: string
  params?: Record<string, string> | null
  filters?: DataBindingFilter[] | null
  /** Server-resolved bindingId (core-api's bind-page-content.ts) - see
   *  resolveGatewayBinding() below. `endpointName`/`routePath`/`filters` are
   *  stripped from public content (core-api's sanitizePublicGatewayContent)
   *  and only ever populated here for the editor's own live preview, which
   *  calls the admin-authenticated /api/v1/gateway/preview-resolve instead
   *  of this module entirely (see GatewayBindingPicker.vue/data-resolver.ts). */
  bindingId?: string
}

/** Substitutes `{name}`-placeholder GatewayBinding.params values from the
 *  current page's urlParams, same rule as substituteUrlParam() above. */
function substituteGatewayParams(
  params: Record<string, string> | null | undefined,
  urlParams: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!params) return undefined
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    out[key] = String(substituteUrlParam(value, urlParams))
  }
  return out
}

/** Resolves a gateway binding value by calling the Gateway's public resolve
 *  endpoint - by `bindingId` only (docs/plans/api-gateway/gateway-auth-
 *  authz.md), never the raw endpointName/routePath (public content never
 *  carries those - see the GatewayBinding.bindingId doc comment above).
 *  Returns undefined (no-op) rather than calling anything when no bindingId
 *  is present, e.g. content that predates this feature or was never
 *  configured with a valid gateway target. */
export async function resolveGatewayBinding(
  binding: GatewayBinding,
  gatewayUrl: string,
  urlParams?: Record<string, string>,
  siteAuth?: GatewaySiteAuth,
  /** A same-origin path that resolves for the browser (it adds the site key); then no address and no key are used here. */
  proxyPath?: string,
): Promise<unknown> {
  if (!binding.bindingId) return undefined
  const url = proxyPath ?? `${gatewayUrl.replace(/\/+$/, '')}/api/v1/gateway/resolve`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (siteAuth && !proxyPath) {
    headers['X-Whoobe-Site-Id'] = siteAuth.siteId
    headers['X-Whoobe-Site-Key'] = siteAuth.siteKey
  }
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      bindingId: binding.bindingId,
      params: substituteGatewayParams(binding.params, urlParams),
    }),
  })
  if (!res.ok) {
    throw new Error(`Gateway resolve failed: ${res.status}`)
  }
  const data = await res.json() as { value?: unknown; found?: boolean }
  return data.value
}

export async function resolveGatewayFieldValue(resolved: unknown, fieldPath: string): Promise<unknown> {
  if (!resolved || !fieldPath) return resolved
  const parts = fieldPath.split('.')
  let current: unknown = resolved
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    const arrayMatch = /^(\w+)\[(\d+)\]$/.exec(part)
    if (arrayMatch) {
      const [, key, indexStr] = arrayMatch
      const index = parseInt(indexStr, 10)
      if (typeof current !== 'object') return undefined
      const arr = (current as Record<string, unknown>)[key]
      if (!Array.isArray(arr)) return undefined
      current = arr[index]
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return current
}

export interface FormattedContent {
  content: string
  className?: string
}

/** Resolves a dot-path field from a record, with fallback to the last path
 *  segment. Used for gateway binding field resolution where the context
 *  record may be a repeater item (stripped of the parent's field prefix) -
 *  e.g. a route whose response is `{ products: [...] }` produces field
 *  paths like "products.title" in the picker (there's no UI to pick a path
 *  relative to a repeater item), but once a container repeats over
 *  "products", each child's ctx.record IS one item - `{ title: ... }`, not
 *  `{ products: { title: ... } }` - so the full path's first segment
 *  ("products") doesn't exist on it and the walk must fall back to just the
 *  last segment ("title") against that same record. */
export function resolveFieldFromRecord(record: Record<string, unknown> | null | undefined, fieldPath: string): unknown {
  if (!record || !fieldPath) return undefined
  const parts = fieldPath.split('.')
  let current: unknown = record
  let walkFailed = false
  for (const part of parts) {
    if (current === null || current === undefined) {
      walkFailed = true
      break
    }
    const m = part.match(/^(\w+)\[(\d+)\]$/)
    if (m) {
      const arr = (current as Record<string, unknown>)[m[1]]
      if (!Array.isArray(arr)) {
        walkFailed = true
        break
      }
      current = arr[parseInt(m[2], 10)]
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part]
    } else {
      walkFailed = true
      break
    }
  }
  if (!walkFailed && current !== undefined) return current
  // The full-path walk didn't land - retry as a repeater-item-relative
  // lookup, directly against the record with just the path's last segment.
  const last = parts[parts.length - 1]
  if (last && typeof record === 'object') return (record as Record<string, unknown>)[last]
  return undefined
}

export function formatBoundContent(value: unknown, transform: FieldTransform | null | undefined): FormattedContent {
  const result: TransformResult = applyTransform(value, transform)
  if (result.kind === 'link') {
    const targetAttr = result.target ? ` target="${result.target}" rel="noopener noreferrer"` : ''
    return { content: `<a href="${escapeHtml(result.href)}"${targetAttr}>${escapeHtml(result.text)}</a>` }
  }
  return { content: escapeHtml(result.text), className: result.className }
}
