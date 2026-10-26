// The pure parts of apps/core-api/src/docs-site.ts: which website is a documentation site and which folder it reads,
// the content cache, and how an address finds its document. Loading the folder itself needs the database (API tests).
import { describe, it, expect } from 'vitest'
import { DocsConfigError, createContentReader, docsConfigOf, findDocByRoute, type LoadedDoc, type LoadedDocsSite } from '../../../apps/core-api/src/docs-site'

const site = (settings: Record<string, unknown>) => ({ name: 'My docs', settings })

describe('docsConfigOf', () => {
  it('is null for an ordinary website', () => {
    expect(docsConfigOf(site({}))).toBeNull()
    expect(docsConfigOf(site({ kind: 'site', docs: { sourceFolder: '/docs' } }))).toBeNull()
  })
  it('reads the folder, normalising it, with defaults for the rest', () => {
    expect(docsConfigOf(site({ kind: 'docs', docs: { sourceFolder: 'docs//product/' } }))).toEqual({
      sourceFolder: '/docs/product', homeDoc: null, navFile: '_nav.yml', title: 'My docs',
    })
    const c = docsConfigOf(site({ kind: 'docs', docs: { sourceFolder: '/d', homeDoc: '/start.md', navFile: 'index.yaml', title: 'T' } }))
    expect(c).toMatchObject({ homeDoc: 'start.md', navFile: 'index.yaml', title: 'T' })
  })
  it('refuses a missing, root or tricky folder', () => {
    for (const bad of [undefined, '', '/', '//', '/docs/../secrets', '../x', '/a/./b', '/a\\b', '/a\u0000b']) {
      expect(() => docsConfigOf(site({ kind: 'docs', docs: { sourceFolder: bad } })), String(bad)).toThrow(DocsConfigError)
    }
  })
  it('a nav file name that is a path or not YAML falls back to _nav.yml', () => {
    for (const nav of ['../x.yml', 'a/b.yml', 'nav.json', '']) {
      expect(docsConfigOf(site({ kind: 'docs', docs: { sourceFolder: '/d', navFile: nav } }))?.navFile).toBe('_nav.yml')
    }
  })
})

describe('createContentReader', () => {
  const asset = (v = 1, t = 1000) => ({ id: 'a1', version: v, updatedAt: new Date(t), s3Key: 'public/docs/a b.md' }) as any
  it('asks asset-processor with the service token, once per version of an asset', async () => {
    const calls: { url: string; auth?: string }[] = []
    const fake = (async (url: string, init?: any) => { calls.push({ url, auth: init?.headers?.Authorization }); return new Response('# hi', { status: 200 }) }) as any
    const read = createContentReader('http://ap:3002', 'tok', fake)
    expect(await read(asset())).toBe('# hi')
    expect(await read(asset())).toBe('# hi')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({ url: 'http://ap:3002/dam-asset/public%2Fdocs%2Fa%20b.md', auth: 'Bearer tok' })
    await read(asset(2))
    expect(calls).toHaveLength(2)
  })
  it('a failed read is null and is not cached; the cache is bounded', async () => {
    let ok = false
    const fake = (async () => (ok ? new Response('x') : new Response('no', { status: 500 }))) as any
    const read = createContentReader('http://ap', '', fake, 2)
    expect(await read(asset())).toBeNull()
    ok = true
    expect(await read(asset())).toBe('x')
    for (let i = 0; i < 5; i++) await read({ ...asset(), id: `n${i}` })   // no crash, bounded
  })
})

