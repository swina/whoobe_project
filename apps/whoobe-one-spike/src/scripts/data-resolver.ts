import type { DataBindingFilter, ElementDataBinding } from './ElementsClass.js'
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

export async function resolveDocumentData(doc: WhoobeElement, locale?: string): Promise<void> {
  const editor = useEditorStore()
  editor.resolvedData = {}
  await resolveTree(doc, locale, editor)
}

async function resolveTree(node: WhoobeElement, locale: string | undefined, editor: ReturnType<typeof useEditorStore>): Promise<void> {
  const db = (node as any).dataBinding as ElementDataBinding | undefined
  if (db) {
    try {
      editor.resolvedData[node.id] = await resolveBinding(db, locale)
    } catch (err: any) {
      console.error(`[data-resolver] Failed to resolve binding for element ${node.id}:`, err)
      editor.resolvedData[node.id] = null
    }
  }
  for (const child of (node as any).blocks ?? []) {
    await resolveTree(child, locale, editor)
  }
}

async function resolveBinding(db: ElementDataBinding, locale?: string): Promise<DataObjectRecord | DataObjectRecord[] | null> {
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
      const filters: DataObjectQueryFilter[] | undefined = db.filters?.map(f => ({
        field: f.field,
        operator: f.operator as DataObjectQueryFilter['operator'],
        value: f.value,
      }))
      try {
        // Admin query first (no published filter) - works when embedded in
        // the admin dashboard with a valid session cookie.
        const objects = await queryDataObjects(db.className, filters, undefined, locale)
        return db.resolveMode === 'first' ? (objects[0] ?? null) : objects
      } catch (err) {
        // Fallback: try the public endpoint (published-only) for standalone
        // whoobe-one-spike with no admin session.
        console.warn('[data-resolver] Admin query failed, trying public:', err)
        try {
          const objects = await queryPublishedDataObjects(db.className, filters, undefined, locale)
          return db.resolveMode === 'first' ? (objects[0] ?? null) : objects
        } catch (err2) {
          // Final fallback: fetch all via admin endpoint, filter client-side
          console.warn('[data-resolver] Public query failed, falling back to client-side filter:', err2)
          const all = await listDataObjects()
          const dataClass = await getDataClassByName(db.className)
          const filtered = dataClass ? all.filter((o) => o.classId === dataClass.id) : all
          if (db.filters && db.filters.length > 0) {
            return applyFilters(filtered, db.filters)
          }
          return db.resolveMode === 'first' ? (filtered[0] ?? null) : filtered
        }
      }
    }
    default:
      return null
  }
}

export function applyFilters(objects: DataObjectRecord[], filters: DataBindingFilter[]): DataObjectRecord[] {
  return objects.filter((obj) =>
    filters.every((f) => {
      const value = (obj.attributes as any)?.[f.field]
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
      return resolved.map((r) => (r.attributes as any)?.[field])
    }
    return (resolved as DataObjectRecord).attributes?.[field]
  }
  return resolved
}