import { describe, it, expect } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { walkTree, ApiClient } from '@whoobe-cms/renderer'
import { WhoobeProvider, WhoobeNode } from './components.js'
import type { WhoobeApi } from './types.js'

const api: WhoobeApi = {
  getPage: async () => ({ page: { content: null }, params: {} }),
  getObject: async () => null,
  queryObjects: async () => [],
  search: async () => ({ results: [] }),
  submitForm: async () => ({ success: true }),
}

async function render(descriptor: Awaited<ReturnType<typeof walkTree>>, registry = {}) {
  const app = createSSRApp({
    render: () =>
      h(WhoobeProvider, { registry, api, assetBaseUrl: 'http://dam:3002/dam-asset' } as any, () =>
        h(WhoobeNode, { descriptor } as any),
      ),
  })
  return renderToString(app)
}

describe('WhoobeNode (SSR)', () => {
  it('renders an `a` element that has its text in `content` and no child as a link with that text', async () => {
    const tree = {
      id: 'root', type: 'container', tag: 'document', element: 'div', css: { css: '', container: '' },
      blocks: [{ id: 'l1', type: 'element', tag: 'element', element: 'a', content: 'Platform', link: '/platform', css: { css: 'text-sm', container: '' } }],
    }
    const html = await render(await walkTree(tree, {}, { api, assetBaseUrl: 'http://dam:3002/dam-asset' }))
    expect(html).toMatch(/<a href="\/platform"[^>]*class="text-sm"[^>]*>Platform<\/a>/)
  })

  it('renders an Audio element as a plain player with the source resolved like an image', async () => {
    const tree = {
      id: 'root', type: 'container', tag: 'document', element: 'div', css: { css: '', container: '' },
      blocks: [
        { id: 'a1', type: 'element', tag: 'element', element: 'audio', image: { url: '/audio/song.mp3' }, css: { css: 'w-full', container: '' }, options: { mode: 'waveform', loop: true, preload: 'auto' } },
        { id: 'a2', type: 'element', tag: 'element', element: 'audio', image: { url: 'https://cdn.example.com/x.mp3' }, css: { css: '', container: '' }, options: { controls: false } },
      ],
    }
    const html = await render(await walkTree(tree, {}, { api, assetBaseUrl: 'http://dam:3002/dam-asset' }))
    expect(html).toContain('src="http://dam:3002/dam-asset/audio/song.mp3"')
    expect(html).toContain('src="https://cdn.example.com/x.mp3"')
    expect(html).toContain('loop')
    expect(html).toContain('preload="auto"')
    expect(html).toContain('data-whoobe-audio="waveform"')
    expect(html.match(/<audio[^>]*>/g)?.[1]).not.toContain('controls')
  })

  it('renders a Download element as a link to its asset or URL, with the download attribute', async () => {
    const mk = (id: string, image: any, extra: any = {}) => ({ id, type: 'file', tag: 'file', element: 'button', content: 'Get the PDF', image, css: { css: 'btn px-4', container: '' }, ...extra })
    const tree = {
      id: 'root', type: 'container', tag: 'document', element: 'div', css: { css: '', container: '' },
      blocks: [
        mk('d1', { url: '/files/brochure.pdf' }, { linkTarget: '_blank' }),
        mk('d2', { url: 'https://cdn.example.com/x.zip' }),
        mk('d3', { url: null }),
      ],
    }
    const html = await render(await walkTree(tree, {}, { api, assetBaseUrl: 'http://dam:3002/dam-asset' }))
    const anchors = html.match(/<a [^>]*>/g) ?? []
    expect(anchors).toHaveLength(2)
    expect(anchors[0]).toContain('href="http://dam:3002/dam-asset/files/brochure.pdf"')
    // "open in a new tab" opens the file (target) instead of saving it (no download attribute)
    expect(anchors[0]).toContain('target="_blank"')
    expect(anchors[0]).not.toContain('download')
    expect(anchors[1]).toContain('download')
    expect(anchors[1]).toContain('href="https://cdn.example.com/x.zip"')
    // no file chosen: an inert button, the label kept
    expect(html).toMatch(/<button[^>]*>Get the PDF<\/button>/)
    expect(html).not.toContain('<img')
  })

  it('renders a container with heading + paragraph + image defaults', async () => {
    const tree = {
      id: 'root', type: 'container', tag: 'document', element: 'div', css: { css: 'p-8', container: 'flex flex-col' },
      blocks: [
        { id: 'h', type: 'element', tag: 'element', element: 'h', level: 2, content: 'Title', css: { css: 'text-2xl', container: '' } },
        { id: 'p', type: 'element', tag: 'element', element: 'p', content: 'Hello <b>world</b>', css: { css: '', container: '' } },
        { id: 'img', type: 'element', tag: 'element', element: 'img', image: { url: '/uploads/hero.jpg', alt: 'Hero' }, css: { css: 'w-40', container: '' } },
      ],
    }
    const desc = await walkTree(tree, {}, { api, assetBaseUrl: 'http://dam:3002/dam-asset' })
    const html = await render(desc)
    expect(html).toContain('class="p-8 flex flex-col"')
    expect(html).toContain('<h2 class="text-2xl">Title</h2>')
    expect(html).toContain('<p>Hello <b>world</b></p>')
    expect(html).toContain('src="http://dam:3002/dam-asset/uploads/hero.jpg"')
  })

  it('uses a registry override for a node kind', async () => {
    const tree = {
      id: 'root', type: 'container', tag: 'document', css: { css: '', container: '' },
      blocks: [{ id: 'p', type: 'element', tag: 'element', element: 'p', content: 'hi', css: { css: '', container: '' } }],
    }
    const desc = await walkTree(tree, {}, { api })
    const customParagraph = {
      props: ['descriptor'],
      setup(props: any) {
        return () => h('mark', {}, (props.descriptor as any).content)
      },
    }
    const html = await render(desc, { paragraph: customParagraph })
    expect(html).toContain('<mark>hi</mark>')
    expect(html).not.toContain('<p>')
  })

  it('escapes bound field values', async () => {
    const tree = {
      id: 'root', type: 'container', tag: 'document', css: { css: '', container: '' },
      blocks: [{ id: 'p', type: 'element', tag: 'element', element: 'p', content: '', css: { css: '', container: '' }, dataBinding: { className: 'X', target: 'text', resolveMode: 'explicit', field: 'message' } }],
    }
    const desc = await walkTree(tree, { record: { attributes: { message: '<script>bad</script>' } } }, { api })
    const html = await render(desc)
    expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;')
    expect(html).not.toContain('<script>')
  })
})