describe('findDocByRoute', () => {
  const doc = (path: string, route: string, hidden = false) => ({ path, route, entry: { path, frontMatter: { hidden } } }) as unknown as LoadedDoc
  const mk = (docs: LoadedDoc[], homeDoc: string | null = null) => ({ docs, config: { homeDoc } }) as unknown as LoadedDocsSite
  const docs = [doc('guide/install.md', '/guide/install'), doc('guide/index.md', '/guide/'), doc('start.md', '/start'), doc('secret.md', '/secret', true)]
  it('matches with or without slashes and case-sensitively', () => {
    const s = mk(docs)
    expect(findDocByRoute(s, 'guide/install')?.path).toBe('guide/install.md')
    expect(findDocByRoute(s, '/guide/install/')?.path).toBe('guide/install.md')
    expect(findDocByRoute(s, 'guide')?.path).toBe('guide/index.md')
    expect(findDocByRoute(s, 'Guide/Install')).toBeNull()
    expect(findDocByRoute(s, 'nope')).toBeNull()
    expect(findDocByRoute(s, 'guide/../secret')).toBeNull()
  })
  it('the home page is the configured document, else the root index, else the first visible one', () => {
    expect(findDocByRoute(mk(docs, 'start.md'), '')?.path).toBe('start.md')
    expect(findDocByRoute(mk([doc('index.md', '/'), ...docs]), '/')?.path).toBe('index.md')
    expect(findDocByRoute(mk([doc('secret.md', '/secret', true), ...docs]), '')?.path).toBe('guide/install.md')
    expect(findDocByRoute(mk([]), '')).toBeNull()
  })
})

describe('dark / light theme switch of the generated documentation site', () => {
  it('the page has the button, and the saved choice is applied in the head before the stylesheet', async () => {
    const { pageHtml } = await import('../../../packages/publish/src/docs-site')
    const html = pageHtml({ site: 'Docs', page: null, html: '', nav: [], base: '/', hasCode: false, notFound: true })
    expect(html).toContain('id="theme"')
    expect(html.indexOf("localStorage.getItem('docs-theme')")).toBeGreaterThan(0)
    expect(html.indexOf("localStorage.getItem('docs-theme')")).toBeLessThan(html.indexOf('assets/docs.css'))
  })
  it('the stylesheet follows the system unless a theme is chosen, and a custom accent still wins', async () => {
    const { DOCS_CSS, DOCS_JS, pageHtml } = await import('../../../packages/publish/src/docs-site')
    expect(DOCS_CSS).toContain(':root:not([data-theme=light])')
    expect(DOCS_CSS).toContain(':root[data-theme=dark]')
    expect(() => new Function(DOCS_JS)).not.toThrow()
    expect(DOCS_JS).toContain("localStorage.setItem('docs-theme'")
    expect(pageHtml({ site: 'D', page: null, html: '', nav: [], base: '/', accent: '#ff0000', hasCode: false, notFound: true })).toContain(':root:root{--accent:#ff0000}')
  })
  it('shows the version badge and the repository link only when given, escaped', async () => {
    const { pageHtml, generateDocsSite } = await import('../../../packages/publish/src/docs-site')
    const bare = pageHtml({ site: 'D', page: null, html: '', nav: [], base: '/', hasCode: false, notFound: true })
    expect(bare).not.toContain('class="ver"')
    expect(bare).not.toContain('class="repo"')
    const html = pageHtml({ site: 'D', page: null, html: '', nav: [], base: '/', hasCode: false, notFound: true, version: 'v0.3.1', versionUrl: 'https://github.com/o/r/releases/tag/v0.3.1?a=1&b=2', repoUrl: 'https://github.com/o/r' })
    expect(html).toContain('<a class="ver" href="https://github.com/o/r/releases/tag/v0.3.1?a=1&amp;b=2"')
    expect(html).toContain('>v0.3.1</a>')
    expect(html).toContain('<a class="repo" href="https://github.com/o/r"')
    expect(html).toContain('aria-label="Source code on GitHub"')
    expect(pageHtml({ site: 'D', page: null, html: '', nav: [], base: '/', hasCode: false, notFound: true, version: 'v1' })).toContain('<span class="ver">v1</span>')
    const o = { apiUrl: 'http://localhost', websiteId: '7c106fed-d595-489e-9940-e0d26c89e1f0', outDir: '/nonexistent' }
    await expect(generateDocsSite({ ...o, versionLabel: '<b>' })).rejects.toThrow(/versionLabel/)
    await expect(generateDocsSite({ ...o, repoUrl: 'javascript:alert(1)' })).rejects.toThrow(/repoUrl/)
    await expect(generateDocsSite({ ...o, versionUrl: 'https://x/"' })).rejects.toThrow(/versionUrl/)
  })
})
