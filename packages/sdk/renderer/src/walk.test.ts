import { describe, it, expect, vi } from 'vitest'
import { walkTree } from './walk.js'
import type { RenderApi } from './api-client.js'

const makeApi = (overrides: Partial<RenderApi> = {}): RenderApi => ({
  getObject: async () => null,
  queryObjects: async () => [],
  ...overrides,
})

describe('walkTree', () => {
  it('walks a simple tree with kind/tag/content/className', async () => {
    const tree = {
      id: 'root', type: 'container', tag: 'document',
      css: { css: 'p-8', container: 'flex flex-col' },
      blocks: [
        { id: 'h', type: 'element', tag: 'element', element: 'h', level: 1, content: 'Title', css: { css: 'text-2xl', container: '' } },
        { id: 'p', type: 'element', tag: 'element', element: 'p', content: 'Body' },
        { id: 'img', type: 'element', tag: 'element', element: 'img', image: { url: '/uploads/hero.jpg', alt: 'Hero' } },
      ],
    }
    const out = await walkTree(tree, {}, { api: makeApi(), assetBaseUrl: 'http://dam:3002/dam-asset' })
    expect(out.kind).toBe('container')
    expect(out.className).toBe('p-8 flex flex-col')
    expect(out.children).toHaveLength(3)

    const [h, p, img] = out.children
    expect(h.kind).toBe('heading')
    expect(h.tag).toBe('h1')
    expect(h.content).toBe('Title')
    expect(h.className).toBe('text-2xl')

    expect(p.kind).toBe('paragraph')
    expect(p.content).toBe('Body')

    expect(img.kind).toBe('image')
    expect(img.image?.url).toBe('http://dam:3002/dam-asset/uploads/hero.jpg')
    expect(img.image?.alt).toBe('Hero')
  })

  it('resolves relative bound fields against the context record', async () => {
    const tree = {
      id: 'root', type: 'container', tag: 'document',
      blocks: [{ id: 'p', type: 'element', tag: 'element', element: 'p', dataBinding: { className: 'X', target: 'text', resolveMode: 'explicit', field: 'message' } }],
    }
    const out = await walkTree(tree, { record: { attributes: { message: '<b>hello</b>' } } }, { api: makeApi() })
    expect(out.children[0].content).toBe('&lt;b&gt;hello&lt;/b&gt;')
  })

  it('repeats children per record for a query binding and resolves per-record dynamic links', async () => {
    const api = makeApi({
      queryObjects: async (params) => {
        expect(params.class).toBe('Newsletter')
        return [
          { id: 'r1', attributes: { name: 'Antonio', slug: 'antonio' } },
          { id: 'r2', attributes: { name: 'Maria', slug: 'maria' } },
        ]
      },
    })
    const tree = {
      id: 'list', type: 'container', tag: 'document',
      dataBinding: { className: 'Newsletter', target: 'collection', resolveMode: 'query' },
      blocks: [
        { id: 'p', type: 'element', tag: 'element', element: 'p', content: '{name}', dataBinding: { className: 'Newsletter', target: 'text', resolveMode: 'explicit', field: 'name' } },
        { id: 'a', type: 'element', tag: 'element', element: 'p', link: '', dynamicLink: { targetPageId: 'detail', valueField: 'slug' } },
      ],
    }
    const resolveTargetPage = async () => ({ slug: '/it/news/{slug}', locale: 'it' })
    const out = await walkTree(tree, {}, { api, resolveTargetPage })
    expect(out.children).toHaveLength(4) // 2 records x 2 children
    expect(out.children[0].content).toBe('Antonio')
    expect(out.children[1].link?.href).toBe('/it/news/antonio')
    expect(out.children[2].content).toBe('Maria')
    expect(out.children[3].link?.href).toBe('/it/news/maria')
  })

  it('falls back to # for unresolvable dynamic links', async () => {
    const api = makeApi()
    const tree = {
      id: 'root', type: 'container', tag: 'document',
      blocks: [{ id: 'a', type: 'element', tag: 'element', element: 'p', dynamicLink: { targetPageId: 'missing', valueField: 'slug' } }],
    }
    const out = await walkTree(tree, { record: { attributes: { slug: 'x' } } }, { api })
    expect(out.children[0].link?.href).toBe('#')
  })

  it('resolves gateway-sourced dynamic links from the raw context record, not .attributes', async () => {
    const api = makeApi()
    const tree = {
      id: 'root', type: 'container', tag: 'document',
      blocks: [{ id: 'a', type: 'element', tag: 'element', element: 'p', dynamicLink: { targetPageId: 'detail', valueField: 'id', source: 'gateway' } }],
    }
    // A gateway-resolved record is the raw API row (no .attributes wrapper),
    // unlike a Data Object record - resolveNodeLink's 'gateway' branch must
    // read `id` directly off the record, not `.attributes.id`.
    const resolveTargetPage = async () => ({ slug: '/product/{id}', locale: 'en' })
    const out = await walkTree(tree, { record: { id: 42, name: 'Widget' } }, { api, resolveTargetPage })
    expect(out.children[0].link?.href).toBe('/product/42')
  })

  it('carries linkTarget ("Opens in") through on a resolved per-record dynamic link', async () => {
    const api = makeApi()
    const tree = {
      id: 'root', type: 'container', tag: 'document',
      blocks: [{ id: 'a', type: 'element', tag: 'element', element: 'p', dynamicLink: { targetPageId: 'detail', valueField: 'slug' }, linkTarget: '_blank' }],
    }
    const resolveTargetPage = async () => ({ slug: '/product/{slug}', locale: 'en' })
    const out = await walkTree(tree, { record: { attributes: { slug: 'widget' } } }, { api, resolveTargetPage })
    expect(out.children[0].link?.href).toBe('/product/widget')
    expect(out.children[0].link?.target).toBe('_blank')
  })

  it('substitutes a {param}-placeholder filter value from ctx.urlParams (list->detail page binding)', async () => {
    const api = makeApi({
      queryObjects: async (params) => {
        expect(params.filters).toEqual([{ field: 'slug', operator: 'eq', value: 'antonio' }])
        return [{ id: 'r1', attributes: { name: 'Antonio', slug: 'antonio' } }]
      },
    })
    const tree = {
      id: 'root', type: 'container', tag: 'document',
      dataBinding: { className: 'Newsletter', target: 'object', resolveMode: 'first', filters: [{ field: 'slug', operator: 'eq', value: '{slug}' }] },
      blocks: [{ id: 'p', type: 'element', tag: 'element', element: 'p', dataBinding: { className: 'Newsletter', target: 'text', resolveMode: 'explicit', field: 'name' } }],
    }
    const out = await walkTree(tree, { urlParams: { slug: 'antonio' } }, { api })
    expect(out.children[0].content).toBe('Antonio')
  })

  it('leaves a {param} filter literal when urlParams has no matching key', async () => {
    const api = makeApi({
      queryObjects: async (params) => {
        expect(params.filters).toEqual([{ field: 'slug', operator: 'eq', value: '{slug}' }])
        return []
      },
    })
    const tree = {
      id: 'root', type: 'container', tag: 'document',
      dataBinding: { className: 'Newsletter', target: 'object', resolveMode: 'first', filters: [{ field: 'slug', operator: 'eq', value: '{slug}' }] },
      blocks: [],
    }
    await walkTree(tree, {}, { api })
  })

  it('substitutes {param}-placeholder gatewayBinding.params from ctx.urlParams (gateway detail page binding)', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string)
      // bindingId-only (docs/plans/api-gateway/gateway-auth-authz.md) -
      // endpointName/routePath/fieldPath are resolved server-side from it,
      // never sent by the client.
      expect(body.bindingId).toBe('binding-1')
      expect(body.params).toEqual({ id: '42' })
      return {
        ok: true,
        json: async () => ({ value: { id: 42, title: 'Widget' } }),
      } as Response
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      const tree = {
        id: 'root', type: 'container', tag: 'document',
        gatewayBinding: { endpointName: 'shop', routePath: '/products/{id}', fieldPath: '', params: { id: '{id}' }, bindingId: 'binding-1' },
        blocks: [{ id: 'p', type: 'element', tag: 'element', element: 'p', gatewayBinding: { endpointName: 'shop', routePath: '/products/{id}', fieldPath: 'title' } }],
      }
      const out = await walkTree(tree, { urlParams: { id: '42' } }, { api: makeApi() })
      expect(out.children[0].content).toBe('Widget')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('gatewayBinding with no bindingId resolves to no content instead of calling the gateway (unsaved/unbound content)', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    try {
      const tree = {
        id: 'root', type: 'container', tag: 'document',
        blocks: [{ id: 'p', type: 'element', tag: 'element', element: 'p', gatewayBinding: { endpointName: 'shop', routePath: '/products', fieldPath: 'name' } }],
      }
      const out = await walkTree(tree, {}, { api: makeApi() })
      expect(out.children[0].content).toBe('')
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('applies a configured transform to a gatewayBinding field value, resolved from the context record', async () => {
    const api = makeApi()
    const tree = {
      id: 'root', type: 'container', tag: 'document',
      blocks: [{
        id: 'p', type: 'element', tag: 'element', element: 'p',
        gatewayBinding: {
          endpointName: 'shop', routePath: '/products', fieldPath: 'price',
          transform: { type: 'number', options: { style: 'currency', currency: 'USD', useGrouping: true } },
        },
      }],
    }
    const out = await walkTree(tree, { record: { price: 19.9 } }, { api })
    expect(out.children[0].content).toBe('$19.90')
  })

  it('escapes an untransformed gatewayBinding value instead of emitting it as raw HTML', async () => {
    const api = makeApi()
    const tree = {
      id: 'root', type: 'container', tag: 'document',
      blocks: [{ id: 'p', type: 'element', tag: 'element', element: 'p', gatewayBinding: { endpointName: 'shop', routePath: '/products', fieldPath: 'name' } }],
    }
    const out = await walkTree(tree, { record: { name: '<script>alert(1)</script>' } }, { api })
    expect(out.children[0].content).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('passes through form/search/slider configs', async () => {
    const tree = {
      id: 'root', type: 'container', tag: 'document',
      blocks: [
        { id: 'f', type: 'container', tag: 'form', element: 'form', formConfig: { enabled: true, targetClassId: 'c1', successMessage: 'ok', errorMessage: 'no', successRedirectUrl: '', errorRedirectUrl: '', notify: { enabled: false, mailTemplateId: '', templatePageId: '', recipientEmail: '', subject: '' } } },
        { id: 's', type: 'element', tag: 'search', element: 'search', searchConfig: { types: { page: true, object: false, asset: false }, classIds: [] } },
      ],
    }
    const out = await walkTree(tree, {}, { api: makeApi() })
    expect(out.children[0].kind).toBe('form')
    expect(out.children[0].formConfig?.targetClassId).toBe('c1')
    expect(out.children[1].kind).toBe('search')
    expect(out.children[1].searchConfig?.types.page).toBe(true)
  })

  it('validates malformed trees and throws', async () => {
    await expect(walkTree({ type: 'container', tag: 'document' }, {}, { api: makeApi() })).rejects.toThrow(/schema validation|id/)
  })

  it('carries select options in the descriptor', async () => {
    const tree = {
      id: 'root', type: 'container', tag: 'document',
      blocks: [{ id: 'sel', type: 'element', tag: 'select', element: 'select', data: { attributes: { name: 'city' }, options: [{ label: 'Rome', value: 'roma' }] } }],
    }
    const out = await walkTree(tree, {}, { api: makeApi() })
    expect(out.children[0].options).toEqual([{ label: 'Rome', value: 'roma' }])
  })
})
