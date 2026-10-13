import { describe, it, expect, vi } from 'vitest'
import { walkTree } from './walk.js'
import type { RenderApi } from './api-client.js'

const rec = (attributes: Record<string, unknown>) => ({ id: String(attributes.id), attributes })
const makeApi = (rows: Record<string, unknown>[]): RenderApi => ({ getObject: async () => null, queryObjects: async () => rows as any })
const card = { id: 'card', type: 'element', tag: 'element', element: 'p', content: 'x' }
const page = (extra: Record<string, unknown>) => ({
  id: 'root', type: 'container', tag: 'document',
  blocks: [{ id: 'list', type: 'container', tag: 'div', dataBinding: { className: 'Category', resolveMode: 'query', target: 'children' }, blocks: [card], ...extra }],
})

describe('linked bindings in the walker', () => {
  it('a publishing repeater marks every item with the selection name and its own value', async () => {
    const out = await walkTree(page({ selection: { publish: { name: 'category', field: 'id' } } }), {}, { api: makeApi([rec({ id: 12 }), rec({ id: 13 })]) })
    const items = out.children[0].children
    expect(items.map((i) => i.attributes['data-whoobe-select'])).toEqual(['category', 'category'])
    expect(items.map((i) => i.attributes['data-whoobe-value'])).toEqual(['12', '13'])
    expect(items[0].style).not.toContain('display:none')
  })

  it('a listening repeater gives each item its keys and starts hidden', async () => {
    const out = await walkTree(page({ selection: { listen: { name: 'category', field: 'category_id' } } }), {}, { api: makeApi([rec({ id: 1, category_id: 12 }), rec({ id: 2, category_id: ['12', '14'] })]) })
    const items = out.children[0].children
    expect(items.map((i) => i.attributes['data-whoobe-listen'])).toEqual(['category', 'category'])
    expect(items.map((i) => i.attributes['data-whoobe-key'])).toEqual(['12', '12\n14'])
    expect(items.every((i) => i.style.includes('display:none!important'))).toBe(true)
  })

  it('whenEmpty "all" keeps the items visible and says so', async () => {
    const out = await walkTree(page({ selection: { listen: { name: 'category', field: 'category_id', whenEmpty: 'all' } } }), {}, { api: makeApi([rec({ id: 1, category_id: 12 })]) })
    const item = out.children[0].children[0]
    expect(item.attributes['data-whoobe-when-empty']).toBe('all')
    expect(item.style).not.toContain('display:none')
  })

  it('a repeater can publish and listen at once (categories > subcategories > products)', async () => {
    const out = await walkTree(page({ selection: { publish: { name: 'sub', field: 'id' }, listen: { name: 'category', field: 'parent' } } }), {}, { api: makeApi([rec({ id: 5, parent: 12 })]) })
    const a = out.children[0].children[0].attributes
    expect(a['data-whoobe-select']).toBe('sub')
    expect(a['data-whoobe-value']).toBe('5')
    expect(a['data-whoobe-listen']).toBe('category')
    expect(a['data-whoobe-key']).toBe('12')
  })

  it('works on an Integrations list (dot path in the item), with the item as record', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ value: [{ sku: 'a', cat: { id: 7 } }, { sku: 'b', cat: { id: 8 } }] }) }) as Response))
    try {
      const tree = {
        id: 'root', type: 'container', tag: 'document',
        blocks: [{ id: 'list', type: 'container', tag: 'div', gatewayBinding: { endpointName: 'shop', routePath: '/products', fieldPath: '', bindingId: 'b1' }, selection: { listen: { name: 'category', field: 'cat.id' } }, blocks: [card] }],
      }
      const out = await walkTree(tree, {}, { api: { ...makeApi([]), gatewayUrl: 'http://gw' } })
      expect(out.children[0].children.map((i) => i.attributes['data-whoobe-key'])).toEqual(['7', '8'])
    } finally { vi.unstubAllGlobals() }
  })

  it('a malformed selection is dropped: the page still renders, without it', async () => {
    const bad = await walkTree(page({ selection: { publish: { name: '1bad', field: 'id' } } }), {}, { api: makeApi([rec({ id: 1 })]) })
    expect(bad.children[0].children[0].attributes['data-whoobe-select']).toBeUndefined()
    const plain = await walkTree(page({}), {}, { api: makeApi([rec({ id: 1 })]) })
    expect(plain.children[0].children[0].attributes['data-whoobe-select']).toBeUndefined()
  })
})
