import { describe, it, expect } from 'vitest'
import { isSelectionName, selectionKeys, selectionMatches, encodeSelectionKeys, decodeSelectionKeys, whoobeElementSchema } from './index.js'

describe('selection helpers', () => {
  it('names are letters, digits, - and _, starting with a letter', () => {
    for (const ok of ['category', 'cat_2', 'a-b', 'A']) expect(isSelectionName(ok), ok).toBe(true)
    for (const bad of ['', '1a', 'a b', 'a.b', 'x'.repeat(33), 5, null]) expect(isSelectionName(bad), String(bad)).toBe(false)
  })
  it('keys: one value, each value of a list, nothing for empty', () => {
    expect(selectionKeys('12')).toEqual(['12'])
    expect(selectionKeys(12)).toEqual(['12'])
    expect(selectionKeys(['a', 'b', '', null, 3])).toEqual(['a', 'b', '3'])
    for (const empty of [null, undefined, '', {}, []]) expect(selectionKeys(empty)).toEqual([])
  })
  it('matches the selection; with nothing selected it follows whenEmpty', () => {
    expect(selectionMatches(['12'], '12')).toBe(true)
    expect(selectionMatches(['a', 'b'], 'b')).toBe(true)
    expect(selectionMatches(['12'], '13')).toBe(false)
    expect(selectionMatches(['12'], null)).toBe(false)
    expect(selectionMatches(['12'], null, 'all')).toBe(true)
    expect(selectionMatches([], '12', 'all')).toBe(false)
  })
  it('keys survive an attribute round trip', () => {
    expect(decodeSelectionKeys(encodeSelectionKeys(['a', 'b c']))).toEqual(['a', 'b c'])
    expect(decodeSelectionKeys(encodeSelectionKeys([]))).toEqual([])
  })
})

describe('selection in the element schema', () => {
  const base = { id: 'x', type: 'container', tag: 'div' }
  it('accepts publish and listen, and keeps them', () => {
    const r = whoobeElementSchema.safeParse({ ...base, selection: { publish: { name: 'category', field: 'id' }, listen: { name: 'sub', field: 'parent', whenEmpty: 'all' } } })
    expect(r.success).toBe(true)
    expect((r as any).data.selection.listen.whenEmpty).toBe('all')
  })
  it('drops a malformed selection instead of failing the page', () => {
    for (const selection of [{ publish: { name: '1x', field: 'id' } }, { publish: { name: 'ok', field: '' } }, { listen: { name: 'ok', field: 'f', whenEmpty: 'first' } }, { listen: { name: '', field: '' } }]) {
      const r = whoobeElementSchema.safeParse({ ...base, selection })
      expect(r.success, JSON.stringify(selection)).toBe(true)
      expect((r as any).data.selection).toBeUndefined()
    }
  })
})

describe('selection references in binding parameters', () => {
  it('recognises {selection.name} and nothing else', async () => {
    const { selectionRefOf, bindingSelectionNames } = await import('./index.js')
    expect(selectionRefOf('{selection.category}')).toBe('category')
    expect(selectionRefOf(' {selection.cat-2} ')).toBe('cat-2')
    for (const other of ['{id}', 'selection.category', '{selection.}', '{selection.1x}', 'a{selection.x}', 5, null]) expect(selectionRefOf(other), String(other)).toBeNull()
    expect(bindingSelectionNames({ id: '{selection.category}', page: '{id}', q: '{selection.category}', x: '{selection.sub}' })).toEqual(['category', 'sub'])
    expect(bindingSelectionNames(null)).toEqual([])
  })
  it('substitutes the chosen values, or gives null while a needed selection is empty', async () => {
    const { substituteSelectionParams } = await import('./index.js')
    const chosen: Record<string, string> = { category: '12' }
    const get = (n: string) => chosen[n] ?? null
    expect(substituteSelectionParams({ id: '{selection.category}', lang: 'it', page: '{id}' }, get)).toEqual({ id: '12', lang: 'it', page: '{id}' })
    expect(substituteSelectionParams({ id: '{selection.sub}' }, get)).toBeNull()
    expect(substituteSelectionParams({ id: '{selection.category}' }, () => '')).toBeNull()
    expect(substituteSelectionParams(null, get)).toEqual({})
  })
})
