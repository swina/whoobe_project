import { describe, it, expect, vi } from 'vitest'
import { walkTree } from './walk.js'
import { normalizeKind } from './kind.js'
import type { RenderApi } from './api-client.js'

const makeApi = (overrides: Partial<RenderApi> = {}): RenderApi => ({ getObject: async () => null, queryObjects: async () => [], ...overrides })
const cell = (content: string, extra: object = {}) => ({ id: content, content, colspan: 1, rowspan: 1, merged: false, ...extra })
const table = (extra: Record<string, unknown> = {}, node: Record<string, unknown> = {}) => ({
  id: 'root', type: 'container', tag: 'document',
  blocks: [{
    id: 't', type: 'element', tag: 'table', element: 'table', blocks: [], css: { css: 'w-full', container: '' },
    table: { cols: 2, hasHeader: true, hasFooter: false, caption: 'Cap', header: [cell('H1'), cell('H2')], body: [[cell('a'), cell('b')]], footer: [],
      headerRowClass: 'hr', bodyCellClass: 'bc', ...extra },
    ...node,
  }],
})
const run = async (tree: unknown, api = makeApi(), opts: Record<string, unknown> = {}, ctx: Record<string, unknown> = {}) =>
  (await walkTree(tree, ctx, { api, ...opts })).children[0]
const rec = (name: string, price: unknown, extra: Record<string, unknown> = {}) => ({ id: name, attributes: { name, price, ...extra } })

describe('the table kind', () => {
  it('a table node has its own kind, and other nodes have no table', async () => {
    expect(normalizeKind({ tag: 'table', element: 'table' } as never)).toBe('table')
    const d = await run(table())
    expect(d.kind).toBe('table')
    expect(d.tag).toBe('table')
    const p = (await walkTree({ id: 'p', type: 'element', tag: 'element', element: 'p', content: 'x' }, {}, { api: makeApi() }))
    expect(p.table).toBeNull()
  })
})

describe('a typed table', () => {
  it('carries the grid, the classes and the caption, without merged cells', async () => {
    const d = await run(table({ header: [cell('H1', { colspan: 2 }), cell('x', { merged: true })], body: [[cell('a', { cellClass: 'c1' }), cell('b')], [cell('c'), cell('d', { merged: true })]] }))
    expect(d.table).toMatchObject({ mode: 'static', caption: 'Cap', hasHeader: true, hasFooter: false, classes: { headerRow: 'hr', bodyCell: 'bc' } })
    expect(d.table!.grid!.header).toEqual([{ html: 'H1', colspan: 2, rowspan: 1 }])
    expect(d.table!.grid!.body[0][0]).toEqual({ html: 'a', colspan: 1, rowspan: 1, className: 'c1' })
    expect(d.table!.grid!.body[1]).toHaveLength(1)
    expect(d.table!.bound).toBeUndefined()
  })
  it('cleans the HTML of the cells, so a descriptor stays safe to inject', async () => {
    const hostile = '<img src=x onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">x</a><b>ok</b>'
    const d = await run(table({ body: [[cell(hostile)]] }))
    const html = d.table!.grid!.body[0][0].html
    expect(html).not.toMatch(/<script|onerror|javascript:/i)
    expect(html).toContain('<b>ok</b>')
  })
  it('survives a table with missing parts', async () => {
    const d = await run(table({ header: undefined, body: undefined, footer: undefined, caption: undefined, hasHeader: undefined }))
    expect(d.table!.grid).toEqual({ header: [], body: [], footer: [] })
    expect(d.table!.hasHeader).toBe(true)
  })
})

