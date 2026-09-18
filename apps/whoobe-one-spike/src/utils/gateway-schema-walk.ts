// Shared by GatewayBindingPicker.vue (toolbar modal, precise editing) and
// GatewayPanel.vue (sidebar tab, discovery/drag-and-drop) so the inferred-
// schema-to-flat-field-list walk exists in exactly one place.
export interface FlatSchemaField {
  key: string
  path: string
  type: string
}

export function flattenSchemaFields(schema: Record<string, any> | null | undefined): FlatSchemaField[] {
  if (!schema) return []
  const out: FlatSchemaField[] = []
  function walk(obj: any, prefix: string) {
    if (!obj || typeof obj !== 'object') return
    const fields = obj.fields || (obj.type === 'object' ? [] : obj.items?.fields)
    if (!Array.isArray(fields)) return
    for (const f of fields) {
      const path = prefix ? `${prefix}.${f.key}` : f.key
      out.push({ key: f.key, path, type: f.type || 'any' })
      if (f.type === 'object' && f.fields) walk(f, path)
      if (f.type === 'array' && f.items?.fields) walk(f.items, path)
    }
  }
  walk(schema, '')
  return out
}

/** Given a route's schema and the currently-selected response fieldPath,
 *  returns the ARRAY ITEM's own top-level fields (relative keys, not full
 *  paths) if fieldPath resolves to an array - the candidate field list for
 *  GatewayBinding.filters, which are always relative to one item (e.g.
 *  "category", never "products.category"). Returns null when fieldPath
 *  doesn't point at an array, so the caller knows to hide the filters UI
 *  entirely (filtering a scalar/object result makes no sense). Pass '' for
 *  fieldPath to check the whole response itself. */
export function itemFieldsForArrayPath(schema: Record<string, any> | null | undefined, fieldPath: string): FlatSchemaField[] | null {
  if (!schema) return null

  function itemFieldsOf(node: any): FlatSchemaField[] | null {
    if (node?.type !== 'array' || !Array.isArray(node.items?.fields)) return null
    return node.items.fields.map((f: any) => ({ key: f.key, path: f.key, type: f.type || 'any' }))
  }

  if (!fieldPath) return itemFieldsOf(schema)

  const parts = fieldPath.split('.')
  let fields: any[] | undefined = schema.fields
  let node: any = null
  for (const part of parts) {
    node = fields?.find((f: any) => f.key === part)
    if (!node) return null
    fields = node.type === 'object' ? node.fields : node.type === 'array' ? node.items?.fields : undefined
  }
  return itemFieldsOf(node)
}
