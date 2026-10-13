import type { DataBindingFilter, DataBindingOrderBy, ElementDataBinding, GatewayBinding } from './ElementsClass.js'
import {
  getDataObject,
  getDataClassByName,
  queryDataObjects,
  queryPublishedDataObjects,
  listDataObjects,
  type DataObjectRecord,
  type DataObjectQueryFilter,
} from '../data-objects-api'
import { useEditorStore } from '../store/editor'
import { bindingSelectionNames } from '@whoobe-cms/schema'

type WhoobeElement = InstanceType<typeof import('./ElementsClass.js').default>

export async function resolveDocumentData(doc: WhoobeElement, locale?: string, urlParams?: Record<string, string>, reset = true): Promise<void> {
  const editor = useEditorStore()
  // `reset` is true for a fresh render (clear stale data). A composed
  // render - the body page plus its website-template header/aside/footer
  // modules - resolves several trees together, so each subsequent tree must
  // MERGE into the same map rather than wipe it (PublicPage.vue resolves
  // the modules with reset=false).
  if (reset) editor.resolvedData = {}
  await resolveTree(doc, locale, urlParams, editor)
}

async function resolveTree(
  node: WhoobeElement,
  locale: string | undefined,
  urlParams: Record<string, string> | undefined,
  editor: ReturnType<typeof useEditorStore>
): Promise<void> {
  const db = (node as any).dataBinding as ElementDataBinding | undefined
  // a nested list or a field of the item the element sits in: the data comes with the parent item, nothing to fetch
  if (db && !(db.resolveMode === 'parent' && db.target === 'list')) {
    try {
      editor.resolvedData[node.id] = await resolveBinding(db, locale, urlParams)
    } catch (err: any) {
      console.error(`[data-resolver] Failed to resolve binding for element ${node.id}:`, err)
      editor.resolvedData[node.id] = null
    }
  }
  const gb = (node as any).gatewayBinding as GatewayBinding | undefined
  // (a list whose route parameters take the visitor's selection is loaded when the selection is made, not here)
  if (gb && gb.scope !== 'item' && !bindingSelectionNames(gb.params).length) {
    try {
      editor.resolvedData[node.id] = await resolveGatewayBinding(gb, urlParams)
    } catch (err: any) {
      console.error(`[data-resolver] Failed to resolve gateway binding for element ${node.id}:`, err)
      editor.resolvedData[node.id] = null
    }
  }
  for (const child of (node as any).blocks ?? []) {
    await resolveTree(child, locale, urlParams, editor)
  }
}

/** A filter value that IS, whole-string, a `{name}` placeholder gets
 *  substituted from urlParams (see docs/plans/website/website-paths.md) -
 *  e.g. binding a container's filter to `slug = {slug}` on a page whose
 *  own routing slug is `/it/news/{slug}` resolves the one record matching
 *  whatever the visitor actually requested. A value merely CONTAINING a
 *  brace elsewhere is left untouched (only a whole-string match counts).
 *  A missing param leaves the literal placeholder text as the query value,
 *  which resolves to 0 rows - a safe, visible failure rather than
 *  silently matching everything. */
function substituteUrlParam(value: unknown, urlParams: Record<string, string> | undefined): unknown {
  if (typeof value !== 'string') return value
  const m = /^\{(\w+)\}$/.exec(value.trim())
  if (!m) return value
  return urlParams?.[m[1]] ?? value
}