describe('a table bound to a Data Class', () => {
  const binding = { className: 'Product', target: 'custom', resolveMode: 'query', rowsPerPage: 2, paginationMode: 'lazyload', loadMoreText: 'Show more' }
  const records = [rec('Caffè', 3.5, { updated: '2026-01-02' }), rec('Tea', 10, { updated: '2026-02-03' }), rec('Água', null, { updated: '' })]
  const api = makeApi({ queryObjects: async () => records as never })
  it('has one row per record with the configured columns, sort keys and search text', async () => {
    const d = await run(table({ columns: [{ id: 'a', header: 'Name', field: 'name', cellClass: 'left' }, { id: 'b', header: 'Price', field: 'price', headerCellClass: 'right', sortable: false }, { id: 'c', header: 'Note', field: 'note', searchable: false }], sortable: true, searchable: true, showCount: true, countText: 'N={total}', emptyText: 'Nothing' }, { dataBinding: binding }), api)
    const b = d.table!.bound!
    expect(d.table!.mode).toBe('bound')
    expect(b.columns).toEqual([
      { id: 'a', header: 'Name', field: 'name', cellClass: 'left', sortable: true, searchable: true },
      { id: 'b', header: 'Price', field: 'price', headerClass: 'right', sortable: false, searchable: true },
      { id: 'c', header: 'Note', field: 'note', sortable: true, searchable: false },
    ])
    expect(b.rows.map((r) => r.cells.map((c) => c.text))).toEqual([['Caffè', '3.5', ''], ['Tea', '10', ''], ['Água', '', '']])
    expect(b.rows.map((r) => r.sortKeys)).toEqual([['Caffè', 3.5, null], ['Tea', 10, null], ['Água', null, null]])
    expect(b.rows[0].search).toBe('caffe 3.5')
    expect(b).toMatchObject({ totalRows: 3, truncated: false, sortable: true, searchable: true, showCount: true, countText: 'N={total}', emptyText: 'Nothing' })
    expect(b.pagination).toMatchObject({ rowsPerPage: 2, mode: 'lazyload', loadMoreText: 'Show more' })
  })
  it('without columns, shows the scalar fields of the first record', async () => {
    const d = await run(table({}, { dataBinding: binding }), api)
    expect(d.table!.bound!.columns.map((c) => [c.field, c.header])).toEqual([['name', 'Name'], ['price', 'Price'], ['updated', 'Updated']])
  })
  it('formats a column with its transform: number, date, link (checked) and a label with classes', async () => {
    const d = await run(table({ columns: [
      { id: 'n', header: 'P', field: 'price', transform: { type: 'number', options: { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true } } },
      { id: 'u', header: 'Link', field: 'url', transform: { type: 'url', options: { linkText: 'value', openInNewTab: true } } },
      { id: 'v', header: 'Status', field: 'status', transform: { type: 'valueMap', options: { rules: [{ match: 'on', label: 'Online', className: 'bg-green-100' }], fallbackLabel: '?', fallbackClassName: 'bg-gray-100' } } },
    ] }, { dataBinding: binding }), makeApi({ queryObjects: async () => [rec('x', 3.5, { url: 'https://example.com/a', status: 'on' }), rec('y', 2, { url: 'javascript:alert(1)', status: 'off' })] as never }))
    const rows = d.table!.bound!.rows
    expect(rows[0].cells[0].text).toBe('3.50')
    expect(rows[0].cells[1]).toMatchObject({ href: 'https://example.com/a', target: '_blank' })
    expect(rows[0].cells[2]).toEqual({ text: 'Online', className: 'bg-green-100' })
    // an unsafe address is shown as plain text, never as a link
    expect(rows[1].cells[1].href).toBeUndefined()
    expect(rows[1].cells[2]).toMatchObject({ text: '?', className: 'bg-gray-100' })
  })
  it('keeps at most tableMaxRows rows, says so, and keeps the real total', async () => {
    const many = Array.from({ length: 10 }, (_, i) => rec('n' + i, i))
    const d = await run(table({}, { dataBinding: binding }), makeApi({ queryObjects: async () => many as never }), { tableMaxRows: 3 })
    expect(d.table!.bound!.rows).toHaveLength(3)
    expect(d.table!.bound!).toMatchObject({ totalRows: 10, truncated: true })
    const full = await run(table({}, { dataBinding: binding }), makeApi({ queryObjects: async () => many as never }))
    expect(full.table!.bound!).toMatchObject({ totalRows: 10, truncated: false })
    expect(full.table!.bound!.rows).toHaveLength(10)
  })
  it('an empty list is a bound table with no row, and an API that fails does not break the page', async () => {
    const empty = await run(table({}, { dataBinding: binding }), makeApi({ queryObjects: async () => [] }))
    expect(empty.table!.mode).toBe('bound')
    expect(empty.table!.bound!.rows).toEqual([])
    const failing = await run(table({}, { dataBinding: binding }), makeApi({ queryObjects: async () => { throw new Error('down') } }))
    expect(failing.table!.mode).toBe('bound')
    expect(failing.table!.bound!.rows).toEqual([])
  })
  it('a binding of a single field is not a list: the table stays typed', async () => {
    const d = await run(table({}, { dataBinding: { ...binding, field: 'name', resolveMode: 'explicit', objectId: 'o1' } }), api)
    expect(d.table!.mode).toBe('static')
  })
  it('never reads the prototype chain and cell text stays text', async () => {
    const d = await run(table({ columns: [{ id: 'p', header: 'P', field: '__proto__' }, { id: 'c', header: 'C', field: 'constructor.name' }, { id: 'h', header: 'H', field: 'html' }] }, { dataBinding: binding }),
      makeApi({ queryObjects: async () => [rec('x', 1, { html: '<img src=x onerror=1>' })] as never }))
    expect(d.table!.bound!.rows[0].cells.map((c) => c.text)).toEqual(['', '', '<img src=x onerror=1>'])
  })
  it('the descriptor survives JSON (it crosses the server-rendering boundary)', async () => {
    const d = await run(table({ columns: [{ id: 'a', header: 'N', field: 'name' }] }, { dataBinding: binding }), api)
    expect(JSON.parse(JSON.stringify(d.table))).toEqual(d.table)
  })
})

