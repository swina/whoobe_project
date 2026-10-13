import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import { walkTree } from '@whoobe-cms/renderer'
import TestTree from './TestTree.svelte'
import MarkParagraph from './MarkParagraph.svelte'

const api: any = {
  getPage: async () => ({ page: { content: null }, params: {} }),
  getObject: async () => null,
  queryObjects: async () => [],
  search: async () => ({ results: [] }),
  submitForm: async () => ({ success: true }),
}

async function renderTree(tree: unknown, registry: Record<string, any> = {}, ctx: Record<string, unknown> = {}) {
  const descriptor = await walkTree(tree, ctx, { api, assetBaseUrl: 'http://dam:3002/dam-asset' })
  const r = render(TestTree, {
    props: { registry, api, assetBaseUrl: 'http://dam:3002/dam-asset', descriptor },
  })
  return r.body
}

describe('linked bindings (SSR)', () => {
  it('a list that depends on a selection is rendered empty on the server', async () => {
    const dyn = { id: 'root', type: 'container', tag: 'document', css: { css: '', container: '' }, blocks: [{ id: 'prods', type: 'container', tag: 'div', css: { css: 'prods', container: '' }, gatewayBinding: { endpointName: 's', routePath: '/c/{id}', fieldPath: 'products', params: { id: '{selection.category}' }, bindingId: 'b' }, blocks: [{ id: 'p', type: 'element', tag: 'p', element: 'p', content: 'TEMPLATE', css: { css: '', container: '' } }] }] }
    const descriptor = await walkTree(dyn, {}, { api })
    expect(descriptor.children[0].dynamicList).toEqual({ selections: ['category'] })
    const html = render(TestTree, { props: { registry: {}, api, assetBaseUrl: 'http://dam:3002/dam-asset', descriptor } }).body
    expect(html).toContain('prods')
    expect(html).not.toContain('TEMPLATE')
  })
  it('the items of the two lists carry the selection attributes, and the listening ones start hidden', async () => {
    const rec = (attributes: Record<string, unknown>) => ({ id: String(attributes.id), attributes })
    const rows: Record<string, unknown[]> = { Category: [rec({ id: 12, name: 'Shoes' })], Product: [rec({ id: 1, title: 'Boot', category_id: 12 })] }
    const dataApi: any = { ...api, queryObjects: async (q: { class: string }) => rows[q.class] ?? [] }
    const list = (id: string, cls: string, field: string, selection: unknown) => ({ id, type: 'container', tag: 'div', css: { css: '', container: '' }, dataBinding: { className: cls, resolveMode: 'query', target: 'children' }, selection, blocks: [{ id: id + 'p', type: 'element', tag: 'p', element: 'p', css: { css: '', container: '' }, dataBinding: { className: cls, field, target: 'content', resolveMode: 'parent' } }] })
    const tree = { id: 'root', type: 'container', tag: 'document', css: { css: '', container: '' }, blocks: [list('cats', 'Category', 'name', { publish: { name: 'category', field: 'id' } }), list('prods', 'Product', 'title', { listen: { name: 'category', field: 'category_id' } })] }
    const descriptor = await walkTree(tree, {}, { api: dataApi })
    const html = render(TestTree, { props: { registry: {}, api: dataApi, assetBaseUrl: 'http://dam:3002/dam-asset', descriptor } }).body
    expect(html).toContain('data-whoobe-select="category"')
    expect(html).toContain('data-whoobe-value="12"')
    expect(html).toContain('data-whoobe-listen="category"')
    expect(html).toContain('data-whoobe-key="12"')
    expect(html).toMatch(/display:\s*none\s*!important/)
  })
})

