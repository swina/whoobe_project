// The Data bindings list shows every page and snippet that has dynamic data (docs/plans/cms/data-bindings-list.md).
import { describe, it, expect } from 'vitest'
import { collectDataBindings, collectSnippetUses, filterDataBindings, type DataBindingSource } from '../../../packages/sdk/schema/src/data-bindings'

const page: DataBindingSource = { kind: 'page', id: 'p1', title: 'Shop', websiteId: 'w1', published: true }
const snippet: DataBindingSource = { kind: 'snippet', id: 's1', title: 'Product grid' }
const db = (id: string, className: string, extra: object = {}) => ({ id, blocks: [], dataBinding: { className, resolveMode: 'query' }, ...extra })
const gw = (id: string, endpointName: string, routePath: string, extra: object = {}) => ({ id, blocks: [], gatewayBinding: { endpointName, routePath }, ...extra })

describe('data bindings list: collectDataBindings', () => {
  it('finds Data Object and API bindings at any depth, in document order', () => {
    const tree = { id: 'r', blocks: [{ id: 'a', blocks: [db('d1', 'Product')] }, gw('g1', 'Shop API', '/products')] }
    const r = collectDataBindings(tree, page)
    expect(r.map((e) => [e.kind, e.target, e.route, e.elementIds])).toEqual([
      ['dataObject', 'Product', '', ['d1']],
      ['gateway', 'Shop API', '/products', ['g1']],
    ])
  })
  it('groups the bound elements of one target in one row', () => {
    const tree = { id: 'r', blocks: [db('a', 'Product'), db('b', 'Product'), db('c', 'Category'), gw('x', 'API', '/a'), gw('y', 'API', '/b')] }
    const r = collectDataBindings(tree, page)
    expect(r.map((e) => [e.target, e.route, e.elementIds.length])).toEqual([['Product', '', 2], ['Category', '', 1], ['API', '/a', 1], ['API', '/b', 1]])
  })
  it('knows the snippet a block was inserted from, and keeps own blocks apart', () => {
    const tree = { id: 'r', blocks: [
      { id: 'w', sourceSnippetId: 's9', blocks: [db('in', 'Product', { blocks: [db('deep', 'Product')] })] },
      db('own', 'Product'),
    ] }
    const r = collectDataBindings(tree, page)
    expect(r.map((e) => [e.fromSnippetId, e.elementIds])).toEqual([['s9', ['in', 'deep']], ['', ['own']]])
    expect(new Set(r.map((e) => e.key)).size).toBe(2)
  })
  it('counts a gateway binding that only has its id (public content), ignores empty bindings, nodes without id and junk', () => {
    expect(collectDataBindings({ id: 'r', blocks: [{ id: 'g', blocks: [], gatewayBinding: { bindingId: 'b1' } }] }, page)[0].target).toBe('(unnamed endpoint)')
    expect(collectDataBindings({ id: 'r', blocks: [db('e', ''), { blocks: [], dataBinding: { className: 'X' } }, { id: 'n', dataBinding: null, gatewayBinding: {} }] }, page)).toEqual([])
    for (const junk of [null, undefined, 'x', 7, [], { blocks: 'nope' }]) expect(collectDataBindings(junk, page)).toEqual([])
  })
  it('does not recurse forever on a very deep tree', () => {
    let node: any = db('leaf', 'P')
    for (let i = 0; i < 400; i++) node = { id: `n${i}`, blocks: [node] }
    expect(collectDataBindings(node, page)).toEqual([])
  })
})

describe('data bindings list: collectSnippetUses and filters', () => {
  it('counts the blocks built from each snippet', () => {
    const uses = collectSnippetUses({ id: 'r', blocks: [{ id: 'a', sourceSnippetId: 's1', blocks: [] }, { id: 'b', sourceSnippetId: 's1', blocks: [{ id: 'c', sourceSnippetId: 's2', blocks: [] }] }] })
    expect(uses.get('s1')).toBe(2)
    expect(uses.get('s2')).toBe(1)
  })
  it('filters by text, kind and origin', () => {
    const tree = { id: 'r', blocks: [db('a', 'Product'), gw('g', 'Shop API', '/items'), { id: 'w', sourceSnippetId: 's1', blocks: [db('s', 'Category')] }] }
    const all = [...collectDataBindings(tree, page), ...collectDataBindings(db('x', 'Event'), snippet)]
    expect(filterDataBindings(all, { kind: 'gateway' }).map((e) => e.target)).toEqual(['Shop API'])
    expect(filterDataBindings(all, { text: ' items ' }).map((e) => e.target)).toEqual(['Shop API'])
    expect(filterDataBindings(all, { text: 'grid' }).map((e) => e.target)).toEqual(['Event'])
    expect(filterDataBindings(all, { origin: 'snippet' }).map((e) => e.target)).toEqual(['Category'])
    expect(filterDataBindings(all, { origin: 'own' }).map((e) => e.target)).toEqual(['Product', 'Shop API', 'Event'])
  })
})
