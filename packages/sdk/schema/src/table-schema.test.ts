import { describe, it, expect } from 'vitest'
import { parsePageContent } from './validators.js'
import { collectTreeClasses } from './class-fields.js'

const base = { id: 'r', type: 'element', tag: 'table', element: 'table', blocks: [], css: { css: 'a', container: '' } }

describe('the table in the node schema', () => {
  it('accepts a table of an older editor (fewer fields), and keeps fields it does not know', () => {
    const old = parsePageContent({ ...base, table: { cols: 1, hasHeader: true, header: [{ id: 'h', content: 'H', colspan: 1, rowspan: 1 }], body: [[{ id: 'b', content: 'B' }]], extra: 1 } }) as any
    expect(old).not.toBeNull()
    expect(old.table.extra).toBe(1)
  })
  it('accepts bound columns with formats and the visitor options', () => {
    const ok = parsePageContent({ ...base, table: { columns: [{ id: 'a', header: 'H', field: 'f', cellClass: 'x', sortable: false, transform: { type: 'none' } }, { id: 'b', header: 'I', field: 'g', transform: null }], sortable: true, searchable: true, showCount: true, countText: '{total}' } })
    expect(ok).not.toBeNull()
  })
  it('refuses a wrong type instead of handing it to a renderer', () => {
    for (const bad of [{ cols: 'two' }, { columns: [{ id: 1 }] }, { columns: 'x' }, { sortable: 'yes' }, { body: [['not a cell']] }, { header: [{ colspan: 'wide' }] }]) {
      expect(parsePageContent({ ...base, table: bad }), JSON.stringify(bad)).toBeNull()
    }
  })
})

describe('classes of a "map value to label/class" format', () => {
  it('are collected from a table column and from a field binding', () => {
    const s = new Set<string>()
    collectTreeClasses({ blocks: [
      { table: { columns: [{ transform: { type: 'valueMap', options: { rules: [{ match: 'a', label: 'A', className: 'bg-green-100 text-green-800' }], fallbackLabel: '?', fallbackClassName: 'bg-gray-100' } } }] } },
      { gatewayBinding: { transform: { type: 'valueMap', options: { rules: [{ className: 'ring-1' }], fallbackClassName: '' } } } },
    ] }, s)
    for (const c of ['bg-green-100', 'text-green-800', 'bg-gray-100', 'ring-1']) expect(s.has(c), c).toBe(true)
  })
})
