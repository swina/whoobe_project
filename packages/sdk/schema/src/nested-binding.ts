// Nested lists (docs/plans/cms/nested-bindings.md): a container inside a repeated item that repeats over an array which is part of
// THAT item (a category with its `products`, a product with its `variants`), and elements that read the fields of the item they sit in.
// The data is already in the parent item, so nothing is fetched. Pure functions, no DOM, shared by the renderer and the editor.
import type { DataBindingFilter } from './node.js'

/** How many lists may be nested in one another (categories > products > variants > colours > sizes). */
export const MAX_NESTED_DEPTH = 5

const PARENT = '$parent'

/** A copy of `item` that remembers the item it was taken from, so a field of the outer item can still be read with `^.field`. The link is
 *  not enumerable: it is not saved, not listed, not compared. */
export function withParent<T extends object>(item: T, parent: unknown): T {
  const copy = Array.isArray(item) ? ([...item] as unknown as T) : ({ ...item } as T)
  Object.defineProperty(copy, PARENT, { value: parent, enumerable: false })
  return copy
}

export function parentOf(record: unknown): unknown {
  return record && typeof record === 'object' ? (record as Record<string, unknown>)[PARENT] : undefined
}

/** How many items deep this record is (the item of a top-level list is 0). */
export function nestedDepth(record: unknown): number {
  let n = 0
  for (let r = parentOf(record); r !== undefined && n < 50; r = parentOf(r)) n++
  return n
}

/** Moves up one item per leading `^.`: `^.name` is the `name` of the item the current list sits in, `^.^.name` the one above. */
export function splitUp(record: unknown, path: string): { record: unknown; path: string } {
  let r = record
  let p = path
  while (p.startsWith('^.')) {
    r = parentOf(r)
    p = p.slice(2)
  }
  return { record: r, path: p }
}

/** Reads a dot path (`details.size`, `tags[0]`) from a record, strictly: no guessing of a shorter path, and nothing through a list
 *  (a path that meets an array before its end gives undefined). `^.` prefixes go up first. */
export function readItemPath(record: unknown, path: string): unknown {
  const up = splitUp(record, path)
  if (up.record === undefined || up.record === null || !up.path) return up.path ? undefined : up.record
  let current: unknown = up.record
  for (const part of up.path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object' || Array.isArray(current)) return undefined
    const m = /^([^[\]]+)\[(\d+)\]$/.exec(part)
    if (m) {
      const arr = (current as Record<string, unknown>)[m[1]]
      if (!Array.isArray(arr)) return undefined
      current = arr[Number(m[2])]
    } else {
      current = (current as Record<string, unknown>)[part]
    }
  }
  return current
}

/** Same operators as the filters of a list result (gateway) and of a Data Class query. All must hold. */
export function applyItemFilters(items: readonly unknown[], filters: readonly DataBindingFilter[] | null | undefined): unknown[] {
  const active = (filters ?? []).filter((f) => f && typeof f.field === 'string' && f.field !== '') // a filter being typed has no field yet
  if (!active.length) return [...items]
  return items.filter((item) =>
    active.every((f) => {
      const value = readItemPath(item, f.field)
      switch (f.operator) {
        case 'eq': return value === f.value || (value != null && f.value != null && String(value) === String(f.value))
        case 'neq': return !(value === f.value || (value != null && f.value != null && String(value) === String(f.value)))
        case 'in': return Array.isArray(f.value) ? f.value.map(String).includes(String(value)) : String(value) === String(f.value)
        case 'contains': return String(value ?? '').toLowerCase().includes(String(f.value ?? '').toLowerCase())
        case 'gt': return Number(value) > Number(f.value)
        case 'lt': return Number(value) < Number(f.value)
        default: return true
      }
    }),
  )
}

export interface NestedListOptions {
  limit?: number | null
  filters?: readonly DataBindingFilter[] | null
}

function finish(items: unknown[], parent: unknown, wrap: (item: object) => object, o: NestedListOptions): unknown[] | null {
  if (nestedDepth(parent) + 1 >= MAX_NESTED_DEPTH) return null
  let list = items.filter((i): i is object => !!i && typeof i === 'object' && !Array.isArray(i))
  list = applyItemFilters(list, o.filters) as object[]
  if (typeof o.limit === 'number' && o.limit > 0) list = list.slice(0, o.limit)
  return list.map((item) => withParent(wrap(item), parent))
}

/** The items of the list found at `path` inside `parent` (an Integrations item), each one aware of `parent`; null when there is no such
 *  list or the nesting is too deep. */
export function nestedGatewayList(parent: unknown, path: string, options: NestedListOptions = {}): unknown[] | null {
  const value = readItemPath(parent, path)
  return Array.isArray(value) ? finish(value, up(parent, path), (i) => i, options) : null
}

/** The same for a list held by a field of a Data Object (a block, a field collection): each item becomes a record whose `attributes` are the
 *  item's own fields, so the elements inside bind to it like to any Data Object. */
export function nestedDataList(parent: unknown, field: string, options: NestedListOptions = {}): unknown[] | null {
  const upd = splitUp(parent, field)
  const attrs = (upd.record as { attributes?: Record<string, unknown> } | undefined)?.attributes
  const value = attrs ? readItemPath(attrs, upd.path) : undefined
  return Array.isArray(value) ? finish(value, upd.record, (i) => ({ attributes: i }), options) : null
}

// the record the list sits in: the one reached after the `^.` steps of the path
function up(parent: unknown, path: string): unknown { return splitUp(parent, path).record }
