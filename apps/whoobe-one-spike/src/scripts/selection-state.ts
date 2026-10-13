// Linked bindings in the editor's own renderer (docs/plans/cms/linked-bindings.md): the selection per name, reactive, shared by every
// BlockContainerPreview in the window. The published sites do the same job in the DOM (`mountSelection()` of @whoobe-cms/renderer); here the
// repeaters are Vue components, so the list is filtered before its own pagination instead.
import { reactive } from 'vue'

const values = reactive<Record<string, string>>({})
const started = new Set<string>()

function urlValue(name: string): string | null {
  try { return new URLSearchParams(window.location.search).get(name) } catch { return null }
}

/** The selected value of `name`, or null. With `url`, a name met for the first time starts from the page address (?name=value). */
export function getSelection(name: string, url: boolean): string | null {
  if (url && !started.has(name)) {
    started.add(name)
    const v = urlValue(name)
    if (v) values[name] = v
  }
  return values[name] ?? null
}

/** Sets (or, with null or '', clears) a selection. With `url`, the address follows and the back button works (popstate below). */
export function setSelection(name: string, value: string | null, url: boolean): void {
  const next = value === null || value === '' ? null : value
  if (next === null) delete values[name]
  else values[name] = next
  if (url) {
    try {
      const u = new URL(window.location.href)
      if (next === null) u.searchParams.delete(name)
      else u.searchParams.set(name, next)
      window.history.pushState(window.history.state, '', u)
    } catch { /* an address that cannot be changed (sandboxed frame): the selection still works */ }
  }
  document.dispatchEvent(new CustomEvent('whoobe-select', { detail: { name, value: next }, bubbles: true }))
}

/** Forgets every selection: the Preview starts clean each time it opens. */
export function resetSelections(): void {
  for (const k of Object.keys(values)) delete values[k]
  started.clear()
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    for (const name of started) {
      const v = urlValue(name)
      if (v) values[name] = v
      else delete values[name]
    }
  })
}
