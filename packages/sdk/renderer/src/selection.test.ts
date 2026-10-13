import { describe, it, expect } from 'vitest'
import { createSelectionStore, listenerVisible, mountSelection } from './selection.js'

describe('selection store', () => {
  it('holds a value per name, reports changes and clears with null or empty', () => {
    const s = createSelectionStore()
    const seen: Array<[string, string | null]> = []
    s.subscribe((n, v) => seen.push([n, v]))
    expect(s.get('category')).toBeNull()
    expect(s.set('category', '12')).toBe(true)
    expect(s.set('category', '12')).toBe(false)
    expect(s.set('other', 'x')).toBe(true)
    expect(s.get('category')).toBe('12')
    expect(s.set('category', '')).toBe(true)
    expect(s.get('category')).toBeNull()
    expect(s.set('category', null)).toBe(false)
    expect(seen).toEqual([['category', '12'], ['other', 'x'], ['category', null]])
  })
  it('stops telling a listener that unsubscribed', () => {
    const s = createSelectionStore()
    let n = 0
    const off = s.subscribe(() => { n++ })
    s.set('a', '1'); off(); s.set('a', '2')
    expect(n).toBe(1)
  })
})

describe('listenerVisible', () => {
  it('shows an item whose keys contain the selection', () => {
    expect(listenerVisible('12', null, '12')).toBe(true)
    expect(listenerVisible('a\nb', null, 'b')).toBe(true)
    expect(listenerVisible('12', null, '13')).toBe(false)
  })
  it('with nothing selected: hidden, unless the item says to show all', () => {
    expect(listenerVisible('12', null, null)).toBe(false)
    expect(listenerVisible('12', 'all', null)).toBe(true)
    expect(listenerVisible(null, 'all', null)).toBe(true)
    expect(listenerVisible(null, null, '12')).toBe(false)
  })
})

describe('mountSelection outside a browser', () => {
  it('does nothing and returns a harmless handle', () => {
    const h = mountSelection(undefined)
    expect(h.get('x')).toBeNull()
    h.set('x', '1')
    h.destroy()
  })
})
