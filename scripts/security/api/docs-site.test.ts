// Documentation sites: a website of kind "docs" is built from the Markdown assets of a DAM folder
// (docs/plans/docs-sites/docs-site-plan.md). What is checked here: only public documents are served publicly, private ones
// are neither listed nor linked, the index follows the tree of files (and _nav.yml), links and images are rewritten,
// hostile Markdown produces no executable HTML, and no address can reach outside the folder.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { Client, clientFor } from '../lib/client'
import { ASSET_TARGET } from '../lib/config'
import { png } from '../lib/png'

const tag = randomBytes(3).toString('hex')
const folder = `/docs-${tag}`
let admin: Client
let adminAsset: Client
let anon: Client
let siteId = ''
let plainSiteId = ''
const uploaded: string[] = []
const cleanup: (() => Promise<unknown>)[] = []

async function put(rel: string, type: string, data: Uint8Array | string, isPublic = true) {
  const pimcorePath = `${folder}/${rel}`
  const r = await adminAsset.upload('/api/v1/dam/upload', { pimcorePath, isPublic: String(isPublic) }, { file: { name: rel.split('/').pop() as string, type, data } })
  expect(r.status, `${rel}: ${r.text.slice(0, 120)}`).toBe(200)
  uploaded.push(pimcorePath)
}
const md = (rel: string, text: string, isPublic = true) => put(rel, 'text/markdown', text, isPublic)

beforeAll(async () => {
  admin = await clientFor('admin')
  adminAsset = admin.forBase(ASSET_TARGET)
  anon = new Client()
  const w = await admin.post('/whoobe-one/websites', { name: `Docs ${tag}`, rootPath: `/docs-${tag}`, settings: { kind: 'docs', docs: { sourceFolder: folder, title: 'Sec docs' } } })
  expect(w.status, w.text.slice(0, 120)).toBe(201)
  siteId = w.json.website.id
  cleanup.push(() => admin.delete(`/whoobe-one/websites/${siteId}`))
  const p = await admin.post('/whoobe-one/websites', { name: `Plain ${tag}`, rootPath: `/plain-${tag}` })
  plainSiteId = p.json.website.id
  cleanup.push(() => admin.delete(`/whoobe-one/websites/${plainSiteId}`))

  await md('index.md', '---\ntitle: Welcome\n---\n# Welcome\n\nStart with [the guide](guide/install.md).\n')
  await md('guide/index.md', '---\ntitle: Guides\n---\n# Guides\n')
  await md('guide/02-usage.md', '# Using it\n\n## Setup\n\nSee [install](01-install.md#steps), the private [secret](../secret.md), ![pic](../img/pic.png) and ![gone](../img/none.png).\n\n```bash\nnpm i <pkg>\n```\n')
  await md('guide/01-install.md', '---\ntitle: Install\ndescription: How to install\n---\n# Install\n\n## Steps\n\nRun it.\n')
  await md('secret.md', '# Secret\n\nprivate text sectest-private-marker\n', false)
  await md('xss.md', '# <img src=x onerror=alert(1)>\n\n[x](javascript:alert(1))\n\n<script>alert(1)</script>\n\n<div onclick="x()">block</div>\n')
  await put('img/pic.png', 'image/png', png(8, 8))
})
afterAll(async () => {
  for (const p of uploaded) await adminAsset.request('DELETE', '/api/v1/dam/asset', { body: { pimcorePath: p } })
  for (const f of cleanup.reverse()) { try { await f() } catch { /* best effort */ } }
})

