// Linked bindings (docs/plans/cms/linked-bindings.md): a named selection that the items of one repeater publish when they are clicked and
// that another repeater listens to, to show only the related records (catalogue > categories > products). Pure functions, no DOM.

/** The items of this repeater set the selection `name` to the value of their `field`; a repeater that listens to `name` shows the items whose
 *  own `field` has that value. A repeater can do both. */
export interface ElementSelection {
  publish?: { name: string; field: string } | null
  listen?: { name: string; field: string; /** with nothing selected: show no item (default) or every item */ whenEmpty?: 'none' | 'all' } | null
}

/** The name is also the URL parameter (`?category=12`): letters, digits, `-` and `_`, starting with a letter. */
export const SELECTION_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/

export const isSelectionName = (name: unknown): name is string => typeof name === 'string' && SELECTION_NAME.test(name)

/** The values an item offers to a selection: a number or text gives one, a list (tags) gives each of its values, nothing gives none. */
export function selectionKeys(value: unknown): string[] {
  const one = (v: unknown): string | null => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') && String(v) !== '' ? String(v) : null
  if (Array.isArray(value)) return value.map(one).filter((v): v is string => v !== null)
  const k = one(value)
  return k === null ? [] : [k]
}

/** Is an item with these keys shown for the current selection (null = nothing selected)? */
export function selectionMatches(keys: readonly string[], selected: string | null, whenEmpty: 'none' | 'all' = 'none'): boolean {
  if (selected === null || selected === '') return whenEmpty === 'all'
  return keys.includes(selected)
}

/** Encoding of the keys in a DOM attribute (`data-whoobe-key`): a newline cannot be part of a key. */
export const encodeSelectionKeys = (keys: readonly string[]): string => keys.map((k) => k.replace(/\n/g, ' ')).join('\n')
export const decodeSelectionKeys = (text: string): string[] => (text === '' ? [] : text.split('\n'))

// A binding can take its parameters from a selection: `params: { id: '{selection.category}' }` on an Integrations route such as
// `catalogue/category/{id}` fetches the record of the category the visitor chose (docs/plans/cms/linked-bindings.md, "dynamic bindings").
const SELECTION_REF = /^\{selection\.([A-Za-z][A-Za-z0-9_-]{0,31})\}$/

/** The selection a parameter value refers to (`{selection.category}` -> `category`), or null for any other value. */
export function selectionRefOf(value: unknown): string | null {
  const m = typeof value === 'string' ? SELECTION_REF.exec(value.trim()) : null
  return m ? m[1] : null
}

/** The selections a binding's parameters depend on, without duplicates. Empty: the binding does not depend on a selection. */
export function bindingSelectionNames(params: Record<string, unknown> | null | undefined): string[] {
  const names = new Set<string>()
  for (const v of Object.values(params ?? {})) {
    const n = selectionRefOf(v)
    if (n) names.add(n)
  }
  return [...names]
}

/** The parameters with every `{selection.x}` replaced by the chosen value; null while one of the selections they need is empty. */
export function substituteSelectionParams(params: Record<string, string> | null | undefined, get: (name: string) => string | null): Record<string, string> | null {
  if (!params) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(params)) {
    const name = selectionRefOf(v)
    if (name === null) { out[k] = v; continue }
    const chosen = get(name)
    if (chosen === null || chosen === '') return null
    out[k] = chosen
  }
  return out
}
