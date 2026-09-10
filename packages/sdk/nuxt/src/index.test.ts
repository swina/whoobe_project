import { describe, it, expect, vi } from 'vitest'
import { getPageData, getObjectData, generateMetadataFromPage, staticParamsForRecords, staticParamsForSlugs } from './index.js'

const pageJson = {
  page: {
    id: 'p1',
    locale: 'it',
    slug: '/news',
    title: 'News',
    seo: { metaTitle: 'Le Notizie', metaDescription: 'desc', ogImage: '/og.png', robots: { index: true, follow: false } },
    content: {
      id: 'root', type: 'container', tag: 'document', element: 'div',
      blocks: [{ id: 'h', type: 'element', tag: 'element', element: 'h', level: 1, content: 'Ciao' }],
    },
  },
  params: {},
}

const mockFetch = vi.fn(async (_url: string, _init?: RequestInit) => ({
  ok: true,
  json: async () => pageJson,
}))

describe('getPageData', () => {
  it('fetches and walks the page', async () => {
    vi.stubGlobal('fetch', mockFetch)
    const out = await getPageData('it', '/news', { baseUrl: 'https://cms.example.com', assetBaseUrl: 'https://cms.example.com/dam-asset' })
    expect(out.page.title).toBe('News')
    expect(out.descriptor.kind).toBe('container')
    expect(out.descriptor.children[0].content).toBe('Ciao')
    expect(String(mockFetch.mock.calls[0][0])).toContain('/public/pages/it/news')
    vi.unstubAllGlobals()
  })
})

describe('generateMetadataFromPage', () => {
  it('maps page seo to metadata', () => {
    const meta = generateMetadataFromPage(pageJson.page as any, 'https://cms.example.com')
    expect(meta.title).toBe('Le Notizie')
    expect(meta.robots).toEqual({ index: true, follow: false })
    expect((meta.openGraph as any).images[0].url).toBe('https://cms.example.com/og.png')
  })
})

describe('static params', () => {
  it('builds rows from slugs and from records', () => {
    expect(staticParamsForSlugs(['/a', '/b'], 'it')).toEqual([
      { locale: 'it', slug: '/a' },
      { locale: 'it', slug: '/b' },
    ])
    const rows = staticParamsForRecords(
      [{ attributes: { slug: 'one' } }, { attributes: { slug: null } }, { attributes: {} }],
      'slug',
      'it',
    )
    expect(rows).toEqual([{ locale: 'it', slug: 'one' }])
  })
})