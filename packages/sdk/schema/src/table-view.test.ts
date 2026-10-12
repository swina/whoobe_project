import { describe, it, expect } from 'vitest'
import { ariaSortOf, buildTableRows, computeTableView, sortMarkOf, type TableViewInput } from './table-view.js'

const rec = (name: string, price: unknown, extra: Record<string, unknown> = {}) => ({ attributes: { name, price, ...extra } })
const columns = [{ field: 'name' }, { field: 'price' }, { field: 'note', searchable: false }]
const records = [rec('Caffè', 3, { note: 'secret' }), rec('Tea', 10), rec('Água', 2), rec('Cola', 5), rec('Juice', 7), rec('Mate', null)]
const rows = buildTableRows(records, columns)
const input = (over: Partial<TableViewInput> = {}): TableViewInput => ({
  columns: [{ field: 'name' }, { field: 'price' }, { field: 'note' }], rows, pagination: { rowsPerPage: 0, mode: 'standard' }, sortable: true, searchable: true, ...over,
})
const state = (over = {}) => ({ query: '', sort: null, page: 1, visible: 0, ...over })
const names = (v: { rows: typeof rows }) => v.rows.map((r) => r.cells[0].text)

describe('buildTableRows', () => {
  it('one row per record: text cells, raw sort keys, normalised search text without the columns left out of it', () => {
    expect(rows[0].cells.map((c) => c.text)).toEqual(['Caffè', '3', 'secret'])
    expect(rows[0].sortKeys).toEqual(['Caffè', 3, 'secret'])
    expect(rows[0].search).toBe('caffe 3')
    expect(rows[5].sortKeys).toEqual(['Mate', null, null])
  })
  it('formats with a transform: a checked link, a label with classes, and plain text for an unsafe address', () => {
    const r = buildTableRows([{ u: 'https://example.com', s: 'on', bad: 'javascript:alert(1)' }], [
      { field: 'u', transform: { type: 'url', options: { linkText: 'value', openInNewTab: true } } },
      { field: 's', transform: { type: 'valueMap', options: { rules: [{ match: 'on', label: 'Online', className: 'bg-green-100' }], fallbackLabel: '', fallbackClassName: '' } } },
      { field: 'bad', transform: { type: 'url', options: { linkText: 'value', openInNewTab: false } } },
    ])
    expect(r[0].cells[0]).toMatchObject({ href: 'https://example.com', target: '_blank' })
    expect(r[0].cells[1]).toEqual({ text: 'Online', className: 'bg-green-100' })
    expect(r[0].cells[2].href).toBeUndefined()
  })
})

describe('computeTableView', () => {
  it('without controls, every row and a counter over all of them', () => {
    const v = computeTableView(input(), state())
    expect(v.rows).toHaveLength(6)
    expect(v).toMatchObject({ total: 6, all: 6, pages: 1, page: 1, from: 1, to: 6, needsControls: false, searching: false, sort: null, countLabel: 'Showing 1–6 of 6' })
  })
  it('pages: the page asked, kept in range, the last one short, with the counter of each', () => {
    const p = input({ pagination: { rowsPerPage: 4, mode: 'standard' } })
    expect(computeTableView(p, state()).countLabel).toBe('Showing 1–4 of 6')
    const last = computeTableView(p, state({ page: 2 }))
    expect(names(last)).toEqual(['Juice', 'Mate'])
    expect(last).toMatchObject({ from: 5, to: 6, pages: 2, needsControls: true, countLabel: 'Showing 5–6 of 6' })
    expect(computeTableView(p, state({ page: 99 })).page).toBe(2)
    expect(computeTableView(p, state({ page: -3 })).page).toBe(1)
  })
  it('lazyload: grows with the rows revealed', () => {
    const p = input({ pagination: { rowsPerPage: 2, mode: 'lazyload' } })
    expect(computeTableView(p, state({ visible: 2 })).rows).toHaveLength(2)
    expect(computeTableView(p, state({ visible: 4 })).countLabel).toBe('Showing 1–4 of 6')
    expect(computeTableView(p, state({ visible: 0 })).rows).toHaveLength(2)
  })
  it('search: every word, ignoring case and accents, not in the columns left out, and the counter says what it was before', () => {
    expect(names(computeTableView(input(), state({ query: 'CAFFE' })))).toEqual(['Caffè'])
    expect(names(computeTableView(input(), state({ query: 'agua' })))).toEqual(['Água'])
    expect(computeTableView(input(), state({ query: 'secret' })).total).toBe(0)
    const v = computeTableView(input(), state({ query: 'c' }))
    expect(v.searching).toBe(true)
    expect(v.countLabel).toBe(`Showing 1–${v.total} of ${v.total} (filtered from 6)`)
    expect(computeTableView(input(), state({ query: 'zzz' })).countLabel).toBe('No records')
    expect(computeTableView(input({ searchable: false }), state({ query: 'zzz' })).total).toBe(6)
  })
  it('sort: ascending, descending, numbers as numbers, empty values last, stable', () => {
    const asc = computeTableView(input(), state({ sort: { field: 'price', direction: 'asc' } }))
    expect(names(asc)).toEqual(['Água', 'Caffè', 'Cola', 'Juice', 'Tea', 'Mate'])
    expect(asc.sort).toEqual({ field: 'price', direction: 'asc' })
    expect(names(computeTableView(input(), state({ sort: { field: 'price', direction: 'desc' } })))).toEqual(['Tea', 'Juice', 'Cola', 'Caffè', 'Água', 'Mate'])
  })
  it('a sort that is switched off, on a column that is gone, or on a table that is not sortable is not applied', () => {
    const s = { field: 'price', direction: 'asc' as const }
    expect(computeTableView(input({ sortable: false }), state({ sort: s })).sort).toBeNull()
    expect(computeTableView(input({ columns: [{ field: 'name' }, { field: 'price', sortable: false }, { field: 'note' }] }), state({ sort: s })).sort).toBeNull()
    expect(computeTableView(input(), state({ sort: { field: 'nope', direction: 'asc' } })).sort).toBeNull()
    expect(names(computeTableView(input({ sortable: false }), state({ sort: s })))[0]).toBe('Caffè')
  })
  it('search, then sort, then page', () => {
    const v = computeTableView(input({ pagination: { rowsPerPage: 2, mode: 'standard' } }), state({ query: 'c', sort: { field: 'price', direction: 'desc' }, page: 1 }))
    // rows containing "c": Caffè (3), Cola (5), Juice (7) -> by price, descending -> two per page
    expect(names(v)).toEqual(['Juice', 'Cola'])
    expect(v.total).toBe(3)
    expect(names(computeTableView(input({ pagination: { rowsPerPage: 2, mode: 'standard' } }), state({ query: 'c', sort: { field: 'price', direction: 'desc' }, page: 2 })))).toEqual(['Caffè'])
  })
  it('a custom counter text and an empty list', () => {
    expect(computeTableView(input({ countText: '{from}-{to}/{total} of {all}' }), state()).countLabel).toBe('1-6/6 of 6')
    const e = computeTableView(input({ rows: [] }), state())
    expect(e).toMatchObject({ total: 0, pages: 1, from: 0, to: 0, countLabel: 'No records', needsControls: false })
  })
  it('does not change the rows it was given', () => {
    const before = JSON.stringify(rows)
    computeTableView(input(), state({ sort: { field: 'price', direction: 'desc' }, query: 'c' }))
    expect(JSON.stringify(rows)).toBe(before)
  })
})