describe('createWhoobeApi', () => {
  it('builds an ApiClient-based api', async () => {
    const { createWhoobeApi } = await import('./components.js')
    const a = createWhoobeApi('http://cms:3003')
    expect(a).toBeInstanceOf(ApiClient)
  })
})

describe('Upload field', () => {
  it('renders a file input that names itself, with accept and multiple', async () => {
    const tree = {
      id: 'root', type: 'container', tag: 'document', element: 'div', css: { css: '', container: '' },
      blocks: [{ id: 'up1', type: 'file', tag: 'input', element: 'input', css: { css: 'block', container: '' }, uploadConfig: { extensions: ['pdf'], maxFiles: 3, targetFolder: 'private/x' },
        data: { attributes: { type: 'file', name: 'cv', accept: '.pdf', multiple: true } } }],
    }
    const html = await render(await walkTree(tree, {}, { api }))
    const input = html.match(/<input[^>]*>/)?.[0] ?? ''
    expect(input).toContain('type="file"')
    expect(input).toContain('name="cv"')
    expect(input).toContain('accept=".pdf"')
    expect(input).toContain('multiple')
    expect(input).toContain('data-whoobe-upload="up1"')
  })
})

describe('the Table element (SSR)', () => {
  const cell = (content: string, extra: object = {}) => ({ id: content, content, colspan: 1, rowspan: 1, merged: false, ...extra })
  const tableNode = (table: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    id: 'root', type: 'container', tag: 'document', element: 'div', css: { css: '', container: '' },
    blocks: [{ id: 't', type: 'element', tag: 'table', element: 'table', blocks: [], css: { css: 'w-full', container: '' },
      table: { cols: 2, hasHeader: true, hasFooter: false, caption: '', header: [cell('H1'), cell('H2')], body: [[cell('a'), cell('b')]], footer: [], headerCellClass: 'hc', bodyRowClass: 'br', ...table }, ...extra }],
  })
  const rec = (name: string, price: unknown) => ({ attributes: { name, price } })
  const list = Array.from({ length: 7 }, (_, i) => rec('Item ' + (i + 1), i + 1))
  const listApi: WhoobeApi = { ...api, queryObjects: async () => list as never }
  const renderWith = async (tree: unknown, a: WhoobeApi, opts: Record<string, unknown> = {}, registry = {}) => {
    const descriptor = await walkTree(tree, {}, { api: a, ...opts })
    const app = createSSRApp({ render: () => h(WhoobeProvider, { registry, api: a } as any, () => h(WhoobeNode, { descriptor } as any)) })
    return renderToString(app)
  }
  const binding = { className: 'P', target: 'custom', resolveMode: 'query', rowsPerPage: 3 }

  it('draws a typed table: caption, header, body, spans and classes', async () => {
    const html = await renderWith(tableNode({ caption: 'Prices', header: [cell('H', { colspan: 2 }), cell('x', { merged: true })], body: [[cell('<b>a</b>'), cell('b')]] }), api)
    expect(html).toContain('<caption>Prices</caption>')
    expect(html).toMatch(/<th[^>]*colspan="2"/)
    expect(html).toContain('<b>a</b>')
    expect(html).toContain('class="w-full"')
    expect(html).not.toMatch(/>x</)
  })
  it('cleans hostile HTML in a typed cell', async () => {
    const html = await renderWith(tableNode({ body: [[cell('<img src=x onerror="alert(1)"><script>alert(2)</script>ok')]] }), api)
    expect(html).not.toMatch(/onerror|<script/i)
    expect(html).toContain('ok')
  })
  it('draws the first page of a bound table, with the counter and the pager, rows beyond it left out', async () => {
    const html = await renderWith(tableNode({ columns: [{ id: 'a', header: 'Name', field: 'name' }, { id: 'b', header: 'Price', field: 'price' }], showCount: true }, { dataBinding: binding }), listApi)
    expect(html).toContain('Item 1')
    expect(html).toContain('Item 3')
    expect(html).not.toContain('Item 4')
    expect(html).toContain('Showing 1–3 of 7')
    expect(html).toContain('Page 1 of 3')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>‹ Prev/)
    expect(html).toContain('Next ›')
    expect(html).toContain('<th class="hc">Name</th>')
  })
  it('sort buttons with aria-sort and a search box, only when the table asks for them', async () => {
    const cols = [{ id: 'a', header: 'Name', field: 'name' }, { id: 'b', header: 'Price', field: 'price', sortable: false }]
    const on = await renderWith(tableNode({ columns: cols, sortable: true, searchable: true, searchPlaceholder: 'Find…' }, { dataBinding: binding }), listApi)
    expect(on).toContain('type="search"')
    expect(on).toContain('placeholder="Find…"')
    expect(on).toMatch(/<th[^>]*aria-sort="none"[^>]*><button[^>]*>Name<span[^>]*>↕<\/span>/)
    expect((on.match(/aria-sort/g) ?? []).length).toBe(1)
    const off = await renderWith(tableNode({ columns: cols }, { dataBinding: binding }), listApi)
    expect(off).not.toContain('type="search"')
    expect(off).not.toContain('aria-sort')
    expect(off).not.toMatch(/<th[^>]*><button/)
  })
  it('lazyload draws the first rows and a More button; an empty list says so; cell text stays text', async () => {
    const lazy = await renderWith(tableNode({ columns: [{ id: 'a', header: 'Name', field: 'name' }] }, { dataBinding: { ...binding, paginationMode: 'lazyload', loadMoreText: 'Show more' } }), listApi)
    expect(lazy).toContain('Show more')
    expect(lazy).toContain('3 / 7')
    const empty = await renderWith(tableNode({ columns: [{ id: 'a', header: 'Name', field: 'name' }], emptyText: 'Nothing here' }, { dataBinding: binding }), api)
    expect(empty).toContain('Nothing here')
    const hostile = await renderWith(tableNode({ columns: [{ id: 'a', header: 'Name', field: 'name' }] }, { dataBinding: { className: 'P', target: 'custom', resolveMode: 'query' } }),
      { ...api, queryObjects: async () => [rec('<img src=x onerror=alert(1)>', 1)] as never })
    expect(hostile).not.toContain('<img')
    expect(hostile).toContain('&lt;img')
  })
  it('says when the list was cut at the row cap', async () => {
    const html = await renderWith(tableNode({ columns: [{ id: 'a', header: 'Name', field: 'name' }] }, { dataBinding: { className: 'P', target: 'custom', resolveMode: 'query' } }), listApi, { tableMaxRows: 4 })
    expect(html).toContain('Showing the first 4 of 7 rows')
  })
  it('a consumer can replace the table', async () => {
    const Custom = { props: ['descriptor'], setup: (p: any) => () => h('div', { 'data-custom': '1' }, `${p.descriptor.table.bound.rows.length} rows`) }
    const html = await renderWith(tableNode({ columns: [{ id: 'a', header: 'Name', field: 'name' }] }, { dataBinding: binding }), listApi, {}, { table: Custom })
    expect(html).toContain('data-custom="1"')
    expect(html).toContain('7 rows')
  })

  it('linked bindings: the items of the two lists carry the selection attributes, and the listening ones start hidden', async () => {
    const rec = (attributes: Record<string, unknown>) => ({ id: String(attributes.id), attributes })
    const rows: Record<string, unknown[]> = { Category: [rec({ id: 12, name: 'Shoes' })], Product: [rec({ id: 1, title: 'Boot', category_id: 12 })] }
    const dataApi = { ...api, queryObjects: async (q: { class: string }) => rows[q.class] ?? [] } as never
    const list = (id: string, cls: string, field: string, selection: unknown) => ({ id, type: 'container', tag: 'div', css: { css: '', container: '' }, dataBinding: { className: cls, resolveMode: 'query', target: 'children' }, selection, blocks: [{ id: id + 'p', type: 'element', tag: 'p', element: 'p', css: { css: '', container: '' }, dataBinding: { className: cls, field, target: 'content', resolveMode: 'parent' } }] })
    const tree = { id: 'root', type: 'container', tag: 'document', css: { css: '', container: '' }, blocks: [list('cats', 'Category', 'name', { publish: { name: 'category', field: 'id' } }), list('prods', 'Product', 'title', { listen: { name: 'category', field: 'category_id' } })] }
    const descriptor = await walkTree(tree, {}, { api: dataApi })
    const html = await render(descriptor)
    expect(html).toContain('data-whoobe-select="category"')
    expect(html).toContain('data-whoobe-value="12"')
    expect(html).toContain('data-whoobe-listen="category"')
    expect(html).toContain('data-whoobe-key="12"')
    expect(html).toMatch(/display:\s*none\s*!important/)
  })

  it('a list that depends on a selection is rendered empty on the server', async () => {
    const dyn = { id: 'root', type: 'container', tag: 'document', css: { css: '', container: '' }, blocks: [{ id: 'prods', type: 'container', tag: 'div', css: { css: 'prods', container: '' }, gatewayBinding: { endpointName: 's', routePath: '/c/{id}', fieldPath: 'products', params: { id: '{selection.category}' }, bindingId: 'b' }, blocks: [{ id: 'p', type: 'element', tag: 'p', element: 'p', content: 'TEMPLATE', css: { css: '', container: '' } }] }] }
    const descriptor = await walkTree(dyn, {}, { api: api as never })
    expect(descriptor.children[0].dynamicList).toEqual({ selections: ['category'] })
    const html = await render(descriptor)
    expect(html).toContain('prods')
    expect(html).not.toContain('TEMPLATE')
  })
})
