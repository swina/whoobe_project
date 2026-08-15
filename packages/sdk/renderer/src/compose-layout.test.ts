import { describe, it, expect } from 'vitest'
import { composeLayout } from './compose-layout.js'
import { walkTree } from './walk.js'
import type { RenderApi } from './api-client.js'

const api: RenderApi = { getObject: async () => null, queryObjects: async () => [] }
const options = { api, assetBaseUrl: 'http://dam:3002/dam-asset' }

describe('composeLayout', () => {
  it('wraps the body with header/footer slot descriptors', async () => {
    const body = await walkTree(
      { id: 'body', type: 'container', tag: 'document', element: 'div', css: { css: '', container: '' }, blocks: [{ id: 'p', type: 'element', tag: 'element', element: 'p', content: 'Body' }] },
      {},
      options,
    )
    const composed = await composeLayout(body, {
      template: { id: 't1', name: 'Main' },
      header: { className: 'sticky top-0', style: '', pages: [{ id: 'h', title: 'Header', content: { id: 'hroot', type: 'container', tag: 'document', element: 'div', blocks: [{ id: 'hp', type: 'element', tag: 'element', element: 'p', content: 'Nav' }] } }] },
      aside: null,
      footer: { className: '', style: '', pages: [{ id: 'f', title: 'Footer', content: { id: 'froot', type: 'container', tag: 'document', element: 'div', blocks: [{ id: 'fp', type: 'element', tag: 'element', element: 'p', content: '©' }] } }] },
    }, options)

    expect(composed.header?.tag).toBe('header')
    expect(composed.header?.className).toBe('sticky top-0')
    expect(composed.header?.children[0].children[0].content).toBe('Nav')
    expect(composed.aside).toBeNull()
    expect(composed.footer?.tag).toBe('footer')
    expect(composed.footer?.children[0].children[0].content).toBe('©')
    expect(composed.body.children[0].content).toBe('Body')
  })

  it('renders no region when a slot is empty', async () => {
    const body = await walkTree({ id: 'b', type: 'container', tag: 'document', element: 'div' }, {}, options)
    const composed = await composeLayout(body, {
      template: { id: 't', name: 'X' },
      header: { className: '', style: '', pages: [] },
      footer: null,
    }, options)
    expect(composed.header).toBeNull()
    expect(composed.footer).toBeNull()
  })
})