async function resolveBinding(
  db: ElementDataBinding,
  locale?: string,
  urlParams?: Record<string, string>
): Promise<DataObjectRecord | DataObjectRecord[] | null> {
  switch (db.resolveMode) {
    case 'explicit':
      if (!db.objectId) return null
      try {
        return await getDataObject(db.objectId)
      } catch (err) {
        // Fall back to public endpoint if admin auth isn't available
        // (standalone whoobe-one-spike with no session cookie).
        try {
          const { getPublishedDataObject } = await import('../data-objects-api')
          return await getPublishedDataObject(db.objectId!)
        } catch {
          return null
        }
      }
    case 'query':
    case 'first': {
      // Substituted once, up front, and reused by every fallback tier
      // below (admin query, public query, client-side filter) so a
      // {placeholder}-marked filter behaves identically no matter which
      // path actually resolves it.
      const substitutedFilters: DataBindingFilter[] | undefined = db.filters?.map((f) => ({
        ...f,
        value: substituteUrlParam(f.value, urlParams),
      }))
      const filters: DataObjectQueryFilter[] | undefined = substitutedFilters?.map(f => ({
        field: f.field,
        operator: f.operator as DataObjectQueryFilter['operator'],
        value: f.value,
      }))
      // offset/limit are 'query'-only (pagination of a single 'first'
      // record is meaningless) - orderBy applies to both.
      const queryOptions = {
        filters,
        orderBy: db.orderBy ?? undefined,
        offset: db.resolveMode === 'query' ? (db.offset ?? undefined) : undefined,
        limit: db.resolveMode === 'query' ? (db.limit ?? undefined) : undefined,
        locale,
      }
      try {
        // Admin query first (no published filter) - works when embedded in
        // the admin dashboard with a valid session cookie.
        const objects = await queryDataObjects(db.className, queryOptions)
        return db.resolveMode === 'first' ? (objects[0] ?? null) : objects
      } catch (err) {
        // Fallback: try the public endpoint (published-only) for standalone
        // whoobe-one-spike with no admin session.
        console.warn('[data-resolver] Admin query failed, trying public:', err)
        try {
          const objects = await queryPublishedDataObjects(db.className, queryOptions)
          return db.resolveMode === 'first' ? (objects[0] ?? null) : objects
        } catch (err2) {
          // Final fallback: fetch all via admin endpoint, filter/sort/
          // offset/limit client-side - so a bound container doesn't
          // visibly behave differently (wrong order, no pagination
          // window) just because this rare no-session/no-public-route
          // path was taken instead of the primary query path.
          console.warn('[data-resolver] Public query failed, falling back to client-side filter:', err2)
          const all = await listDataObjects()
          const dataClass = await getDataClassByName(db.className)
          let filtered = dataClass ? all.filter((o) => o.classId === dataClass.id) : all
          if (substitutedFilters && substitutedFilters.length > 0) {
            filtered = applyFilters(filtered, substitutedFilters)
          }
          if (db.orderBy) {
            filtered = sortClientSide(filtered, db.orderBy)
          }
          if (db.resolveMode === 'query') {
            const off = db.offset && db.offset > 0 ? db.offset : 0
            filtered = db.limit ? filtered.slice(off, off + db.limit) : filtered.slice(off)
          }
          return db.resolveMode === 'first' ? (filtered[0] ?? null) : filtered
        }
      }
    }
    default:
      return null
  }
}

// Same top-level/attribute distinction and numeric-then-date-then-string
// coercion order as the server's own getSortValue/getFieldValue/
// compareSortValues/sortDataObjects (packages/core/src/db/data-objects-
// records.ts) - a client-side duplicate, not an import, since this file
// already duplicates the filter logic locally the same way (applyFilters
// below) rather than importing server internals across the process
// boundary. published/workflowState/updatedAt are real filter/binding
// fields now (DataObjectPicker.vue's SYSTEM_METADATA_FIELDS), not just
// sort keys, so TOP_LEVEL_FILTER_FIELDS mirrors the server's own set and
// is used by both applyFilters() and resolveFieldValue() below, not only
// sorting. createdAt/publishedAt remain sort-only, same as server-side.
const TOP_LEVEL_FILTER_FIELDS = new Set([
  'key', 'path', 'locale', 'id', 'classId', 'pimcoreId', 'translationGroupId',
  'published', 'workflowState', 'updatedAt',
])
const TOP_LEVEL_SORT_FIELDS = new Set([...TOP_LEVEL_FILTER_FIELDS, 'createdAt', 'publishedAt'])

function getFieldValueClientSide(obj: DataObjectRecord, field: string): unknown {
  return TOP_LEVEL_FILTER_FIELDS.has(field) ? (obj as any)[field] : (obj.attributes as any)?.[field]
}

function getSortValueClientSide(obj: DataObjectRecord, field: string): unknown {
  return TOP_LEVEL_SORT_FIELDS.has(field) ? (obj as any)[field] : (obj.attributes as any)?.[field]
}

function compareSortValuesClientSide(a: unknown, b: unknown): number {
  const na = Number(a)
  const nb = Number(b)
  if (!isNaN(na) && !isNaN(nb)) return na - nb
  const da = new Date(a as any).getTime()
  const db_ = new Date(b as any).getTime()
  if (!isNaN(da) && !isNaN(db_)) return da - db_
  return String(a).localeCompare(String(b))
}

function sortClientSide(rows: DataObjectRecord[], orderBy: DataBindingOrderBy): DataObjectRecord[] {
  return [...rows].sort((a, b) => {
    const va = getSortValueClientSide(a, orderBy.field)
    const vb = getSortValueClientSide(b, orderBy.field)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    const cmp = compareSortValuesClientSide(va, vb)
    return orderBy.direction === 'asc' ? cmp : -cmp
  })
}

