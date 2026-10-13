// Nested lists in the editor's renderers (docs/plans/cms/nested-bindings.md): what a container or an element reads from the item it sits in.
// The published sites do the same in @whoobe-cms/renderer's walker; the editor's components get the item as `dataContext`.
import { nestedDataList, nestedGatewayList, readItemPath, splitUp, withParent } from '@whoobe-cms/schema'
import { resolveFieldFromRecord } from './data-resolver'

type Ctx = Record<string, any> | null | undefined

/** A container whose list is part of the item it sits in: a Data Object field that holds a list, or an Integrations path inside the item. */
export function isNestedList(el: any): boolean {
  const db = el?.dataBinding
  if (db && db.resolveMode === 'parent' && db.target === 'list' && db.field) return true
  return el?.gatewayBinding?.scope === 'item'
}

/** The items of a nested list container: null when `el` is not one, [] when its item has no such list. */
export function nestedItems(el: any, ctx: Ctx): any[] | null {
  if (!isNestedList(el)) return null
  if (!ctx) return []
  const db = el.dataBinding
  if (db && db.resolveMode === 'parent' && db.target === 'list' && db.field) return (nestedDataList(ctx, db.field, { limit: db.limit, filters: db.filters }) as any[] | null) ?? []
  const gb = el.gatewayBinding
  return (nestedGatewayList(ctx, gb.fieldPath, { limit: gb.limit, filters: gb.filters }) as any[] | null) ?? []
}

/** A nested path that holds one object (not a list) is a single record for the children, still aware of its parent. */
export function nestedSingle(el: any, ctx: Ctx): any | null {
  const gb = el?.gatewayBinding
  if (!ctx || gb?.scope !== 'item') return null
  const v = readItemPath(ctx, gb.fieldPath)
  return v && typeof v === 'object' && !Array.isArray(v) ? withParent(v as object, ctx) : null
}

/** The value of a Data Object field in the item (`^.field`: the item above). */
export function dataFieldOf(ctx: Ctx, field: string): unknown {
  const up = splitUp(ctx, field)
  return (up.record as Record<string, any> | undefined)?.attributes?.[up.path]
}

/** The value of a gateway binding in the item: strictly relative for a nested binding, as before for the others. */
export function gatewayFieldOf(ctx: Ctx, gb: { scope?: string | null; fieldPath: string }): unknown {
  return gb.scope === 'item' ? readItemPath(ctx, gb.fieldPath) : resolveFieldFromRecord(ctx as any, gb.fieldPath)
}