describe('the site as the people who edit it see it', () => {
  it('needs a login', async () => {
    expect((await anon.get(`/docs-sites/${siteId}/tree`)).status).toBe(401)
    expect((await anon.get(`/docs-sites/${siteId}/preview/`)).status).toBe(401)
  })
  it('lists the documents, builds the index from the tree and reports the problems', async () => {
    const r = await admin.get(`/docs-sites/${siteId}/tree`)
    expect(r.status, r.text.slice(0, 200)).toBe(200)
    expect(r.json.navSource).toBe('auto')
    expect(r.json.documents.map((d: any) => d.path).sort()).toEqual(['guide/01-install.md', 'guide/02-usage.md', 'guide/index.md', 'index.md', 'secret.md', 'xss.md'])
    expect(r.json.documents.find((d: any) => d.path === 'secret.md').isPublic).toBe(false)
    expect(r.json.files).toEqual(['img/pic.png'])
    const titles = r.json.nav.map((n: any) => n.title)
    expect(titles[0]).toBe('Welcome')
    const guides = r.json.nav.find((n: any) => n.title === 'Guides')
    expect(guides.route).toBe('/guide/')
    expect(guides.items.map((n: any) => n.title)).toEqual(['Install', 'Using it'])
  })
  it('a page: HTML with anchors, rewritten links, previous/next and breadcrumbs; the private document is visible here', async () => {
    const r = await admin.get(`/docs-sites/${siteId}/preview/guide/usage`)
    expect(r.status, r.text.slice(0, 200)).toBe(200)
    const page = r.json.page
    expect(page.title).toBe('Using it')
    expect(page.html).toContain('<h2 id="setup">')
    expect(page.html).toContain('href="/guide/install#steps"')
    expect(page.html).toContain('href="/secret"')   // private, but the people who edit the site can see it
    expect(page.html).toMatch(/src="\/dam-asset\/[^"]*pic\.png"/)
    expect(page.html).toContain('class="language-bash"')
    expect(page.breadcrumbs.map((b: any) => b.title)).toEqual(['Guides', 'Using it'])
    expect(page.prev.route).toBe('/guide/install')
    expect(page.warnings.join('\n')).toContain('none.png')
    const home = await admin.get(`/docs-sites/${siteId}/preview/`)
    expect(home.json.page.title).toBe('Welcome')
  })
  it('an ordinary website is not a documentation site; a bad folder is refused', async () => {
    expect((await admin.get(`/docs-sites/${plainSiteId}/tree`)).status).toBe(404)
    const bad = await admin.post('/whoobe-one/websites', { name: `Bad ${tag}`, rootPath: `/bad-${tag}`, settings: { kind: 'docs', docs: { sourceFolder: '/a/../../etc' } } })
    const id = bad.json?.website?.id
    if (id) {
      cleanup.push(() => admin.delete(`/whoobe-one/websites/${id}`))
      expect((await admin.get(`/docs-sites/${id}/tree`)).status).toBe(400)
      expect((await anon.get(`/public/docs/${id}/nav`)).status).toBe(400)
    }
    expect((await admin.get(`/docs-sites/00000000-0000-4000-8000-000000000000/tree`)).status).toBe(404)
  })
})

describe('the public site', () => {
  it('serves the public documents without a login and never the private one', async () => {
    const nav = await anon.get(`/public/docs/${siteId}/nav`)
    expect(nav.status).toBe(200)
    expect(nav.json.title).toBe('Sec docs')
    expect(nav.text).not.toContain('secret.md')
    expect(nav.text).not.toContain('Secret')
    const page = await anon.get(`/public/docs/${siteId}/page/guide/install`)
    expect(page.status).toBe(200)
    expect(page.json.page).toMatchObject({ title: 'Install', description: 'How to install' })
    expect(page.json.page.warnings, 'warnings are for the editors').toBeUndefined()
    const secret = await anon.get(`/public/docs/${siteId}/page/secret`)
    expect(secret.status).toBe(404)
    expect(secret.text).not.toContain('sectest-private-marker')
  })
  it('a link to a private document is broken in the public page, not a leak', async () => {
    const r = await anon.get(`/public/docs/${siteId}/page/guide/usage`)
    expect(r.status).toBe(200)
    expect(r.json.page.html).not.toContain('/secret')
    expect(r.json.page.html).toContain('href="#"')
  })
  it('hostile Markdown produces no executable HTML', async () => {
    const r = await anon.get(`/public/docs/${siteId}/page/xss`)
    expect(r.status).toBe(200)
    const html: string = r.json.page.html
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/<[a-z][^>]*\son[a-z]+\s*=/i)
    expect(html).not.toMatch(/href="\s*javascript:/i)
    expect(html).not.toContain('<img')
  })
  it('no address reaches outside the folder or another website', async () => {
    for (const bad of ['..%2f..%2fetc%2fpasswd', '%2e%2e/secret', 'guide/../secret', '..', 'guide//..//..//x', '%00']) {
      const r = await anon.get(`/public/docs/${siteId}/page/${bad}`)
      expect([404, 400], bad).toContain(r.status)
      expect(r.text, bad).not.toContain('sectest-private-marker')
    }
    expect((await anon.get(`/public/docs/${plainSiteId}/nav`)).status).toBe(404)
  })
})

describe('a manual index (_nav.yml)', () => {
  it('replaces the automatic one, and a broken file falls back to it with a warning', async () => {
    await put('_nav.yml', 'application/yaml', '- title: Start here\n  items:\n    - doc: guide/01-install.md\n      title: First step\n- link: https://example.org/changelog\n  title: Changelog\n')
    const r = await admin.get(`/docs-sites/${siteId}/tree`)
    expect(r.json.navSource).toBe('manual')
    expect(r.json.nav[0]).toMatchObject({ type: 'section', title: 'Start here' })
    expect(r.json.nav[0].items[0].title).toBe('First step')
    expect(r.json.nav[1]).toMatchObject({ type: 'link', href: 'https://example.org/changelog' })
    expect(r.json.nav.at(-1).title).toBe('Other')
    expect(r.json.warnings.join('\n')).toMatch(/not in the index/)
    await put('_nav.yml', 'application/yaml', '- title: [broken')
    const bad = await admin.get(`/docs-sites/${siteId}/tree`)
    expect(bad.json.navSource).toBe('auto')
    expect(bad.json.warnings.join('\n')).toMatch(/_nav\.yml: not valid YAML/)
  })
})
