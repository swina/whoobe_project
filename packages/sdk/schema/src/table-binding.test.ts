import { describe, it, expect } from 'vitest'
import { columnsFromRecords, pageCount, pageRows, paginationOf, plainCellText, tableCellValue, tableRecords } from './table-binding.js'

const obj = (attributes: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ id: 'x', updatedAt: '2026-01-02', attributes, ...extra })

describe('tableCellValue', () => {
  it('reads a Data Object attribute, then a system field, and a gateway item by path', () => {
    const o = obj({ title: 'A', price: 9, tags: ['x', 'y'] })
    expect(tableCellValue(o, 'title')).toBe('A')
    expect(tableCellValue(o, 'updatedAt')).toBe('2026-01-02')
    expect(tableCellValue({ name: 'N', address: { city: 'Rome' }, items: [{ sku: 's1' }] }, 'address.city')).toBe('Rome')
    expect(tableCellValue({ items: [{ sku: 's1' }, { sku: 's2' }] }, 'items[1].sku')).toBe('s2')
  })
  it('an attribute wins over a system field of the same name', () => {
    expect(tableCellValue(obj({ id: 'mine' }), 'id')).toBe('mine')
  })
  it('is undefined for a missing path, an empty field or a non-object record', () => {
    for (const [r, f] of [[obj({}), 'nope'], [obj({}), ''], [null, 'a'], ['str', 'a'], [[], 'a'], [{ a: 1 }, 'a.b'], [{ a: [1] }, 'a[5]'], [{ a: 1 }, 'a[0]']] as const) {
      expect(tableCellValue(r, f), `${JSON.stringify(r)} ${f}`).toBeUndefined()
    }
  })
  it('never reaches the prototype chain', () => {
    const polluted = JSON.parse('{"__proto__":{"x":1},"a":{"__proto__":{"y":2}}}')
    for (const f of ['__proto__', 'constructor', 'constructor.name', 'a.__proto__', 'a.__proto__.y', 'toString', 'hasOwnProperty']) {
      expect(tableCellValue(polluted, f), f).toBeUndefined()
      expect(tableCellValue({ a: 1 }, f), f).toBeUndefined()
    }
  })
})

describe('plainCellText and tableRecords', () => {
  it('formats scalars, joins lists of scalars, hides objects', () => {
    expect([plainCellText('a'), plainCellText(3), plainCellText(true), plainCellText(false), plainCellText(null), plainCellText(undefined)]).toEqual(['a', '3', 'true', 'false', '', ''])
    expect(plainCellText(['a', 2, { x: 1 }, true])).toBe('a, 2, true')
    expect(plainCellText({ a: 1 })).toBe('')
  })
  it('only an array is a list of rows', () => {
    expect(tableRecords([1, 2])).toEqual([1, 2])
    for (const v of [null, undefined, {}, 'x', 4]) expect(tableRecords(v)).toEqual([])
  })
})

describe('columnsFromRecords', () => {
  it('takes the scalar attributes of the first Data Object, with readable headers, skipping objects', () => {
    const cols = columnsFromRecords([obj({ firstName: 'A', created_at: 'x', meta: { a: 1 }, active: true, note: null })])
    expect(cols).toEqual([{ field: 'firstName', header: 'First Name' }, { field: 'created_at', header: 'Created at' }, { field: 'active', header: 'Active' }, { field: 'note', header: 'Note' }])
  })
  it('takes the scalar keys of a gateway item and caps the number of columns', () => {
    expect(columnsFromRecords([{ sku: 1, nested: {}, name: 'n' }]).map((c) => c.field)).toEqual(['sku', 'name'])
    const wide = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`c${i}`, i]))
    expect(columnsFromRecords([wide])).toHaveLength(12)
    expect(columnsFromRecords([wide], 3)).toHaveLength(3)
  })
  it('is empty without a usable record, and ignores prototype keys', () => {
    expect(columnsFromRecords([])).toEqual([])
    expect(columnsFromRecords([null, 'x'])).toEqual([])
    expect(columnsFromRecords([JSON.parse('{"__proto__":1,"a":1}')]).map((c) => c.field)).toEqual(['a'])
  })
})

