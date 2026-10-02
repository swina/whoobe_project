// Plan 3.15 (limits) and 3.2 (separation of duties): publishing needs objects:publish, drafts never leak
// through the public search, the raw "editor" view needs a session, anonymous and AI endpoints are throttled.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { Client, clientFor } from '../lib/client'
import { GATEWAY_TARGET } from '../lib/config'

const tag = randomBytes(3).toString('hex')
const from = (ip: string) => ({ 'x-forwarded-for': ip })   // stack runs TRUST_PROXY=1
let admin: Client
let write: Client
let classId = ''
const cleanup: (() => Promise<unknown>)[] = []

beforeAll(async () => {
  admin = await clientFor('admin')
  write = await clientFor('write')
  const c = await admin.post('/data-classes', { name: `SecLim${tag}`, label: `SecLim${tag}`, fields: [{ name: 'title', title: 'Title', fieldType: 'text' }] })
  classId = c.json.class.id
  cleanup.push(() => admin.delete(`/data-classes/${classId}`))
})
afterAll(async () => { for (const f of cleanup.reverse()) await f() })

describe('publishing needs objects:publish (separation of duties)', () => {
  it('an editor with objects:write cannot publish a data object, by PATCH or by batch', async () => {
    const o = await write.post('/data-objects', { classId, key: `o-${tag}-1`, attributes: { title: 'x' } })
    expect(o.status).toBe(201)
    const id = o.json.object.id
    cleanup.push(() => admin.delete(`/data-objects/${id}`))
    const patch = await write.patch(`/data-objects/${id}`, { published: true })
    expect(patch.status, patch.text.slice(0, 120)).toBe(403)
    const batch = await write.post('/data-objects/batch', { ids: [id], action: 'publish' })
    expect(batch.json?.succeeded, batch.text.slice(0, 160)).toBe(0)
    expect((await admin.get(`/data-objects/${id}`)).json.object.published).toBe(false)
  })

  it('...nor a page', async () => {
    const p = await write.post('/whoobe-one/pages', { slug: `pub-${tag}`, title: 'pub', content: { id: 'r', blocks: [] } })
    expect(p.status).toBe(201)
    const id = p.json.page.id
    cleanup.push(() => admin.delete(`/whoobe-one/pages/${id}`))
    expect((await write.patch(`/whoobe-one/pages/${id}`, { published: true })).status).toBe(403)
    expect((await admin.get(`/whoobe-one/pages/${id}`)).json.page.published).toBe(false)
  })

  it('saving without changing the flag keeps working for the editor, and the admin can publish', async () => {
    const o = await write.post('/data-objects', { classId, key: `o-${tag}-2`, attributes: { title: 'x' } })
    const id = o.json.object.id
    cleanup.push(() => admin.delete(`/data-objects/${id}`))
    expect((await write.patch(`/data-objects/${id}`, { published: false, attributes: { title: 'edited' } })).status).toBe(200)
    expect((await admin.patch(`/data-objects/${id}`, { published: true })).status).toBe(200)
    // an editor editing an already published object (flag sent unchanged) is fine
    expect((await write.patch(`/data-objects/${id}`, { published: true, attributes: { title: 'edited again' } })).status).toBe(200)
    // ...but cannot take it offline either
    expect((await write.patch(`/data-objects/${id}`, { published: false })).status).toBe(403)
  })
})

