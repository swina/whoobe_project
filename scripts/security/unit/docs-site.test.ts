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