describe('WhoobeNode (SSR)', () => {
  it('renders a container with heading + paragraph + image defaults', async () => {
    const tree = {
      id: 'root', type: 'container', tag: 'document', element: 'div', css: { css: 'p-8', container: 'flex flex-col' },
      blocks: [
        { id: 'h', type: 'element', tag: 'element', element: 'h', level: 2, content: 'Title', css: { css: 'text-2xl', container: '' } },
        { id: 'p', type: 'element', tag: 'element', element: 'p', content: 'Hello <b>world</b>', css: { css: '', container: '' } },
        { id: 'img', type: 'element', tag: 'element', element: 'img', image: { url: '/uploads/hero.jpg', alt: 'Hero' }, css: { css: 'w-40', container: '' } },
      ],
    }
    const html = await renderTree(tree)
    expect(html).toContain('class="p-8 flex flex-col"')
    expect(html).toContain('<h2 class="text-2xl">')
    expect(html).toContain('Hello <b>world</b>')
    expect(html).toContain('src="http://dam:3002/dam-asset/uploads/hero.jpg"')
  })

  it('uses a registry override for a node kind', async () => {
    const tree = {
      id: 'root', type: 'container', tag: 'document', element: 'div', css: { css: '', container: '' },
      blocks: [{ id: 'p', type: 'element', tag: 'element', element: 'p', content: 'hi', css: { css: '', container: '' } }],
    }
    // A consumer-style registry component (a real Svelte component).
    const html = await renderTree(tree, { paragraph: MarkParagraph })
    expect(html).toContain('<mark>')
    expect(html).toContain('hi')
    expect(html).not.toContain('<p>')
  })

  it('escapes bound field values', async () => {
    const tree = {
      id: 'root', type: 'container', tag: 'document', element: 'div', css: { css: '', container: '' },
      blocks: [{ id: 'p', type: 'element', tag: 'element', element: 'p', content: '', css: { css: '', container: '' }, dataBinding: { className: 'X', target: 'text', resolveMode: 'explicit', field: 'message' } }],
    }
    const html = await renderTree(tree, {}, { record: { attributes: { message: '<script>bad</script>' } } })
    expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;')
    expect(html).not.toContain('<script>')
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
  const listApi: any = { ...api, queryObjects: async () => list }
  const renderWith = async (tree: unknown, a: any, opts: Record<string, unknown> = {}, registry: Record<string, any> = {}) => {
    const descriptor = await walkTree(tree, {}, { api: a, ...opts })
    // Svelte writes comment markers for hydration between nodes; the assertions look at the markup without them
    return render(TestTree, { props: { registry, api: a, assetBaseUrl: 'http://dam:3002/dam-asset', descriptor } }).body.replace(/<!--[\s\S]*?-->/g, '')
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
    expect(html).toMatch(/<th class="hc"[^>]*>\s*Name\s*<\/th>/)
  })
  it('sort buttons with aria-sort and a search box, only when the table asks for them', async () => {
    const cols = [{ id: 'a', header: 'Name', field: 'name' }, { id: 'b', header: 'Price', field: 'price', sortable: false }]
    const on = await renderWith(tableNode({ columns: cols, sortable: true, searchable: true, searchPlaceholder: 'Find…' }, { dataBinding: binding }), listApi)
    expect(on).toContain('type="search"')
    expect(on).toContain('placeholder="Find…"')
    expect(on).toMatch(/<th[^>]*aria-sort="none"[^>]*>\s*<button[^>]*>\s*Name<span[^>]*>↕<\/span>/)
    expect((on.match(/aria-sort/g) ?? []).length).toBe(1)
    const off = await renderWith(tableNode({ columns: cols }, { dataBinding: binding }), listApi)
    expect(off).not.toContain('type="search"')
    expect(off).not.toContain('aria-sort')
    expect(off).not.toMatch(/<th[^>]*>\s*<button/)
  })
  it('lazyload draws the first rows and a More button; an empty list says so; cell text stays text', async () => {
    const lazy = await renderWith(tableNode({ columns: [{ id: 'a', header: 'Name', field: 'name' }] }, { dataBinding: { ...binding, paginationMode: 'lazyload', loadMoreText: 'Show more' } }), listApi)
    expect(lazy).toContain('Show more')
    expect(lazy).toContain('3 / 7')
    const empty = await renderWith(tableNode({ columns: [{ id: 'a', header: 'Name', field: 'name' }], emptyText: 'Nothing here' }, { dataBinding: binding }), api)
    expect(empty).toContain('Nothing here')
    const hostile = await renderWith(tableNode({ columns: [{ id: 'a', header: 'Name', field: 'name' }] }, { dataBinding: { className: 'P', target: 'custom', resolveMode: 'query' } }),
      { ...api, queryObjects: async () => [rec('<img src=x onerror=alert(1)>', 1)] })
    expect(hostile).not.toContain('<img')
    expect(hostile).toContain('&lt;img')
  })
  it('says when the list was cut at the row cap', async () => {
    const html = await renderWith(tableNode({ columns: [{ id: 'a', header: 'Name', field: 'name' }] }, { dataBinding: { className: 'P', target: 'custom', resolveMode: 'query' } }), listApi, { tableMaxRows: 4 })
    expect(html).toContain('Showing the first 4 of 7 rows')
  })
})
