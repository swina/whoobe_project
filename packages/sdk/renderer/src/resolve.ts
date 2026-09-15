// Data/field resolution for the renderer (docs/plans/cms/headless-sdk-plan.md
// §2) - resolves an element's `dataBinding` against the current context or
// the public API, formats bound values with the shared transform engine, and
// mirrors the editor's escaping rules.

import { applyTransform, escapeHtml, type ElementDataBinding, type FieldTransform, type TransformResult } from '@whoobe-cms/schema'
import type { RenderApi } from './api-client.js'
import type { WalkContext } from './walk.js'

/** Fields that live at the record top level, not in `attributes` (mirrors
 *  data-objects-records.ts's TOP_LEVEL_FILTER_FIELDS/SORT_FIELDS). */
const TOP_LEVEL_FIELDS = new Set(['id', 'classId', 'locale', 'key', 'published', 'publishedAt', 'createdAt', 'updatedAt'])

/** Reads a field off a public data-object record (attributes or top-level). */
export function resolveRecordField(record: Record<string, unknown> | null | undefined, field: string): unknown {
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

function resolveFilterValue(filter: { field: string; operator: string; value?: unknown; valueIsBinding?: boolean }, scope: ResolutionScope): unknown {
  if (filter.valueIsBinding && scope.ctx.record) {
    return resolveRecordField(scope.ctx.record, String(filter.value))
  }
  return filter.value
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
  endpointName: string
  routePath: string
  fieldPath: string
  params?: Record<string, string> | null
}

/** Resolves a gateway binding value by calling the gateway's resolve endpoint. */
export async function resolveGatewayBinding(
  binding: GatewayBinding,
  gatewayUrl: string
): Promise<unknown> {
  const url = `${gatewayUrl.replace(/\/+$/, '')}/api/v1/gateway/resolve`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpointName: binding.endpointName,
      routePath: binding.routePath,
      fieldPath: binding.fieldPath || undefined,
      params: binding.params || undefined,
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
 *  record may be a repeater item (stripped of the parent's field prefix). */
export function resolveFieldFromRecord(record: Record<string, unknown> | null | undefined, fieldPath: string): unknown {
  if (!record || !fieldPath) return undefined
  const parts = fieldPath.split('.')
  let current: unknown = record
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    const m = part.match(/^(\w+)\[(\d+)\]$/)
    if (m) {
      const arr = (current as Record<string, unknown>)[m[1]]
      if (!Array.isArray(arr)) return undefined
      current = arr[parseInt(m[2], 10)]
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  if (current !== undefined) return current
  const last = parts[parts.length - 1]
  if (last && typeof record === 'object') return record[last]
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
