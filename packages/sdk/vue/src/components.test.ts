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
