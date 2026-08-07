// Resolves Element data bindings for preview/production rendering.
// Called by DocumentPreview.vue before rendering the document tree.
// Walks the tree, resolves each element's dataBinding, and stores the
// resolved data object (or array for collection bindings) in the editor
// store's resolvedData map, keyed by element id.
//
// Preview components read from editor.resolvedData[elementId] to get the
// resolved object, then use resolveFieldValue() to extract the target field.
import type { DataBindingFilter, ElementDataBinding } from './ElementsClass.js'
import {
  getPublishedDataObject,
  listPublishedDataObjects,
  type DataObjectRecord,
} from '../data-objects-api'
import { useEditorStore } from '../store/editor'

type WhoobeElement = InstanceType<typeof import('./ElementsClass.js').default>

/** Walk the entire document tree, resolve every element's dataBinding,
 *  and store results in the store's resolvedData map. */
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
    } catch {
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
        return await getPublishedDataObject(db.objectId)
      } catch {
        return null
      }
    case 'query': {
      const objects = await listPublishedDataObjects(db.className, locale)
      if (db.filters && db.filters.length > 0) {
        return applyFilters(objects, db.filters)
      }
      return objects
    }
    case 'first': {
      const objects = await listPublishedDataObjects(db.className, locale)
      return objects[0] ?? null
    }
    default:
      return null
  }
}

/** Client-side filter matching for dynamic query bindings. */
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

/** Extract a binding's target field value from a resolved data object. */
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