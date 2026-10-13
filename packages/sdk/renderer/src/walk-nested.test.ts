import { describe, it, expect, vi } from 'vitest'
import { walkTree } from './walk.js'
import type { RenderApi } from './api-client.js'

const base = (over: Partial<RenderApi> = {}): RenderApi => ({ getObject: async () => null, queryObjects: async () => [], gatewayUrl: 'http://gw', ...over })
const leaf = (id: string, gb: Record<string, unknown>) => ({ id, type: 'element', tag: 'element', element: 'p', gatewayBinding: { scope: 'item', ...gb } })
const text = (n: any): string[] => [n.content, ...n.children.flatMap(text)].filter(Boolean)

const response = [
  { id: 1, title: 'Shoes', products: [{ id: 10, title: 'Boot', variants: [{ color: 'red' }, { color: 'blue' }] }, { id: 11, title: 'Sneaker', variants: [{ color: 'white' }] }] },
  { id: 2, title: 'Hats', products: [{ id: 12, title: 'Cap', variants: [] }] },
]

function gatewayPage() {
  return {
    id: 'root', type: 'container', tag: 'document',
    blocks: [{
      id: 'cats', type: 'container', tag: 'div', gatewayBinding: { endpointName: 'shop', routePath: '/catalog', fieldPath: '', bindingId: 'b1' },
      blocks: [
        leaf('cat-title', { fieldPath: 'title' }),
        { id: 'prods', type: 'container', tag: 'div', gatewayBinding: { scope: 'item', fieldPath: 'products' }, blocks: [
          leaf('prod-title', { fieldPath: 'title' }),
          leaf('prod-cat', { fieldPath: '^.title' }),
          { id: 'vars', type: 'container', tag: 'div', gatewayBinding: { scope: 'item', fieldPath: 'variants' }, blocks: [
            leaf('var-color', { fieldPath: 'color' }), leaf('var-prod', { fieldPath: '^.title' }), leaf('var-cat', { fieldPath: '^.^.title' }),
          ] },
        ] },
      ],
    }],
  }
}