export function applyFilters(objects: DataObjectRecord[], filters: DataBindingFilter[]): DataObjectRecord[] {
  return objects.filter((obj) =>
    filters.every((f) => {
      const value = getFieldValueClientSide(obj, f.field)
      switch (f.operator) {
        case 'eq':
          return value === f.value
        case 'neq':
          return value !== f.value
        case 'in':
          return Array.isArray(f.value) ? f.value.includes(value) : String(value) === String(f.value)
        case 'contains':
          return String(value ?? '').toLowerCase().includes(String(f.value ?? '').toLowerCase())
        case 'gt':
          return Number(value) > Number(f.value)
        case 'lt':
          return Number(value) < Number(f.value)
        default:
          return true
      }
    })
  )
}

export function resolveFieldValue(
  resolved: DataObjectRecord | DataObjectRecord[] | null,
  db: ElementDataBinding
): unknown {
  if (!resolved) return null
  if (db.field) {
    const field = db.field
    if (Array.isArray(resolved)) {
      return resolved.map((r) => getFieldValueClientSide(r, field))
    }
    return getFieldValueClientSide(resolved as DataObjectRecord, field)
  }
  return resolved
}

/** Resolves a dot-path field from a record, with fallback to the last path
 *  segment. Used by BlockElement.vue/BlockElementPreview.vue for a
 *  gatewayBinding child inside a container repeater: a route whose response
 *  is `{ products: [...] }` produces field paths like "products.title" in
 *  GatewayBindingPicker.vue/GatewayPanel.vue's field list (there's no UI to
 *  pick a path relative to a repeater item), but once BlockContainerPreview.
 *  vue repeats over "products", each child's dataContext IS one item -
 *  `{ title: ... }`, not `{ products: { title: ... } }` - so the full
 *  path's first segment doesn't exist on it and the walk must fall back to
 *  just the last segment ("title") against that same record. Mirrors
 *  packages/sdk/renderer/src/resolve.ts's function of the same name (the
 *  production/published-page counterpart of this editor-side one) - keep
 *  both in sync if this changes. */
export function resolveFieldFromRecord(record: any, fieldPath: string): unknown {
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

export function resolveGatewayFieldValue(resolved: unknown, fieldPath: string): unknown {
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

/** A gateway path/query param value that IS, whole-string, a `{name}`
 *  placeholder gets substituted from urlParams - same rule as
 *  substituteUrlParam() above, but for GatewayBinding.params. This lets a
 *  detail page's own dynamic slug param (e.g. the `id` in a page whose slug
 *  is `/product/{id}`) flow into a gateway route's `{id}` path parameter,
 *  so the same container/field binding fetches the one record matching
 *  whatever the visitor actually requested instead of a hard-coded value. */
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

// This resolver runs in two contexts that need different endpoints (docs/
// plans/api-gateway/gateway-auth-authz.md): the EDITOR canvas (BlockEditor.
// vue etc.), which has the raw endpointName/routePath in memory (possibly
// not saved yet) and an admin session; and PublicPage.vue, which only ever
// has whatever core-api's /public/pages/* returned - endpointName/routePath
// are stripped there (sanitizePublicGatewayContent), leaving only bindingId.
// bindingId present -> the real public route (no session, no raw identifiers
// to leak); otherwise (editor, unsaved) -> the admin-authenticated preview
// route, same as GatewayBindingPicker.vue's own preview fetch.
export async function resolveGatewayBinding(gb: GatewayBinding, urlParams?: Record<string, string>): Promise<unknown> {
  const baseUrl = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:3001'
  const base = baseUrl.replace(/\/+$/, '')

  // Editor context (endpointName available) → admin-authenticated preview-
  // resolve (core-api skips sanitizePublicGatewayContent when ?editor=true).
  // Published site context (only bindingId) → public resolve (needs site
  // auth headers set by the server-side code, never from the browser).
  if (gb.endpointName) {
    const res = await fetch(`${base}/api/v1/gateway/preview-resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpointName: gb.endpointName,
        routePath: gb.routePath,
        fieldPath: gb.fieldPath || undefined,
        params: substituteGatewayParams(gb.params, urlParams),
        filters: gb.filters?.length ? gb.filters : undefined,
      }),
      credentials: 'include',
    })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      throw new Error((errBody as any).error || `Gateway resolve failed: ${res.status}`)
    }
    const data = (await res.json()) as { value?: unknown; found?: boolean }
    return data.value
  }

  if (gb.bindingId) {
    const res = await fetch(`${base}/api/v1/gateway/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bindingId: gb.bindingId,
        params: substituteGatewayParams(gb.params, urlParams),
      }),
    })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      throw new Error((errBody as any).error || `Gateway resolve failed: ${res.status}`)
    }
    const data = (await res.json()) as { value?: unknown; found?: boolean }
    return data.value
  }

  throw new Error('Gateway binding has neither endpointName nor bindingId')
}