describe('pagination', () => {
  const items = Array.from({ length: 23 }, (_, i) => i + 1)
  it('reads the settings of either binding, with defaults and bounds', () => {
    expect(paginationOf(null)).toMatchObject({ rowsPerPage: 0, mode: 'standard', loadMoreText: 'More' })
    expect(paginationOf({ rowsPerPage: 10, paginationMode: 'lazyload', loadMoreText: ' Show more ' })).toMatchObject({ rowsPerPage: 10, mode: 'lazyload', loadMoreText: 'Show more' })
    for (const bad of [-5, 0, 'abc', NaN, undefined]) expect(paginationOf({ rowsPerPage: bad }).rowsPerPage, String(bad)).toBe(0)
    expect(paginationOf({ rowsPerPage: 5000 }).rowsPerPage).toBe(1000)
    expect(paginationOf({ rowsPerPage: '15' }).rowsPerPage).toBe(15)
    expect(paginationOf({ paginationMode: 'weird' }).mode).toBe('standard')
  })
  it('counts pages', () => {
    expect([pageCount(23, 10), pageCount(20, 10), pageCount(0, 10), pageCount(5, 0)]).toEqual([3, 2, 1, 1])
  })
  it('standard mode returns the page asked, clamped to the range', () => {
    const p = { rowsPerPage: 10, mode: 'standard' as const }
    expect(pageRows(items, p, 1, 0)).toEqual(items.slice(0, 10))
    expect(pageRows(items, p, 3, 0)).toEqual([21, 22, 23])
    expect(pageRows(items, p, 99, 0)).toEqual([21, 22, 23])
    expect(pageRows(items, p, 0, 0)).toEqual(items.slice(0, 10))
    expect(pageRows(items, p, NaN, 0)).toEqual(items.slice(0, 10))
  })
  it('lazyload returns the first rows up to what was asked, at least one page', () => {
    const p = { rowsPerPage: 10, mode: 'lazyload' as const }
    expect(pageRows(items, p, 1, 0)).toHaveLength(10)
    expect(pageRows(items, p, 1, 20)).toHaveLength(20)
    expect(pageRows(items, p, 1, 999)).toHaveLength(23)
  })
  it('without pagination, everything', () => {
    expect(pageRows(items, { rowsPerPage: 0, mode: 'standard' }, 2, 0)).toBe(items)
  })
})

import { appendMissingColumns, missingColumnFields, toggleColumnField } from './table-binding.js'

describe('editing the columns', () => {
  const col = (field: string, extra: object = {}) => ({ id: field, field, header: field.toUpperCase(), ...extra })
  const fields = [{ field: 'a', header: 'A' }, { field: 'b', header: 'B' }, { field: 'c', header: 'C' }]
  it('toggling a field adds a column at the end or removes it, without touching the others', () => {
    const base = [col('a', { cellClass: 'x', transform: { type: 'date' } }), col('b')]
    const added = toggleColumnField(base, 'c', () => col('c'))
    expect(added.map((c) => c.field)).toEqual(['a', 'b', 'c'])
    expect(added[0]).toBe(base[0])
    expect(toggleColumnField(added, 'a', () => col('a')).map((c) => c.field)).toEqual(['b', 'c'])
    expect(base).toHaveLength(2)
  })
  it('never removes the last column', () => {
    const one = [col('a')]
    expect(toggleColumnField(one, 'a', () => col('a'))).toBe(one)
  })
  it('lists and appends only the missing fields, keeping what the author set', () => {
    const base = [col('b', { header: 'My title', transform: { type: 'number' } })]
    expect(missingColumnFields(base, fields).map((f) => f.field)).toEqual(['a', 'c'])
    const out = appendMissingColumns(base, fields, (f) => col(f.field, { header: f.header }))
    expect(out.map((c) => c.field)).toEqual(['b', 'a', 'c'])
    expect(out[0]).toBe(base[0])
    expect(appendMissingColumns(out, fields, (f) => col(f.field))).toHaveLength(3)
  })
})

import { compareCellValues, matchesTerms, nextSort, normalizeSearchText, searchTerms, sortRecords } from './table-binding.js'

