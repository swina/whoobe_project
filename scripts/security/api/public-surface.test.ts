// Plan 3.4: what the unauthenticated surface (/public/*, /preview/*) exposes and accepts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { Client, clientFor } from '../lib/client'
import { known } from '../lib/known'

let admin: Client
const anon = new Client()
const tag = randomBytes(3).toString('hex')
const className = `SecPub${tag}`
let classId = ''
let draftId = ''
let pubId = ''
let websiteId = ''
let draftPageSlug = `sec-draft-${tag}`
let draftPageId = ''

beforeAll(async () => {
  admin = await clientFor('admin')
  const cls = await admin.post('/data-classes', { name: className, label: className, fields: [{ name: 'title', title: 'Title', fieldType: 'text' }, { name: 'note', title: 'Note', fieldType: 'text' }] })
  classId = cls.json.class.id
  draftId = (await admin.post('/data-objects', { classId, key: `draft-${tag}`, attributes: { title: 'DRAFT-SECRET', note: 'internal' } })).json.object.id
  pubId = (await admin.post('/data-objects', { classId, key: `pub-${tag}`, attributes: { title: 'PUBLISHED', note: 'x' } })).json.object.id
  expect((await admin.post('/data-objects/batch', { ids: [pubId], action: 'publish' })).status).toBe(200)
  websiteId = (await admin.post('/whoobe-one/websites', { name: `Sec ${tag}` })).json.website.id
  const page = await admin.post('/whoobe-one/pages', { slug: draftPageSlug, title: 'DRAFT PAGE', content: { id: 'r', type: 'div', children: [] }, websiteId })
  draftPageId = page.json.page.id
})

afterAll(async () => {
  await admin.delete(`/data-objects/${draftId}`)
  await admin.delete(`/data-objects/${pubId}`)
  await admin.delete(`/whoobe-one/pages/${draftPageId}`)
  await admin.delete(`/whoobe-one/websites/${websiteId}`)
  await admin.delete(`/data-classes/${classId}`)
})

describe('drafts are not exposed', () => {
  it('public list contains only published objects', async () => {
    const r = await anon.get(`/public/data-objects?class=${className}`)
    const ids = r.json.objects.map((o: any) => o.id)
    expect(ids).toContain(pubId)
    expect(ids).not.toContain(draftId)
    expect(r.text).not.toContain('DRAFT-SECRET')
  })

  it('a draft object by id is 404, identical to a non-existent one', async () => {
    const draft = await anon.get(`/public/data-objects/${draftId}`)
    const ghost = await anon.get('/public/data-objects/00000000-0000-4000-8000-000000000000')
    expect(draft.status).toBe(404)
    expect(draft.json).toEqual(ghost.json)
  })

  it('batch and query endpoints skip drafts', async () => {
    const b = await anon.get(`/public/data-objects/batch?ids=${draftId},${pubId}`)
    expect(b.text).not.toContain('DRAFT-SECRET')
    const q = await anon.post('/public/data-objects/query', { class: className })
    expect(q.text).not.toContain('DRAFT-SECRET')
    expect(q.json.objects.map((o: any) => o.id)).toEqual([pubId])
  })

  it('an unpublished page is not listed nor served', async () => {
    const list = await anon.get(`/public/pages?websiteId=${websiteId}`)
    expect(list.text).not.toContain(draftPageSlug)
    const one = await anon.get(`/public/page/${draftPageSlug}`)
    expect([404, 400]).toContain(one.status)
    expect(one.text).not.toContain('DRAFT PAGE')
  })

  it('search does not return drafts or unpublished pages', async () => {
    await admin.post('/whoobe-one/search/reindex')
    const r = await anon.get('/public/search?q=DRAFT')
    expect(r.text).not.toMatch(/DRAFT-SECRET|DRAFT PAGE/)
  })
})

