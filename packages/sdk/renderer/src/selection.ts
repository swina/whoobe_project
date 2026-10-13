// Browser side of the linked bindings (docs/plans/cms/linked-bindings.md): the items of a repeater that publishes a selection carry
// `data-whoobe-select="name"` and `data-whoobe-value`; the items of a repeater that listens carry `data-whoobe-listen="name"`, `data-whoobe-key`
// (the values to match, one per line) and, to show everything while nothing is selected, `data-whoobe-when-empty="all"` (walk.ts writes them).
// One handler for the whole document, so it works the same under React, Vue, Svelte and plain Alpine pages and nothing is set per item.

import { decodeSelectionKeys, selectionMatches } from '@whoobe-cms/schema'

/** The selected value per name; null = nothing selected. Pure: no DOM. */
export function createSelectionStore() {
  const values = new Map<string, string>()
  const listeners = new Set<(name: string, value: string | null) => void>()
  return {
    get: (name: string): string | null => values.get(name) ?? null,
    /** Returns true when the selection changed. An empty value clears it. */
    set(name: string, value: string | null): boolean {
      const next = value === null || value === '' ? null : value
      if ((values.get(name) ?? null) === next) return false
      if (next === null) values.delete(name)
      else values.set(name, next)
      for (const l of listeners) l(name, next)
      return true
    },
    subscribe(fn: (name: string, value: string | null) => void): () => void { listeners.add(fn); return () => { listeners.delete(fn) } },
  }
}

/** Does an item that listens (its key attribute and its "when empty" attribute) show for this selection? */
export function listenerVisible(keyAttr: string | null, whenEmptyAttr: string | null, selected: string | null): boolean {
  return selectionMatches(decodeSelectionKeys(keyAttr ?? ''), selected, whenEmptyAttr === 'all' ? 'all' : 'none')
}

export interface SelectionHandle {
  get(name: string): string | null
  /** Sets (or, with null or '', clears) a selection, as a click would: URL and `whoobe-select` event included. */
  set(name: string, value: string | null): void
  /** Starts watching a name that no item of the page carries (a dynamic list waits for it): the page address supplies its first value. */
  track(name: string): void
  /** Calls `fn` at every change of a selection (also the first value read from the address). Returns the way to stop. */
  subscribe(fn: (name: string, value: string | null) => void): () => void
  destroy(): void
}

export interface SelectionOptions {
  /** Keep the selection in the URL (`?name=value`), pushing a history entry per change. Default true. */
  url?: boolean
}

const mounted = new WeakMap<object, { handle: SelectionHandle; uses: number }>()

/**
 * Starts the selection for a document. Safe to call from several components or twice (React strict mode): one handler is shared and the
 * last `destroy()` removes it. Does nothing outside a browser.
 */
