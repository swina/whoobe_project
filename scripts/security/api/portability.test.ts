// Website bundle (export v2 / import): everything the website refers to travels with it, references are rewritten,
// and importing never grants more than the caller may do (publishing needs objects:publish, import needs objects:write).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { Client, clientFor } from '../lib/client'

const tag = randomBytes(3).toString('hex')
let admin: Client
let write: Client
let read: Client
const cleanup: (() => Promise<unknown>)[] = []
let siteId = ''
let snippetId = ''
let moduleId = ''

beforeAll(async () => {
  admin = await clientFor('admin')
  write = await clientFor('write')
  read = await clientFor('read')

  const cls = await admin.post('/data-classes', { name: `Bundle${tag}`, label: 'Bundle', fields: [{ name: 'title', title: 'Title', fieldType: 'text' }] })
  const classId = cls.json.class.id
  cleanup.push(() => admin.delete(`/data-classes/${classId}`))
  const obj = await admin.post('/data-objects', { classId, key: `item-${tag}`, attributes: { title: 'hello' } })
  const objectId = obj.json.object.id
  cleanup.push(() => admin.delete(`/data-objects/${objectId}`))
  await admin.patch(`/data-objects/${objectId}`, { published: true })

  const snip = await admin.post('/whoobe-one/snippets', { name: `Snip ${tag}`, category: 'sec', node: { id: 'n', blocks: [{ id: 'b', dataBinding: { className: `Bundle${tag}`, objectId } }] } })
  snippetId = snip.json.snippet.id
  cleanup.push(() => admin.delete(`/whoobe-one/snippets/${snippetId}`))

  const site = await admin.post('/whoobe-one/websites', { name: `Bundle site ${tag}`, rootPath: `/bundle-${tag}` })
  siteId = site.json.website.id
  const header = await admin.post('/whoobe-one/pages', { slug: `header-${tag}`, title: 'Header', kind: 'module', websiteId: siteId, content: { id: 'r', blocks: [] } })
  moduleId = header.json.page.id
  await admin.patch(`/whoobe-one/pages/${moduleId}`, { published: true })
  const home = await admin.post('/whoobe-one/pages', { slug: `home-${tag}`, title: 'Home', websiteId: siteId, content: { id: 'r', blocks: [{ id: 'x', sourceSnippetId: snippetId }] } })
  cleanup.push(() => admin.delete(`/whoobe-one/pages/${home.json.page.id}`))
  cleanup.push(() => admin.delete(`/whoobe-one/pages/${moduleId}`))
  const tpl = await admin.post(`/whoobe-one/websites/${siteId}/templates`, { name: 'Main', isDefault: true, layout: { header: { pageIds: [moduleId], snippetIds: [snippetId] } } })
  expect(tpl.status, tpl.text.slice(0, 200)).toBe(201)
  cleanup.push(() => admin.delete(`/whoobe-one/websites/${siteId}`))
})

afterAll(async () => {
  for (const f of cleanup.reverse()) { try { await f() } catch { /* best effort */ } }
})

const bundleOf = async (id: string) => (await admin.get(`/whoobe-one/websites/${id}/export`)).json

// removes what an import created (the pages first: a website with pages answers 500 on delete, F-044)
async function removeImported(id: string) {
  const b = await bundleOf(id)
  for (const p of b.pages) await admin.delete(`/whoobe-one/pages/${p.id}`)
  for (const s of b.snippets) if (s.id !== snippetId) await admin.delete(`/whoobe-one/snippets/${s.id}`)
  await admin.delete(`/whoobe-one/websites/${id}`)
}

