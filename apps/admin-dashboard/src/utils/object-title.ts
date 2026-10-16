// The text that names an object where a person reads it (the tab, the header), instead of its key.
// Order: the field marked "tab title" in the class, then `title` / `name` / `label`, then the first text field that has a value.
// null when nothing qualifies (the caller falls back to the key).
interface TitleField { name: string; fieldType: string; tabTitle?: boolean }

const TEXT_TYPES = new Set(['input', 'textarea', 'email', 'urlSlug'])
const WELL_KNOWN = ['title', 'name', 'label']

function asText(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return null
}

export function objectTitle(fields: readonly TitleField[] | undefined, attributes: Record<string, unknown> | undefined): string | null {
  const attrs = attributes ?? {}
  const list = fields ?? []
  const marked = list.find((f) => f.tabTitle)
  if (marked) { const t = asText(attrs[marked.name]); if (t) return t }
  for (const name of WELL_KNOWN) { const t = asText(attrs[name]); if (t) return t }
  for (const f of list) {
    if (!TEXT_TYPES.has(f.fieldType)) continue
    const t = asText(attrs[f.name])
    if (t) return t
  }
  return null
}