describe('drafts do not leak through search or the raw editor view', () => {
  it('the public search ignores includeUnpublished', async () => {
    const word = `draftword${tag}`
    const p = await admin.post('/whoobe-one/pages', { slug: `draft-${tag}`, title: `${word} secret`, content: { id: 'r', blocks: [] } })
    expect(p.status).toBe(201)
    cleanup.push(() => admin.delete(`/whoobe-one/pages/${p.json.page.id}`))
    await admin.post('/whoobe-one/search/reindex')
    const anon = new Client()
    for (const qs of ['', '&includeUnpublished=true', '&includeUnpublished=1']) {
      const r = await anon.get(`/public/search?q=${word}${qs}`, from('198.51.100.40'))
      expect(r.json?.total ?? 0, qs).toBe(0)
      expect(r.text, qs).not.toContain('secret')
    }
    // positive control: the admin search can list drafts on request
    const mine = await admin.get(`/whoobe-one/search?q=${word}&includeUnpublished=true`)
    expect(mine.json?.total, mine.text.slice(0, 200)).toBeGreaterThan(0)
  })

  it('?editor=true on the public page routes needs a session to get the raw page', async () => {
    const gw = admin.forBase(GATEWAY_TARGET)
    const w = await admin.post('/whoobe-one/websites', { name: `Lim ${tag}`, rootPath: `/lim${tag}` })
    const websiteId = w.json.website.id
    cleanup.push(() => admin.delete(`/whoobe-one/websites/${websiteId}`))
    const e = await gw.post('/api/v1/gateway/endpoints', { name: `sec-lim-${tag}`, baseUrl: 'http://core-api:3003', authType: 'none' })
    cleanup.push(() => gw.delete(`/api/v1/gateway/endpoints/${e.json.id}`))
    await gw.post(`/api/v1/gateway/endpoints/${e.json.id}/routes`, { path: '/health', method: 'GET' })
    const content = { id: 'root', element: 'div', blocks: [{ id: 'res', element: 'div', gatewayBinding: { endpointName: `sec-lim-${tag}`, routePath: '/health', fieldPath: 'status', params: {} } }] }
    const p = await admin.post('/whoobe-one/pages', { slug: `ed-${tag}`, title: 'ed', content, websiteId })
    expect(p.status).toBe(201)
    cleanup.push(() => admin.delete(`/whoobe-one/pages/${p.json.page.id}`))
    expect((await admin.patch(`/whoobe-one/pages/${p.json.page.id}`, { published: true })).status).toBe(200)

    const anon = new Client()
    const url = `/public/page/ed-${tag}?websiteId=${websiteId}`
    const plain = await anon.get(url, from('198.51.100.41'))
    expect(plain.status, plain.text.slice(0, 120)).toBe(200)
    expect(plain.text).not.toContain('endpointName')
    const spoof = await anon.get(`${url}&editor=true`, from('198.51.100.41'))
    expect(spoof.text, 'anonymous editor=true must still be sanitised').not.toContain('endpointName')
    const real = await admin.get(`${url}&editor=true`)
    expect(real.text, 'a session keeps the raw view').toContain('endpointName')
  })
})

describe('throttling', () => {
  it('/public/search is limited per client address', async () => {
    const anon = new Client()
    const statuses: number[] = []
    for (let i = 0; i < 40; i++) statuses.push((await anon.get('/public/search?q=ab', from('203.0.113.60'))).status)
    expect(statuses).toContain(429)
    // another address is unaffected
    expect((await anon.get('/public/search?q=ab', from('203.0.113.61'))).status).toBe(200)
  })

  it('/public/data-objects/query is limited per client address', async () => {
    const anon = new Client()
    const statuses: number[] = []
    for (let i = 0; i < 50; i++) statuses.push((await anon.post('/public/data-objects/query', { class: 'nope' }, from('203.0.113.62'))).status)
    expect(statuses).toContain(429)
  })

  it('AI generation is limited per user', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 8; i++) statuses.push((await admin.post('/ai/generate', { prompt: 'x' })).status)
    expect(statuses).toContain(429)
  })

  it('AI settings never return a stored provider key', async () => {
    const key = `sk-sectest-${tag}-secretvalue`
    const put = await admin.request('PUT', '/ai/settings', { body: { provider: 'openai', model: 'gpt-test', apiKey: key } })
    expect(put.status, put.text.slice(0, 120)).toBeLessThan(300)
    const got = await admin.get('/ai/settings')
    expect(got.text).not.toContain(key)
    expect(got.json?.hasApiKey).toBe(true)
  })
})
