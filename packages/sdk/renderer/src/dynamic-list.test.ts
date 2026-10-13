import { describe, it, expect, vi } from 'vitest'
import { walkTree } from './walk.js'
import { resolveDynamicChildren } from './dynamic-list.js'
import type { RenderApi } from './api-client.js'

const api = (over: Partial<RenderApi> = {}): RenderApi => ({ getObject: async () => null, queryObjects: async () => [], gatewayUrl: 'http://gw', ...over })
const leaf = (id: string, fieldPath: string) => ({ id, type: 'element', tag: 'element', element: 'p', gatewayBinding: { scope: 'item', fieldPath } })
const page = (blocks: unknown[]) => ({ id: 'root', type: 'container', tag: 'document', blocks })
// categories (fetched on the server) publish `category`; the products list takes its route parameter from it
const catalogue = page([
  { id: 'cats', type: 'container', tag: 'div', selection: { publish: { name: 'category', field: 'id' } }, gatewayBinding: { endpointName: 'shop', routePath: '/categories', fieldPath: '', bindingId: 'cats-b' }, blocks: [leaf('cn', 'name')] },
  { id: 'prods', type: 'container', tag: 'div', gatewayBinding: { endpointName: 'shop', routePath: '/catalogue/category/{id}', fieldPath: 'products', params: { id: '{selection.category}', lang: 'it' }, bindingId: 'prods-b' }, blocks: [leaf('pn', 'name'), leaf('pc', '^.name')] },
])

describe('a list that depends on a selection', () => {
  it('the server renders it empty, marks it, and does not call the gateway for it', async () => {
    const calls: any[] = []
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => { calls.push(JSON.parse(init.body as string)); return { ok: true, json: async () => ({ value: [{ id: 12, name: 'Shoes' }, { id: 13, name: 'Hats' }] }) } as Response }))
    try {
      const out = await walkTree(catalogue, {}, { api: api() })
      expect(calls.map((c) => c.bindingId)).toEqual(['cats-b']) // only the categories
      const [cats, prods] = out.children
      expect(cats.children.filter((c) => c.content).map((c) => c.content)).toEqual(['Shoes', 'Hats'])
      expect(cats.children[0].attributes['data-whoobe-value']).toBe('12')
      expect(prods.children).toEqual([])
      expect(prods.dynamicList).toEqual({ selections: ['category'] })
      expect(cats.dynamicList).toBeUndefined()
    } finally { vi.unstubAllGlobals() }
  })

  it('in the browser: the route parameter is the chosen value, the other parameters stay, and the items are walked like on the server', async () => {
    const calls: any[] = []
    vi.stubGlobal('fetch', vi.fn(async (u: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string)
      calls.push({ u, body })
      return { ok: true, json: async () => ({ value: body.bindingId === 'cats-b' ? [{ id: 12, name: 'Shoes' }] : { products: [] } }) } as Response
    }))
    try {
      const out = await walkTree(catalogue, {}, { api: api() })
      calls.length = 0
      vi.stubGlobal('fetch', vi.fn(async (u: string, init: RequestInit) => { calls.push({ u, body: JSON.parse(init.body as string) }); return { ok: true, json: async () => ({ value: [{ id: 1, name: 'Boot' }, { id: 2, name: 'Sneaker' }] }) } as Response }))
      const kids = await resolveDynamicChildren(out.children[1], { api: api() }, (n) => (n === 'category' ? '12' : null))
      expect(calls).toHaveLength(1)
      expect(calls[0].u).toBe('http://gw/api/v1/gateway/resolve')
      expect(calls[0].body).toEqual({ bindingId: 'prods-b', params: { id: '12', lang: 'it' } })
      expect(kids!.map((k) => k.content)).toEqual(['Boot', '', 'Sneaker', ''])
    } finally { vi.unstubAllGlobals() }
  })

  it('nothing is fetched while the selection is empty: the list is empty', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    try {
      const desc = (await walkTree(page([catalogue.blocks[1]]), {}, { api: api() })).children[0]
      expect(await resolveDynamicChildren(desc, { api: api() }, () => null)).toEqual([])
      expect(fetchMock).not.toHaveBeenCalled()
    } finally { vi.unstubAllGlobals() }
  })

  it('uses the same-origin proxy of the site when there is one, and never sends a key from the browser', async () => {
    const seen: any[] = []
    vi.stubGlobal('fetch', vi.fn(async (u: string, init: RequestInit) => { seen.push({ u, headers: init.headers, body: JSON.parse(init.body as string) }); return { ok: true, json: async () => ({ value: [] }) } as Response }))
    try {
      const desc = (await walkTree(page([catalogue.blocks[1]]), {}, { api: api() })).children[0]
      const proxied = api({ gatewayResolveProxyPath: '/api/whoobe-gateway-resolve', gatewaySiteAuth: { siteId: 's', siteKey: 'k' } })
      await resolveDynamicChildren(desc, { api: proxied }, () => '12')
      expect(seen[0].u).toBe('/api/whoobe-gateway-resolve')
      expect(JSON.stringify(seen[0].headers)).not.toContain('Site-Key')
    } finally { vi.unstubAllGlobals() }
  })

  it('a gateway error keeps what is shown (null), a plain object is one record', async () => {
    const desc = (await walkTree(page([{ ...(catalogue.blocks[1] as any), gatewayBinding: { ...(catalogue.blocks[1] as any).gatewayBinding, fieldPath: '' } }]), {}, { api: api() })).children[0]
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) }) as Response))
    try {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      expect(await resolveDynamicChildren(desc, { api: api() }, () => '12')).toBeNull()
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ value: { name: 'Shoes' } }) }) as Response))
      const kids = await resolveDynamicChildren(desc, { api: api() }, () => '12')
      expect(kids!.map((k) => k.content)).toEqual(['Shoes', ''])
    } finally { vi.unstubAllGlobals(); vi.restoreAllMocks() }
  })

  it('a descriptor that is not a dynamic list gives null', async () => {
    const out = await walkTree(page([{ id: 'p', type: 'element', tag: 'element', element: 'p', content: 'x' }]), {}, { api: api() })
    expect(await resolveDynamicChildren(out.children[0], { api: api() }, () => 'x')).toBeNull()
  })
})
