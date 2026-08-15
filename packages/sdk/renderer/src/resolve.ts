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

export interface FormattedContent {
  /** Safe-to-inject HTML (bound text escaped; link transforms produce a
   *  sanitized anchor). */
  content: string
  /** valueMap transforms may add a className (badge styling). */
  className?: string
}

/** Applies the binding's transform and formats the value for display,
 *  mirroring the editor's displayContent/escapeHtml rules. */
export function formatBoundContent(value: unknown, transform: FieldTransform | null | undefined): FormattedContent {
  const result: TransformResult = applyTransform(value, transform)
  if (result.kind === 'link') {
    const targetAttr = result.target ? ` target="${result.target}" rel="noopener noreferrer"` : ''
    return { content: `<a href="${escapeHtml(result.href)}"${targetAttr}>${escapeHtml(result.text)}</a>` }
  }
  return { content: escapeHtml(result.text), className: result.className }
}