describe('nested gateway lists', () => {
  it('three levels: every list repeats over the list of its own item, and ^. reads the item above', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ value: response }) }) as Response)
    vi.stubGlobal('fetch', fetchMock)
    try {
      const out = await walkTree(gatewayPage(), {}, { api: base() })
      expect(fetchMock).toHaveBeenCalledTimes(1) // only the outer list is fetched
      const cats = out.children[0]
      // the children of the outer list: [cat-title, prods] per category
      const [shoesTitle, shoesProds, hatsTitle, hatsProds] = cats.children
      expect(shoesTitle.content).toBe('Shoes')
      expect(hatsTitle.content).toBe('Hats')
      // products of Shoes: [prod-title, prod-cat, vars] per product
      expect(shoesProds.children.map((c) => c.content).filter(Boolean)).toEqual(['Boot', 'Shoes', 'Sneaker', 'Shoes'])
      expect(hatsProds.children.map((c) => c.content).filter(Boolean)).toEqual(['Cap', 'Hats'])
      // variants of Boot: [color, ^.title, ^.^.title] per variant
      const bootVars = shoesProds.children.find((c) => c.id === 'vars')!
      expect(bootVars.children.map((c) => c.content)).toEqual(['red', 'Boot', 'Shoes', 'blue', 'Boot', 'Shoes'])
      const sneakerVars = shoesProds.children.filter((c) => c.id === 'vars')[1]
      expect(sneakerVars.children.map((c) => c.content)).toEqual(['white', 'Sneaker', 'Shoes'])
    } finally { vi.unstubAllGlobals() }
  })

  it('an item without the list gives an empty list, not an error; limit and filters apply', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ value: [{ title: 'A' }, { title: 'B', products: [{ title: 'x' }, { title: 'y' }, { title: 'z' }] }] }) }) as Response))
    try {
      const page = gatewayPage()
      const prods = (page.blocks[0] as any).blocks[1]
      prods.gatewayBinding.limit = 2
      prods.gatewayBinding.filters = [{ field: 'title', operator: 'neq', value: 'x' }]
      prods.blocks = [leaf('t', { fieldPath: 'title' })]
      const out = await walkTree(page, {}, { api: base() })
      const [, aProds, , bProds] = out.children[0].children
      expect(aProds.children).toHaveLength(0)
      expect(bProds.children.map((c) => c.content)).toEqual(['y', 'z'])
    } finally { vi.unstubAllGlobals() }
  })

  it('a relative path to one object is a single record for the children', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ value: [{ title: 'A', maker: { name: 'Acme' } }] }) }) as Response))
    try {
      const page = {
        id: 'root', type: 'container', tag: 'document',
        blocks: [{ id: 'cats', type: 'container', tag: 'div', gatewayBinding: { endpointName: 's', routePath: '/c', fieldPath: '', bindingId: 'b' }, blocks: [
          { id: 'm', type: 'container', tag: 'div', gatewayBinding: { scope: 'item', fieldPath: 'maker' }, blocks: [leaf('n', { fieldPath: 'name' }), leaf('up', { fieldPath: '^.title' })] },
        ] }],
      }
      const out = await walkTree(page, {}, { api: base() })
      expect(text(out)).toEqual(['Acme', 'A'])
    } finally { vi.unstubAllGlobals() }
  })

  it('a nested list outside any item renders empty and never fetches', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    try {
      const page = { id: 'root', type: 'container', tag: 'document', blocks: [{ id: 'orphan', type: 'container', tag: 'div', gatewayBinding: { scope: 'item', fieldPath: 'products' }, blocks: [leaf('t', { fieldPath: 'title' })] }, leaf('alone', { fieldPath: 'title' })] }
      const out = await walkTree(page, {}, { api: base() })
      expect(fetchMock).not.toHaveBeenCalled()
      expect(out.children[0].children).toHaveLength(0)
      expect(out.children[1].content).toBe('')
    } finally { vi.unstubAllGlobals() }
  })

  it('the selection of linked bindings works on a nested list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ value: response }) }) as Response))
    try {
      const page = gatewayPage()
      ;(page.blocks[0] as any).blocks[1].selection = { listen: { name: 'p', field: 'id' } }
      const out = await walkTree(page, {}, { api: base() })
      const prodItems = out.children[0].children[1].children
      expect(prodItems[0].attributes['data-whoobe-key']).toBe('10')
    } finally { vi.unstubAllGlobals() }
  })
})

describe('nested lists of a Data Object', () => {
  const page = {
    id: 'root', type: 'container', tag: 'document',
    blocks: [{
      id: 'pages', type: 'container', tag: 'div', dataBinding: { className: 'Page', resolveMode: 'query', target: 'children' },
      blocks: [
        { id: 'title', type: 'element', tag: 'element', element: 'p', dataBinding: { className: 'Page', field: 'title', target: 'content', resolveMode: 'parent' } },
        { id: 'blocks', type: 'container', tag: 'div', dataBinding: { className: 'Page', field: 'blocks', target: 'list', resolveMode: 'parent' }, blocks: [
          { id: 'h', type: 'element', tag: 'element', element: 'p', dataBinding: { className: 'Page', field: 'heading', target: 'content', resolveMode: 'parent' } },
          { id: 'ph', type: 'element', tag: 'element', element: 'p', dataBinding: { className: 'Page', field: '^.title', target: 'content', resolveMode: 'parent' } },
        ] },
      ],
    }],
  }
  it('repeats over the list held by a field and binds the items like objects; ^. reaches the object', async () => {
    const api = base({ queryObjects: async () => [{ id: 'o1', attributes: { title: 'Home', blocks: [{ heading: 'Hero' }, { heading: 'Footer' }] } }] as any })
    const out = await walkTree(page, {}, { api })
    const [title, blocks] = out.children[0].children
    expect(title.content).toBe('Home')
    expect(blocks.content).toBe('') // the list container is not itself a bound text
    expect(blocks.children.map((c) => c.content)).toEqual(['Hero', 'Home', 'Footer', 'Home'])
  })
  it('an object without the list renders an empty list', async () => {
    const api = base({ queryObjects: async () => [{ id: 'o1', attributes: { title: 'Home' } }] as any })
    const out = await walkTree(page, {}, { api })
    expect(out.children[0].children[1].children).toHaveLength(0)
  })
})