describe('sorting', () => {
  it('a click goes unsorted, ascending, descending, unsorted; another column starts again', () => {
    const a = nextSort(null, 'x')
    expect(a).toEqual({ field: 'x', direction: 'asc' })
    const d = nextSort(a, 'x')
    expect(d).toEqual({ field: 'x', direction: 'desc' })
    expect(nextSort(d, 'x')).toBeNull()
    expect(nextSort(d, 'y')).toEqual({ field: 'y', direction: 'asc' })
  })
  it('compares numbers as numbers, text with numbers inside in natural order, ignoring case and accents', () => {
    expect(compareCellValues(2, 10)).toBeLessThan(0)
    expect(compareCellValues('item 2', 'item 10')).toBeLessThan(0)
    expect(compareCellValues('Élan', 'elan')).toBe(0)
    expect(compareCellValues('b', 'A')).toBeGreaterThan(0)
    expect(compareCellValues(false, true)).toBeLessThan(0)
    expect(compareCellValues('9', 10)).toBeLessThan(0)
  })
  const rows = [
    { attributes: { n: 10, t: 'b' } }, { attributes: { n: 2, t: 'A' } }, { attributes: { n: null, t: 'c' } },
    { attributes: { n: 2, t: '' } }, { attributes: { t: 'd' } },
  ]
  it('sorts by a field in both directions, keeps equal values in their order, and puts empty values last', () => {
    expect(sortRecords(rows, { field: 'n', direction: 'asc' }).map((r) => r.attributes.t)).toEqual(['A', '', 'b', 'c', 'd'])
    expect(sortRecords(rows, { field: 'n', direction: 'desc' }).map((r) => r.attributes.t)).toEqual(['b', 'A', '', 'c', 'd'])
    expect(sortRecords(rows, { field: 't', direction: 'asc' }).map((r) => r.attributes.t)).toEqual(['A', 'b', 'c', 'd', ''])
  })
  it('does not touch the original list, and no sort or an empty field returns it as it is', () => {
    const copy = [...rows]
    sortRecords(rows, { field: 'n', direction: 'asc' })
    expect(rows).toEqual(copy)
    expect(sortRecords(rows, null)).toBe(rows)
    expect(sortRecords(rows, { field: ' ', direction: 'asc' })).toBe(rows)
  })
  it('a field that is a prototype key sorts nothing', () => {
    const out = sortRecords(rows, { field: '__proto__', direction: 'asc' })
    expect(out).toHaveLength(rows.length)
    expect(out.map((r) => r.attributes.t)).toEqual(rows.map((r) => r.attributes.t))
  })
})

describe('searching', () => {
  it('normalizes accents, case and spaces', () => {
    expect(normalizeSearchText('  Caffè   LATTE ')).toBe('caffe latte')
    expect(searchTerms('  Café  au  lait ')).toEqual(['cafe', 'au', 'lait'])
    expect(searchTerms('   ')).toEqual([])
    expect(searchTerms('a b c d e f g h i j')).toHaveLength(8)
  })
  it('every word must be found', () => {
    const hay = normalizeSearchText('Caffè Latte 4.50 hot')
    expect(matchesTerms(hay, searchTerms('latte hot'))).toBe(true)
    expect(matchesTerms(hay, searchTerms('CAFFE'))).toBe(true)
    expect(matchesTerms(hay, searchTerms('latte cold'))).toBe(false)
    expect(matchesTerms(hay, [])).toBe(true)
  })
})

import { DEFAULT_COUNT_TEXT, formatRowCount, rowRange } from './table-binding.js'

describe('the row counter', () => {
  const std = { rowsPerPage: 10, mode: 'standard' as const }
  it('computes the rows on screen for each page, the last one short', () => {
    expect(rowRange(23, std, 1, 10)).toEqual({ from: 1, to: 10 })
    expect(rowRange(23, std, 2, 10)).toEqual({ from: 11, to: 20 })
    expect(rowRange(23, std, 3, 3)).toEqual({ from: 21, to: 23 })
    expect(rowRange(23, std, 99, 3)).toEqual({ from: 21, to: 23 })
  })
  it('without pages or in lazyload mode, from the first row to what is drawn', () => {
    expect(rowRange(87, { rowsPerPage: 0, mode: 'standard' }, 1, 87)).toEqual({ from: 1, to: 87 })
    expect(rowRange(87, { rowsPerPage: 10, mode: 'lazyload' }, 1, 30)).toEqual({ from: 1, to: 30 })
  })
  it('is 0-0 when there is nothing to show', () => {
    expect(rowRange(0, std, 1, 0)).toEqual({ from: 0, to: 0 })
    expect(rowRange(5, std, 1, 0)).toEqual({ from: 0, to: 0 })
  })
  it('fills the placeholders and picks a default for a filtered result and for none', () => {
    expect(formatRowCount(undefined, { from: 1, to: 10, total: 87, all: 87 })).toBe('Showing 1–10 of 87')
    expect(formatRowCount('', { from: 1, to: 3, total: 3, all: 87 })).toBe('Showing 1–3 of 3 (filtered from 87)')
    expect(formatRowCount('  ', { from: 0, to: 0, total: 0, all: 87 })).toBe('No records')
    expect(formatRowCount('{from}-{to} / {total} ({all})', { from: 11, to: 20, total: 23, all: 40 })).toBe('11-20 / 23 (40)')
    expect(DEFAULT_COUNT_TEXT).toContain('{total}')
  })
  it('only knows its four placeholders; anything else is written as it is, as text', () => {
    expect(formatRowCount('{total} {nope} <b>x</b> {__proto__}', { from: 1, to: 1, total: 1, all: 1 })).toBe('1 {nope} <b>x</b> {__proto__}')
  })
})