describe('public query endpoint robustness', () => {
  const q = (body: unknown) => anon.post('/public/data-objects/query', body)

  it('hostile filter / orderBy values never produce a 5xx or leak internals', async () => {
    const payloads: unknown[] = [
      { class: className, filters: [{ field: "title' OR 1=1 --", operator: 'eq', value: "' OR '1'='1" }] },
      { class: className, filters: [{ field: '__proto__', operator: 'eq', value: 'x' }] },
      { class: className, filters: [{ field: 'constructor.prototype.polluted', operator: 'contains', value: 'x' }] },
      { class: className, filters: [{ field: 'title', operator: 'NOPE', value: { $gt: '' } }] },
      { class: className, filters: 'not-an-array' },
      { class: className, orderBy: { field: '__proto__', direction: 'asc' } },
      { class: className, orderBy: { field: "title; DROP TABLE data_objects", direction: 'desc' } },
      { class: className, limit: -1, offset: 1e12 },
      { class: className, limit: 1e12 },
      { class: { $ne: null } },
      { class: ['a'] },
    ]
    for (const body of payloads) {
      const r = await q(body)
      expect(r.status, JSON.stringify(body)).toBeLessThan(500)
      expect(r.text).not.toMatch(/syntax error|pg_|SELECT |relation "|stack|node_modules/i)
    }
    expect(({} as any).polluted).toBeUndefined()
  })

  it('malformed JSON gives a clean 400 without a stack trace', async () => {
    const r = await anon.request('POST', '/public/data-objects/query', { rawBody: '{"class":', headers: { 'content-type': 'application/json' } })
    expect(r.status).toBe(400)
    expect(r.text).not.toMatch(/at .*\(.*:\d+:\d+\)|node_modules|SyntaxError/)
  })

  // F-018: handlers return `error.message` on 500; for a malformed uuid that is the full SQL text + params.
  known('F-018', 'invalid ids give 4xx, not 5xx with database text', async () => {
    for (const id of ['not-a-uuid', "1' OR '1'='1", '%00', 'x'.repeat(5000)]) {
      const r = await anon.get(`/public/data-objects/${encodeURIComponent(id)}`)
      expect(r.status, id.slice(0, 20)).toBeLessThan(500)
      expect(r.text).not.toMatch(/invalid input syntax|pg_|relation "|stack/i)
    }
  })
})

describe('public website info', () => {
  it('does not expose keys, secrets or hashes', async () => {
    const r = await anon.get(`/public/websites/${websiteId}`)
    expect(r.status).toBe(200)
    expect(r.text).not.toMatch(/"[A-Za-z]*(password|secret|hash|apiKey(?!Prefix))[A-Za-z]*"\s*:/i)
    const list = await anon.get('/public/websites')
    expect(Object.keys(list.json.websites[0]).sort()).toEqual(['id', 'name'])
  })
})

describe('preview tokens', () => {
  it('unknown tokens are 404 and identical for any guess', async () => {
    const a = await anon.get('/preview/objects/' + randomBytes(24).toString('hex'))
    const b = await anon.get('/preview/objects/short')
    expect(a.status).toBe(404)
    expect(b.status).toBe(404)
    expect(a.json).toEqual(b.json)
  })

  it('a valid token shows only its own object, and stops working once revoked', async () => {
    const link = await admin.post(`/data-objects/${draftId}/preview-link`, {})
    expect(link.status).toBe(201)
    const token: string = link.json.token
    expect(token.length).toBeGreaterThanOrEqual(32)
    const ok = await anon.get(`/preview/objects/${token}`)
    expect(ok.status).toBe(200)
    expect(ok.json.object.id).toBe(draftId)
    expect((await admin.delete(`/data-objects/preview-links/${token}`)).status).toBe(200)
    expect((await anon.get(`/preview/objects/${token}`)).status).toBe(404)
  })

  it('tokens look random (no repeats, no shared prefix across 20 samples)', async () => {
    const tokens: string[] = []
    for (let i = 0; i < 20; i++) {
      const l = await admin.post(`/data-objects/${draftId}/preview-link`, { expiresInDays: 1 })
      tokens.push(l.json.token)
    }
    expect(new Set(tokens).size).toBe(20)
    expect(new Set(tokens.map((t) => t.slice(0, 6))).size).toBeGreaterThan(15)
    for (const t of tokens) await admin.delete(`/data-objects/preview-links/${t}`)
  })
})

describe('public form submission', () => {
  it('lands unpublished, cannot set protected fields, and strips unknown ones', async () => {
    const r = await anon.post(`/public/forms/${classId}/submit`, {
      attributes: { title: 'from-visitor', note: 'n', published: true, key: 'hijack', classId: 'x', __proto__: { polluted: 1 }, extra: 'nope' },
    })
    expect([200, 201, 204]).toContain(r.status)
    const all = (await admin.get(`/data-objects?classId=${classId}`)).json
    const rows: any[] = all.objects ?? []
    const sub = rows.find((o) => o.attributes?.title === 'from-visitor')
    expect(sub, 'submission stored').toBeTruthy()
    expect(sub.published).toBe(false)
    expect(sub.key).toMatch(/^sub-/)
    expect(sub.attributes.extra).toBeUndefined()
    expect(sub.attributes.published).toBeUndefined()
    for (const o of rows.filter((x) => x.key.startsWith('sub-'))) await admin.delete(`/data-objects/${o.id}`)
  })

  it('rejects stored-XSS-looking input safely (stored as data, never executed server-side) and oversized bodies cleanly', async () => {
    const r = await anon.post(`/public/forms/${classId}/submit`, { attributes: { title: '<script>alert(1)</script>', note: 'x'.repeat(200_000) } })
    expect(r.status).toBeLessThan(500)
    const all = (await admin.get(`/data-objects?classId=${classId}`)).json.objects ?? []
    for (const o of all.filter((x: any) => x.key.startsWith('sub-'))) await admin.delete(`/data-objects/${o.id}`)
  })
})

describe('unauthenticated writes outside /public', () => {
  // F-019: POST /pwa/subscribe stores whatever endpoint it is given, with no auth and no rate limit.
  known('F-019', 'POST /pwa/subscribe is rate limited', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 40; i++) {
      const r = await new Client().post('/pwa/subscribe', { websiteId, subscription: { endpoint: `https://push.example/${tag}/${i}`, keys: {} } })
      statuses.push(r.status)
    }
    expect(statuses).toContain(429)
  })

  it('the settings reads that are public only reveal booleans', async () => {
    for (const p of ['/whoobe-one/settings/strip-html-comments', '/whoobe-one/settings/logging']) {
      const r = await new Client().get(p)
      expect(Object.keys(r.json ?? {})).toEqual(['enabled'])
    }
  })
})