describe('a table bound to a gateway list', () => {
  it('asks the gateway with the binding id and the site credentials, and reads items by path', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(init.body as string).bindingId).toBe('b-1')
      expect((init.headers as Record<string, string>)['X-Whoobe-Site-Key']).toBe('k')
      return { ok: true, json: async () => ({ value: [{ sku: 's1', address: { city: 'Rome' } }, { sku: 's2', address: { city: 'Lisbon' } }] }) } as Response
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      const d = await run(table({ columns: [{ id: 'a', header: 'SKU', field: 'sku' }, { id: 'b', header: 'City', field: 'address.city' }] },
        { gatewayBinding: { endpointName: 'shop', routePath: '/p', fieldPath: 'items', bindingId: 'b-1', rowsPerPage: 1 } }),
        makeApi({ gatewayUrl: 'http://gw', gatewaySiteAuth: { siteId: 's', siteKey: 'k' } } as never))
      expect(d.table!.bound!.rows.map((r) => r.cells.map((c) => c.text))).toEqual([['s1', 'Rome'], ['s2', 'Lisbon']])
      expect(d.table!.bound!.pagination.rowsPerPage).toBe(1)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
  it('a binding that was never saved (no binding id) or a reply that is not a list gives an empty bound table', async () => {
    const unsaved = await run(table({}, { gatewayBinding: { endpointName: 'shop', routePath: '/p', fieldPath: 'items' } }))
    expect(unsaved.table!.mode).toBe('bound')
    expect(unsaved.table!.bound!.rows).toEqual([])
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ value: { not: 'a list' } }) }) as Response))
    try {
      const obj = await run(table({}, { gatewayBinding: { fieldPath: '', bindingId: 'b' } }))
      expect(obj.table!.bound!.rows).toEqual([])
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
