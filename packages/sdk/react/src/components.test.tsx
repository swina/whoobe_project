import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { walkTree } from '@whoobe-cms/renderer'
import { WhoobeProvider } from './context.js'
import { WhoobeNode } from './components.js'
import type { WhoobeApi } from './types.js'

const api: WhoobeApi = {
  getPage: async () => ({ page: { content: null }, params: {} }),
  getObject: async () => null,
  queryObjects: async () => [],
  search: async () => ({ results: [] }),
  submitForm: async () => ({ success: true }),
}

async function renderTree(tree: unknown, registry = {}, ctx: Record<string, unknown> = {}) {
  const descriptor = await walkTree(tree, ctx, { api, assetBaseUrl: 'http://dam:3002/dam-asset' })
  return renderToStaticMarkup(
    <WhoobeProvider registry={registry} api={api} assetBaseUrl="http://dam:3002/dam-asset">
      <WhoobeNode descriptor={descriptor} />
    </WhoobeProvider>,
  )
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
    expect(html).toContain('<h2 class="text-2xl">Title</h2>')
    expect(html).toContain('<p>Hello <b>world</b></p>')
    expect(html).toContain('src="http://dam:3002/dam-asset/uploads/hero.jpg"')
  })

  it('renders an Audio element as a plain player with the source resolved like an image', async () => {
    const tree = {
      id: 'root', type: 'container', tag: 'document', element: 'div', css: { css: '', container: '' },
      blocks: [
        { id: 'a1', type: 'element', tag: 'element', element: 'audio', image: { url: '/audio/song.mp3' }, css: { css: 'w-full', container: '' }, options: { mode: 'waveform', loop: true, preload: 'auto' } },
        { id: 'a2', type: 'element', tag: 'element', element: 'audio', image: { url: 'https://cdn.example.com/x.mp3' }, css: { css: '', container: '' }, options: { controls: false } },
      ],
    }
    const html = await renderTree(tree)
    expect(html).toContain('src="http://dam:3002/dam-asset/audio/song.mp3"')
    expect(html).toContain('src="https://cdn.example.com/x.mp3"')
    expect(html).toMatch(/<audio[^>]*class="w-full"[^>]*controls=""/)
    expect(html).toContain('loop=""')
    expect(html).toContain('preload="auto"')
    expect(html).toContain('data-whoobe-audio="waveform"')
    // controls: false really removes the controls of the second one
    expect(html.match(/<audio[^>]*>/g)?.[1]).not.toContain('controls')
  })

  it('uses a registry override for a node kind', async () => {
    const tree = {
      id: 'root', type: 'container', tag: 'document', element: 'div', css: { css: '', container: '' },
      blocks: [{ id: 'p', type: 'element', tag: 'element', element: 'p', content: 'hi', css: { css: '', container: '' } }],
    }
    const customParagraph = ({ descriptor }: { descriptor: any }) => <mark>{descriptor.content}</mark>
    const html = await renderTree(tree, { paragraph: customParagraph })
    expect(html).toContain('<mark>hi</mark>')
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