export function mountSelection(doc?: Document, options: SelectionOptions = {}): SelectionHandle {
  const d = doc ?? (typeof document !== 'undefined' ? document : undefined)
  if (!d) return { get: () => null, set: () => undefined, track: () => undefined, subscribe: () => () => undefined, destroy: () => undefined }
  const existing = mounted.get(d)
  if (existing) {
    existing.uses++
    return releasing(d, existing.handle)
  }
  const useUrl = options.url !== false
  const store = createSelectionStore()
  const seen = new Set<string>()
  const win = d.defaultView
  const eventFor = (name: string, value: string | null): void => {
    d.dispatchEvent(new CustomEvent('whoobe-select', { detail: { name, value }, bubbles: true }))
  }

  const urlValue = (name: string): string | null => (win ? new URLSearchParams(win.location.search).get(name) : null)
  const writeUrl = (name: string, value: string | null): void => {
    if (!useUrl || !win) return
    const url = new URL(win.location.href)
    if (value === null) url.searchParams.delete(name)
    else url.searchParams.set(name, value)
    win.history.pushState(win.history.state, '', url)
  }

  /** Brings every item in line with the selection. Cheap: only touches an attribute whose value changes. */
  function apply(): void {
    // a name met for the first time starts from the URL, so a shared link opens with the choice made
    d!.querySelectorAll<HTMLElement>('[data-whoobe-select],[data-whoobe-listen]').forEach((el) => {
      const name = el.getAttribute('data-whoobe-select') ?? el.getAttribute('data-whoobe-listen') ?? ''
      if (!seen.has(name)) { seen.add(name); if (useUrl) store.set(name, urlValue(name)) }
    })
    d!.querySelectorAll<HTMLElement>('[data-whoobe-select]').forEach((el) => {
      const name = el.getAttribute('data-whoobe-select') ?? ''
      const value = el.getAttribute('data-whoobe-value') ?? ''
      const on = value !== '' && store.get(name) === value
      if (!el.hasAttribute('role') && !/^(A|BUTTON|INPUT)$/.test(el.tagName)) el.setAttribute('role', 'button')
      if (!el.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT)$/.test(el.tagName)) el.setAttribute('tabindex', '0')
      const flag = on ? 'true' : 'false'
      if (el.getAttribute('data-whoobe-selected') !== flag) { el.setAttribute('data-whoobe-selected', flag); el.setAttribute('aria-pressed', flag) }
    })
    d!.querySelectorAll<HTMLElement>('[data-whoobe-listen]').forEach((el) => {
      const show = listenerVisible(el.getAttribute('data-whoobe-key'), el.getAttribute('data-whoobe-when-empty'), store.get(el.getAttribute('data-whoobe-listen') ?? ''))
      const hidden = el.style.getPropertyValue('display') === 'none'
      if (show && hidden) el.style.removeProperty('display')
      else if (!show && !hidden) el.style.setProperty('display', 'none', 'important')
    })
  }

  function choose(el: Element): void {
    const name = el.getAttribute('data-whoobe-select') ?? ''
    const value = el.getAttribute('data-whoobe-value') ?? ''
    handle.set(name, value === '' || store.get(name) === value ? null : value) // the chosen item again, or an empty value, clears it
  }
  const onClick = (e: Event): void => {
    const el = (e.target as Element | null)?.closest?.('[data-whoobe-select]')
    if (el) choose(el)
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const el = (e.target as Element | null)?.closest?.('[data-whoobe-select]')
    if (!el || /^(A|BUTTON|INPUT)$/.test(el.tagName)) return // a real control already reacts to the key
    e.preventDefault()
    choose(el)
  }
  const onPop = (): void => {
    for (const name of seen) store.set(name, urlValue(name))
    apply()
  }

  let frame = 0
  const schedule = (): void => {
    if (frame || !win) return
    frame = win.requestAnimationFrame(() => { frame = 0; apply() })
  }
  const observer = typeof MutationObserver !== 'undefined' ? new MutationObserver(schedule) : null
  observer?.observe(d.documentElement, { childList: true, subtree: true })

  const handle: SelectionHandle = {
    get: (name) => store.get(name),
    track(name) {
      if (seen.has(name)) return
      seen.add(name)
      if (useUrl) store.set(name, urlValue(name))
    },
    subscribe: (fn) => store.subscribe(fn),
    set(name, value) {
      if (!store.set(name, value)) return
      writeUrl(name, store.get(name))
      apply()
      eventFor(name, store.get(name))
    },
    destroy() {
      d.removeEventListener('click', onClick)
      d.removeEventListener('keydown', onKey as EventListener)
      win?.removeEventListener('popstate', onPop)
      observer?.disconnect()
      if (frame && win) win.cancelAnimationFrame(frame)
      mounted.delete(d)
    },
  }
  d.addEventListener('click', onClick)
  d.addEventListener('keydown', onKey as EventListener)
  win?.addEventListener('popstate', onPop)
  mounted.set(d, { handle, uses: 1 })
  apply()
  return releasing(d, handle)
}

/** A handle whose destroy() only counts one use down; the shared handler goes with the last. */
function releasing(d: object, shared: SelectionHandle): SelectionHandle {
  let released = false
  return {
    get: shared.get,
    set: shared.set,
    track: shared.track,
    subscribe: shared.subscribe,
    destroy() {
      if (released) return
      released = true
      const entry = mounted.get(d)
      if (entry && --entry.uses <= 0) shared.destroy()
    },
  }
}
