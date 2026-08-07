/**
 * Framework-agnostic data binding model + resolution helpers for the
 * whoobe-one editor's Element tree. Pure functions only - no Vue, Pinia,
 * or API client coupling - so the same logic can be reused in the editor
 * (apps/whoobe-one-spike), a static-site generator, or SSR without
 * importing any frontend framework.
 *
 * The Element tree is represented as plain JSON objects: a node has a
 * `blocks: ElementNode[]` array for children and an optional
 * `dataBinding` field. This module deliberately does NOT declare the full
 * Element type (that lives in the editor app) - it only needs the two
 * fields it reads.
 */

/** A filter condition on a data object's attribute, for query bindings. */
export interface DataBindingFilter {
  field: string
  operator: 'eq' | 'neq' | 'in' | 'contains' | 'gt' | 'lt'
  value: unknown
  valueIsBinding?: boolean
}

/** The link between an editor Element and a data object (or field of one). */
export interface ElementDataBinding {
  className: string
  objectId?: string | null
  field?: string | null
  target: string
  dataKey?: string | null
  resolveMode: 'explicit' | 'first' | 'query' | 'parent' | 'currentPage'
  filters?: DataBindingFilter[]
  locale?: string | null
}

/** Minimal data-object shape the resolver reads (a subset of the full
 *  DataObjectRecord) - kept deliberately loose so the pure resolver doesn't
 *  depend on the DB records module. */
export interface ResolvedDataObject {
  id: string
  attributes?: Record<string, unknown>
}

/** The two fields of an Element node this module reads. */
export interface BindableNode {
  id?: string
  blocks?: BindableNode[]
  dataBinding?: ElementDataBinding | null
}

/** Walk a node tree, collecting every element that has a dataBinding.
 *  Returns a flat list of `{ node, binding }` pairs. */
export function collectBindings(root: BindableNode): Array<{ node: BindableNode; binding: ElementDataBinding }> {
  const out: Array<{ node: BindableNode; binding: ElementDataBinding }> = []
  const walk = (node: BindableNode): void => {
    if (node.dataBinding) {
      out.push({ node, binding: node.dataBinding })
    }
    for (const child of node.blocks ?? []) walk(child)
  }
  walk(root)
  return out
}

/** Client-side filter matching for dynamic query bindings. */
export function applyFilters(objects: ResolvedDataObject[], filters: DataBindingFilter[]): ResolvedDataObject[] {
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

/** Extract a binding's target field value from resolved data object(s).
 *  - No `field`: returns the object(s) as-is (collection/container binding).
 *  - With `field` + a single object: returns that attribute value.
 *  - With `field` + an array: returns an array of that attribute's values. */
export function resolveFieldValue(
  resolved: ResolvedDataObject | ResolvedDataObject[] | null,
  binding: ElementDataBinding
): unknown {
  if (!resolved) return null
  if (binding.field) {
    const field = binding.field
    if (Array.isArray(resolved)) {
      return resolved.map((r) => (r.attributes as any)?.[field])
    }
    return (resolved as ResolvedDataObject).attributes?.[field]
  }
  return resolved
}