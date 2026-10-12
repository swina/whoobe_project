import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ALL_CLASS_FIELD_NAMES, SLIDER_DEFAULT_CLASSES, collectTreeClasses } from './class-fields.js'
import { TABLE_DEFAULT_CLASSES, TABLE_DEFAULTS, paginationOf } from './table-binding.js'

const here = dirname(fileURLToPath(import.meta.url))
const read = (rel: string) => readFileSync(join(here, rel), 'utf8')
const classesOf = (tree: unknown) => { const s = new Set<string>(); collectTreeClasses(tree, s); return s }

describe('collectTreeClasses', () => {
  it('reads css, and recurses into blocks', () => {
    const s = classesOf({ css: { css: 'a b', container: 'c' }, blocks: [{ css: { css: 'd' }, blocks: [{ css: { container: 'e  f' } }] }] })
    expect([...s].sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })
  it('reads every class-bearing field of a table, its cells and columns, and adds the default table classes', () => {
    const s = classesOf({
      tag: 'table', css: { css: 't1' },
      table: {
        headerRowClass: 'hr', bodyRowClass: 'br', footerRowClass: 'fr', headerCellClass: 'hc', bodyCellClass: 'bc', footerCellClass: 'fc',
        searchClass: 'sc', countClass: 'cc',
        header: [{ cellClass: 'h1' }], body: [[{ cellClass: 'b1' }, { cellClass: 'b2' }]], footer: [{ cellClass: 'f1' }],
        columns: [{ cellClass: 'k1', headerCellClass: 'k2' }],
      },
      dataBinding: { loadMoreClass: 'lm', paginationContainerClass: 'pc' },
      gatewayBinding: { loadMoreClass: 'glm', paginationContainerClass: 'gpc' },
    })
    for (const c of ['t1', 'hr', 'br', 'fr', 'hc', 'bc', 'fc', 'sc', 'cc', 'h1', 'b1', 'b2', 'f1', 'k1', 'k2', 'lm', 'pc', 'glm', 'gpc']) expect(s.has(c), c).toBe(true)
    for (const c of TABLE_DEFAULT_CLASSES.flatMap((x) => x.split(' '))) expect(s.has(c), c).toBe(true)
  })
  it('reads the slider and search fields, and the slider defaults only for a slider', () => {
    const s = classesOf({ tag: 'slider', slider: { navClass: 'n', arrowClass: 'a', homeClass: 'h', tabClass: 't', activeTabClass: 'at', tabContainerClass: 'tc', dotClass: 'dc', activeDotClass: 'adc', dotContainerClass: 'dcc' }, blocks: [{ searchConfig: { dropdownClass: 'dd', inputClass: 'ii', buttonClass: 'bb' } }] })
    for (const c of ['n', 'a', 'h', 't', 'at', 'tc', 'dc', 'adc', 'dcc', 'dd', 'ii', 'bb', 'bg-indigo-600', 'pt-3']) expect(s.has(c), c).toBe(true)
    expect(classesOf({ tag: 'p', css: { css: 'x' } }).has('bg-indigo-600')).toBe(false)
    expect(classesOf({ tag: 'p', css: { css: 'x' } }).has('rounded')).toBe(false)
  })
  it('survives junk, non-string values and a very deep tree', () => {
    for (const junk of [null, undefined, 'x', 3, [], { css: 'nope' }, { css: { css: 5 } }, { table: { columns: 'x', body: [3, [null]] } }]) expect(() => classesOf(junk)).not.toThrow()
    let deep: any = { css: { css: 'leaf' } }
    for (let i = 0; i < 500; i++) deep = { blocks: [deep] }
    expect(classesOf(deep).has('leaf')).toBe(false)
  })
})

describe('the class fields are all listed', () => {
  // A field ending in `Class` (or one of the two of `css`) added to the node types and not listed in CLASS_FIELDS would silently
  // miss the CSS of a generated site. The editor's own types are read too: they are where the table is described.
  const names = (src: string) => [...src.matchAll(/^\s+(?:readonly\s+)?(\w*Class)\??:/gm)].map((m) => m[1])
  it('every *Class property of the node types is in CLASS_FIELDS', () => {
    const declared = new Set([
      ...names(read('node.ts')),
      ...names(readFileSync(join(here, '../../../../apps/whoobe-one-spike/src/scripts/ElementsClass.d.ts'), 'utf8')),
    ])
    expect(declared.size).toBeGreaterThan(8)
    // fields of the editor's own interfaces that are not authored content (none today); keep this list empty unless justified
    const notAuthored = new Set<string>()
    const missing = [...declared].filter((n) => !ALL_CLASS_FIELD_NAMES.includes(n) && !notAuthored.has(n))
    expect(missing).toEqual([])
  })
})

describe('defaults the adapters bring', () => {
  it('the slider defaults listed here are the ones in the React and Vue slider', () => {
    const react = read('../../react/src/defaults.tsx')
    const vue = read('../../vue/src/defaults.ts')
    for (const c of SLIDER_DEFAULT_CLASSES) {
      expect(react.includes(`'${c}'`), `react: ${c}`).toBe(true)
      expect(vue.includes(`'${c}'`), `vue: ${c}`).toBe(true)
    }
  })
  it('the pagination defaults are the table defaults', () => {
    const p = paginationOf({ rowsPerPage: 5 })
    expect(p.loadMoreClass).toBe(TABLE_DEFAULTS.loadMore)
    expect(p.containerClass).toBe(TABLE_DEFAULTS.paginationContainer)
  })
})
