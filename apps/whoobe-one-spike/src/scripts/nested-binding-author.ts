// Authoring side of the nested lists (docs/plans/cms/nested-bindings.md): when an Integrations field is bound to an element that sits inside a
// list of the same response, the binding is saved relative to the item it sits in, so a list inside a list repeats over the list of its own item
// and the elements inside read the fields of their own item. Paths stay as chosen in the pickers (absolute, as the response shows them).
import { MAX_NESTED_DEPTH, bindingSelectionNames } from '@whoobe-cms/schema'

type Node = Record<string, any>

/** The nodes from the root down to the parent of `id` (the root included), or null when `id` is not in the tree. */
export function ancestorsOf(root: Node | null | undefined, id: string): Node[] | null {
  if (!root) return null
  const walk = (n: Node, chain: Node[]): Node[] | null => {
    if (n.id === id) return chain
    for (const c of n.blocks ?? []) {
      const r = walk(c, [...chain, n])
      if (r) return r
    }
    return null
  }
  return walk(root, [])
}

interface ListLevel { endpointName?: string; routePath?: string; path: string }

/** The Integrations lists the node sits in, outermost first, each with its full path in the response. */
export function listLevels(ancestors: Node[]): ListLevel[] {
  const levels: ListLevel[] = []
  for (const a of ancestors) {
    const gb = a.gatewayBinding
    if (!gb || a.type !== 'container') continue
    if (gb.scope === 'item') {
      const outer = levels[levels.length - 1]
      if (!outer) continue
      levels.push({ endpointName: outer.endpointName, routePath: outer.routePath, path: [outer.path, gb.fieldPath].filter(Boolean).join('.') })
    } else if (gb.endpointName) {
      levels.push({ endpointName: gb.endpointName, routePath: gb.routePath, path: gb.fieldPath ?? '' })
    }
  }
  return levels
}

/**
 * `binding` as chosen in a picker (endpoint, route, path in the response), turned into a binding relative to the item when the node sits in a
 * list of that same response and the path is inside it: `products` for a list in a category, `title` for a field of its item, `^.title` for a
 * field of the item above. Anything else is returned unchanged.
 */
export function toRelativeGatewayBinding<T extends { endpointName?: string; routePath?: string; fieldPath: string }>(root: Node | null | undefined, nodeId: string, binding: T): T {
  const ancestors = ancestorsOf(root, nodeId)
  // a list that takes the visitor's selection is its own request (its own route and parameters): never relative to an item
  if (!ancestors || (binding as any).scope === 'item' || bindingSelectionNames((binding as any).params).length) return binding
  const levels = listLevels(ancestors).filter((l) => l.endpointName === binding.endpointName && l.routePath === binding.routePath)
  if (!levels.length) return binding
  if (levels.length >= MAX_NESTED_DEPTH) return binding
  const path = binding.fieldPath ?? ''
  // the nearest list that contains the path; every level skipped on the way out is one `^.`
  for (let i = levels.length - 1; i >= 0; i--) {
    const base = levels[i].path
    const inside = base === '' ? path !== '' : path.startsWith(base + '.')
    if (!inside) continue
    const rest = base === '' ? path : path.slice(base.length + 1)
    const { endpointName: _e, routePath: _r, bindingId: _b, ...keep } = binding as any
    return { ...keep, scope: 'item', fieldPath: '^.'.repeat(levels.length - 1 - i) + rest } as T
  }
  return binding
}

// ---- Data Objects: lists held by a field of the object (a block, a field collection) ----

export interface DataScopeInfo {
  /** The Data Class of the object the node sits in. */
  className: string
  /** Set when the node sits inside a nested list: the field of the object that holds it (then the fields in scope are those of its items). */
  listField: string | null
}

/** What the node's Data Object context is: the class of the nearest bound container above it, and the nested list in between, if any. */
export function dataScopeOf(root: Node | null | undefined, nodeId: string): DataScopeInfo | null {
  const ancestors = ancestorsOf(root, nodeId)
  if (!ancestors) return null
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const db = ancestors[i].dataBinding
    if (!db || ancestors[i].type !== 'container' || !db.className) continue
    if (db.resolveMode === 'parent' && db.target === 'list') {
      // the nearest list is nested: its class is the one of the object above it
      return { className: db.className, listField: db.field ?? null }
    }
    if (db.field && db.target !== 'list') continue
    return { className: db.className, listField: null }
  }
  return null
}

interface FieldDef { name: string; title?: string; fieldType: string; blockFields?: FieldDef[]; collectionFields?: FieldDef[]; collectionTypes?: { name: string; fields: FieldDef[] }[] }

/** The fields the items of a list field have: those of a block, or of a field collection (every type's, by name, when there are several). */
export function itemFieldsOf(field: FieldDef | undefined): FieldDef[] {
  if (!field) return []
  if (field.fieldType === 'block') return field.blockFields ?? []
  if (field.fieldType !== 'fieldcollections') return []
  if (field.collectionTypes?.length) {
    const byName = new Map<string, FieldDef>()
    for (const t of field.collectionTypes) for (const f of t.fields) if (!byName.has(f.name)) byName.set(f.name, f)
    return [...byName.values()]
  }
  return field.collectionFields ?? []
}

/** The fields in scope for an element: the class's own, or, inside a nested list, those of its items (follows the chain of lists). */
export function fieldsInScope(root: Node | null | undefined, nodeId: string, classFields: FieldDef[]): FieldDef[] {
  const ancestors = ancestorsOf(root, nodeId) ?? []
  const lists = ancestors.filter((a) => a.type === 'container' && a.dataBinding?.resolveMode === 'parent' && a.dataBinding?.target === 'list' && a.dataBinding.field)
  let fields = classFields
  for (const l of lists) fields = itemFieldsOf(fields.find((f) => f.name === l.dataBinding.field))
  return fields
}
