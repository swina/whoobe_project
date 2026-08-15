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