describe('header state', () => {
  it('aria-sort and the mark follow the applied sort', () => {
    const s = { field: 'price', direction: 'desc' as const }
    expect([ariaSortOf(s, 'price'), ariaSortOf(s, 'name'), ariaSortOf(null, 'price')]).toEqual(['descending', 'none', 'none'])
    expect([sortMarkOf(s, 'price'), sortMarkOf({ field: 'price', direction: 'asc' }, 'price'), sortMarkOf(s, 'name')]).toEqual(['▼', '▲', '↕'])
  })
})

import { initialTableState, reduceTableState, type TableViewAction } from './table-view.js'

describe('the state machine of the controls', () => {
  const inp = input({ pagination: { rowsPerPage: 2, mode: 'standard' } })
  const step = (s: ReturnType<typeof initialTableState>, a: TableViewAction, i = inp) => reduceTableState(s, a, i, computeTableView(i, s))
  it('starts on the first page with the first rows revealed', () => {
    expect(initialTableState({ rowsPerPage: 5 })).toEqual({ query: '', sort: null, page: 1, visible: 5 })
  })
  it('pages forward and back, never out of the range of the result', () => {
    let s = initialTableState(inp.pagination)
    s = step(s, { type: 'next' }); expect(s.page).toBe(2)
    s = step(s, { type: 'next' }); s = step(s, { type: 'next' }); expect(s.page).toBe(3)
    s = step(s, { type: 'next' }); expect(s.page).toBe(3)
    s = step(s, { type: 'prev' }); expect(s.page).toBe(2)
    s = step(step(step(s, { type: 'prev' }), { type: 'prev' }), { type: 'prev' }); expect(s.page).toBe(1)
  })
  it('a search or a sort goes back to the first page', () => {
    let s = step(step(initialTableState(inp.pagination), { type: 'next' }), { type: 'next' })
    expect(s.page).toBe(3)
    s = step(s, { type: 'query', value: 'a' }); expect(s).toMatchObject({ query: 'a', page: 1 })
    s = step(step(s, { type: 'next' }), { type: 'sort', field: 'name' }); expect(s).toMatchObject({ page: 1, sort: { field: 'name', direction: 'asc' } })
  })
  it('a sort goes ascending, descending, off; a column that cannot be sorted, or a table that is not sortable, changes nothing', () => {
    let s = initialTableState(inp.pagination)
    s = step(s, { type: 'sort', field: 'name' }); expect(s.sort).toEqual({ field: 'name', direction: 'asc' })
    s = step(s, { type: 'sort', field: 'name' }); expect(s.sort).toEqual({ field: 'name', direction: 'desc' })
    s = step(s, { type: 'sort', field: 'name' }); expect(s.sort).toBeNull()
    const off = input({ sortable: false, pagination: inp.pagination })
    expect(step(initialTableState(inp.pagination), { type: 'sort', field: 'name' }, off).sort).toBeNull()
    const no = input({ columns: [{ field: 'name', sortable: false }, { field: 'price' }, { field: 'note' }], pagination: inp.pagination })
    expect(step(initialTableState(inp.pagination), { type: 'sort', field: 'name' }, no).sort).toBeNull()
    expect(step(initialTableState(inp.pagination), { type: 'sort', field: 'nope' }).sort).toBeNull()
  })
  it('"more" reveals one page of rows at a time, up to the total', () => {
    const lazy = input({ pagination: { rowsPerPage: 4, mode: 'lazyload' } })
    let s = initialTableState(lazy.pagination)
    expect(computeTableView(lazy, s).rows).toHaveLength(4)
    s = step(s, { type: 'more' }, lazy); expect(s.visible).toBe(6)
    s = step(s, { type: 'more' }, lazy); expect(s.visible).toBe(6)
    expect(computeTableView(lazy, s).rows).toHaveLength(6)
  })
})