describe('export', () => {
  it('is version 2 and carries what the layout and the snippet point at', async () => {
    const r = await read.get(`/whoobe-one/websites/${siteId}/export`)
    expect(r.status).toBe(200)
    const b = r.json
    expect(b.version).toBe(2)
    expect(b.pages.map((p: any) => p.slug).sort()).toEqual([`header-${tag}`, `home-${tag}`])
    expect(b.snippets.map((s: any) => s.id)).toEqual([snippetId])
    expect(b.dataClasses.map((c: any) => c.name)).toEqual([`Bundle${tag}`])
    expect(b.dataObjects.map((o: any) => o.key)).toEqual([`item-${tag}`])
  })

  it('is refused without a session and for an unknown website', async () => {
    expect((await (await clientFor('anon')).get(`/whoobe-one/websites/${siteId}/export`)).status).toBe(401)
    expect((await admin.get('/whoobe-one/websites/00000000-0000-4000-8000-000000000000/export')).status).toBe(404)
  })
})

describe('import', () => {
  it('needs objects:write', async () => {
    const bundle = await bundleOf(siteId)
    expect((await read.post('/whoobe-one/websites/import', bundle)).status).toBe(403)
    expect((await (await clientFor('anon')).post('/whoobe-one/websites/import', bundle)).status).toBe(401)
  })

  it('a dry run writes nothing', async () => {
    const before = (await admin.get('/whoobe-one/websites')).json.websites.length
    const r = await write.post('/whoobe-one/websites/import?dryRun=1', await bundleOf(siteId))
    expect(r.status).toBe(200)
    expect(r.json.dryRun).toBe(true)
    expect(r.json.counts).toMatchObject({ pages: 2, snippets: 1, classesReused: 1, objectsReused: 1 })
    expect((await admin.get('/whoobe-one/websites')).json.websites.length).toBe(before)
  })

  it('rewrites the references, and an editor without objects:publish gets drafts', async () => {
    const r = await write.post('/whoobe-one/websites/import', await bundleOf(siteId))
    expect(r.status, r.text.slice(0, 200)).toBe(201)
    const id = r.json.website.id
    cleanup.push(() => removeImported(id))
    expect(r.json.warnings.join(' ')).toMatch(/imported as drafts/)
    const b = await bundleOf(id)
    expect(b.pages.some((p: any) => p.published)).toBe(false)
    // the layout and the page now point at the copies, not at the originals
    const snip = b.snippets.find((s: any) => s.name === `Snip ${tag}` && s.id !== snippetId)
    expect(snip, 'a copy of the snippet').toBeTruthy()
    expect(b.websiteTemplates[0].layout.header.snippetIds).toEqual([snip.id])
    const header = b.pages.find((p: any) => p.slug === `header-${tag}`)
    expect(header.id).not.toBe(moduleId)
    expect(b.websiteTemplates[0].layout.header.pageIds).toEqual([header.id])
    const home = b.pages.find((p: any) => p.slug === `home-${tag}`)
    expect(JSON.stringify(home.content)).toContain(snip.id)
    expect(JSON.stringify(home.content)).not.toContain(snippetId)
    // the class and the object were there already: reused, not duplicated
    expect(r.json.counts).toMatchObject({ classesCreated: 0, objectsCreated: 0 })
  })

  it('with objects:publish the published state comes along', async () => {
    const r = await admin.post('/whoobe-one/websites/import', await bundleOf(siteId))
    expect(r.status).toBe(201)
    const id = r.json.website.id
    cleanup.push(() => removeImported(id))
    const b = await bundleOf(id)
    expect(b.pages.find((p: any) => p.slug === `header-${tag}`).published).toBe(true)
  })

  it('refuses what is not a bundle', async () => {
    expect((await write.post('/whoobe-one/websites/import', { version: 9, website: { name: 'x' } })).status).toBe(400)
    expect((await write.post('/whoobe-one/websites/import', { version: 2 })).status).toBe(400)
  })

  it('still accepts a version 1 export', async () => {
    const r = await write.post('/whoobe-one/websites/import', { version: 1, website: { name: `Legacy ${tag}`, rootPath: '/legacy' }, pages: [{ translationGroupId: '00000000-0000-4000-8000-0000000000aa', locale: 'en', slug: `legacy-${tag}`, title: 'L', category: '', kind: 'content', content: { id: 'r', blocks: [] } }] })
    expect(r.status, r.text.slice(0, 200)).toBe(201)
    cleanup.push(() => removeImported(r.json.website.id))
  })
})
