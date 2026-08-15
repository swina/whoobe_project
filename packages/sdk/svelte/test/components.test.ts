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
