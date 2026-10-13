import { describe, it, expect } from 'vitest'
import { withParent, parentOf, nestedDepth, readItemPath, nestedGatewayList, nestedDataList, applyItemFilters, MAX_NESTED_DEPTH } from './index.js'

const category = { id: 1, title: 'Shoes', products: [{ id: 10, title: 'Boot', details: { size: 42 }, tags: ['a', 'b'], variants: [{ color: 'red' }, { color: 'blue' }] }, { id: 11, title: 'Sneaker', variants: [] }] }

describe('item paths', () => {
  it('reads plain, dotted and indexed paths, strictly', () => {
    const item = category.products[0]
    expect(readItemPath(item, 'title')).toBe('Boot')
    expect(readItemPath(item, 'details.size')).toBe(42)
    expect(readItemPath(item, 'tags[1]')).toBe('b')
    expect(readItemPath(item, 'variants[0].color')).toBe('red')
    expect(readItemPath(item, 'nope')).toBeUndefined()
    expect(readItemPath(item, 'variants.color')).toBeUndefined() // not through a list
  })
  it('a shorter path is not guessed: the field of another level is not read by mistake', () => {
    expect(readItemPath(category.products[0], 'products.title')).toBeUndefined()
  })
  it('^. reads the item the list sits in', () => {
    const [boot] = nestedGatewayList(category, 'products') as any[]
    expect(readItemPath(boot, 'title')).toBe('Boot')
    expect(readItemPath(boot, '^.title')).toBe('Shoes')
    const [red] = nestedGatewayList(boot, 'variants') as any[]
    expect(readItemPath(red, 'color')).toBe('red')
    expect(readItemPath(red, '^.title')).toBe('Boot')
    expect(readItemPath(red, '^.^.title')).toBe('Shoes')
    expect(readItemPath(red, '^.^.^.title')).toBeUndefined()
  })
})

describe('nested lists of an Integrations item', () => {
  it('gives the items of the list, each one aware of its parent, and leaves the data untouched', () => {
    const items = nestedGatewayList(category, 'products') as any[]
    expect(items.map((i) => i.title)).toEqual(['Boot', 'Sneaker'])
    expect(parentOf(items[0])).toBe(category)
    expect(Object.keys(items[0])).not.toContain('$parent')
    expect(JSON.stringify(items[0])).not.toContain('Shoes')
    expect(category.products[0]).not.toHaveProperty('$parent')
  })
  it('null when the path is not a list; an empty list is an empty list', () => {
    expect(nestedGatewayList(category, 'title')).toBeNull()
    expect(nestedGatewayList(category, 'missing')).toBeNull()
    expect(nestedGatewayList(category.products[1], 'variants')).toEqual([])
  })
  it('applies filters and a limit', () => {
    const f = [{ field: 'title', operator: 'contains' as const, value: 'sneak' }]
    expect((nestedGatewayList(category, 'products', { filters: f }) as any[]).map((i) => i.id)).toEqual([11])
    expect(nestedGatewayList(category, 'products', { limit: 1 })).toHaveLength(1)
  })
  it('skips items that are not objects', () => {
    expect(nestedGatewayList({ tags: ['a', null, 3, { x: 1 }] }, 'tags')).toHaveLength(1)
  })
  it('stops at the depth limit', () => {
    let rec: any = { l: [{ l: [] }] }
    rec.l = [{}]
    let cur: any = { n: [{}] }
    let depth = 0
    while (depth < MAX_NESTED_DEPTH + 2) {
      const next: any = nestedGatewayList(cur, 'n')
      if (!next) break
      cur = { ...next[0], n: [{}] }
      cur = withParent(cur, parentOf(next[0]))
      depth++
    }
    expect(depth).toBe(MAX_NESTED_DEPTH - 1)
    expect(nestedDepth(cur)).toBeGreaterThan(0)
  })
})

describe('nested lists of a Data Object', () => {
  const obj = { id: 'o', attributes: { title: 'Page', blocks: [{ heading: 'A', cta: { label: 'Go' } }, { heading: 'B' }, 'text'] } }
  it('wraps each item as a record with its own attributes', () => {
    const items = nestedDataList(obj, 'blocks') as any[]
    expect(items).toHaveLength(2)
    expect(items[0].attributes.heading).toBe('A')
    expect(parentOf(items[1])).toBe(obj)
    expect(readItemPath(items[0].attributes, 'cta.label')).toBe('Go')
  })
  it('null for a field that is not a list', () => {
    expect(nestedDataList(obj, 'title')).toBeNull()
    expect(nestedDataList({ id: 'x' }, 'blocks')).toBeNull()
  })
})

describe('item filters', () => {
  const items = [{ n: 1, c: 'a' }, { n: 5, c: 'b' }, { n: 9, c: 'a' }]
  it('uses the operators of the other filters, all must hold', () => {
    expect(applyItemFilters(items, [{ field: 'c', operator: 'eq', value: 'a' }])).toHaveLength(2)
    expect(applyItemFilters(items, [{ field: 'c', operator: 'eq', value: 'a' }, { field: 'n', operator: 'gt', value: 3 }])).toEqual([items[2]])
    expect(applyItemFilters(items, [{ field: 'c', operator: 'neq', value: 'a' }])).toEqual([items[1]])
    expect(applyItemFilters(items, [{ field: 'n', operator: 'lt', value: 6 }])).toHaveLength(2)
    expect(applyItemFilters(items, [{ field: 'c', operator: 'in', value: ['b'] }])).toEqual([items[1]])
    expect(applyItemFilters(items, null)).toEqual(items)
  })
})

describe('data bindings list', () => {
  it('does not list a nested list or a relative field as a source of data', async () => {
    const { collectDataBindings } = await import('./index.js')
    const tree = { id: 'r', blocks: [
      { id: 'cats', gatewayBinding: { endpointName: 'shop', routePath: '/c', bindingId: 'b' }, blocks: [{ id: 'prods', gatewayBinding: { scope: 'item' }, blocks: [{ id: 't', gatewayBinding: { scope: 'item' } }] }] },
      { id: 'pages', dataBinding: { className: 'Page', resolveMode: 'query' }, blocks: [{ id: 'bl', dataBinding: { className: 'Page', resolveMode: 'parent', target: 'list', field: 'blocks' } }] },
    ] }
    const rows = collectDataBindings(tree, { kind: 'page', id: 'p', title: 'P' })
    expect(rows.map((r) => [r.kind, r.target, r.elementIds])).toEqual([['gateway', 'shop', ['cats']], ['dataObject', 'Page', ['pages']]])
  })
})
