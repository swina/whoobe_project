import type { DataBindingFilter, DataBindingOrderBy, ElementDataBinding } from './ElementsClass.js'
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

type WhoobeElement = InstanceType<typeof import('./ElementsClass.js').default>

export async function resolveDocumentData(doc: WhoobeElement, locale?: string, urlParams?: Record<string, string>): Promise<void> {
  const editor = useEditorStore()
  editor.resolvedData = {}
  await resolveTree(doc, locale, urlParams, editor)
}

async function resolveTree(
  node: WhoobeElement,
  locale: string | undefined,
  urlParams: Record<string, string> | undefined,
  editor: ReturnType<typeof useEditorStore>
): Promise<void> {
  const db = (node as any).dataBinding as ElementDataBinding | undefined
  if (db) {
    try {
      editor.resolvedData[node.id] = await resolveBinding(db, locale, urlParams)
    } catch (err: any) {
      console.error(`[data-resolver] Failed to resolve binding for element ${node.id}:`, err)
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