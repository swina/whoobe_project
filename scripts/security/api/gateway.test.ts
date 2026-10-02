// Plan 3.9: public gateway routes (resolve / submit) - site authentication, bindings, limits.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { Client, clientFor } from '../lib/client'
import { GATEWAY_TARGET } from '../lib/config'

const tag = randomBytes(3).toString('hex')
let admin: Client
let gwAdmin: Client
const anon = () => new Client(GATEWAY_TARGET)
const ip = (a: string) => ({ 'x-forwarded-for': a })   // the stack runs with TRUST_PROXY=1

let siteA = ''
let siteB = ''
let keyA = ''
let keyB = ''
let resolveBinding = ''
let submitBinding = ''
let narrowBinding = ''   // form with a single input, `locale`
let endpointId = ''
const websites: string[] = []
const pages: string[] = []

async function website(name: string) {
  const w = await admin.post('/whoobe-one/websites', { name })
  expect(w.status).toBe(201)
  websites.push(w.json.website.id)
  const k = await admin.post(`/whoobe-one/websites/${w.json.website.id}/gateway-api-key/regenerate`, {})
  expect(k.status, k.text.slice(0, 120)).toBe(200)
  return { id: w.json.website.id as string, key: k.json.key as string }
}

beforeAll(async () => {
  admin = await clientFor('admin')
  gwAdmin = admin.forBase(GATEWAY_TARGET)
  ;({ id: siteA, key: keyA } = await website(`gw A ${tag}`))
  ;({ id: siteB, key: keyB } = await website(`gw B ${tag}`))

  const e = await gwAdmin.post('/api/v1/gateway/endpoints', { name: `sec-gw-${tag}`, baseUrl: 'http://core-api:3003', authType: 'none' })
  expect(e.status, e.text.slice(0, 150)).toBe(201)
  endpointId = e.json.id
  expect((await gwAdmin.post(`/api/v1/gateway/endpoints/${endpointId}/routes`, { path: '/health', method: 'GET' })).status).toBe(201)
  expect((await gwAdmin.post(`/api/v1/gateway/endpoints/${endpointId}/routes`, { path: '/public/data-objects/query', method: 'POST' })).status).toBe(201)

  const content = {
    id: 'root', element: 'div', blocks: [
      { id: 'res', element: 'div', gatewayBinding: { endpointName: `sec-gw-${tag}`, routePath: '/health', fieldPath: 'status', params: {} } },
      { id: 'frm', tag: 'form', element: 'form', formConfig: { enabled: true, gatewayEndpointName: `sec-gw-${tag}`, gatewayRoutePath: '/public/data-objects/query' },
        blocks: [{ id: 'i1', tag: 'input', data: { attributes: { name: 'class' } }, blocks: [] }, { id: 'i2', tag: 'input', data: { attributes: { name: 'locale' } }, blocks: [] }] },
    ],
  }
  const narrow = {
    id: 'root2', element: 'div', blocks: [
      { id: 'frm2', tag: 'form', element: 'form', formConfig: { enabled: true, gatewayEndpointName: `sec-gw-${tag}`, gatewayRoutePath: '/public/data-objects/query' },
        blocks: [{ id: 'j1', tag: 'input', data: { attributes: { name: 'locale' } }, blocks: [] }] },
    ],
  }
  const p = await admin.post('/whoobe-one/pages', { slug: `gw-${tag}`, title: 'gw', content, websiteId: siteA })
  expect(p.status, p.text.slice(0, 200)).toBe(201)
  pages.push(p.json.page.id)
  const blocks = p.json.page.content.blocks
  resolveBinding = blocks[0].gatewayBinding?.bindingId
  submitBinding = blocks[1].formConfig?.gatewayBindingId
  const p2 = await admin.post('/whoobe-one/pages', { slug: `gw2-${tag}`, title: 'gw2', content: narrow, websiteId: siteA })
  expect(p2.status, p2.text.slice(0, 200)).toBe(201)
  pages.push(p2.json.page.id)
  narrowBinding = p2.json.page.content.blocks[0].formConfig?.gatewayBindingId
  expect(narrowBinding, 'narrow submit binding').toBeTruthy()
  expect(resolveBinding, 'resolve binding created at page save').toBeTruthy()
  expect(submitBinding, 'submit binding created at page save').toBeTruthy()
})

afterAll(async () => {
  for (const id of pages) await admin.delete(`/whoobe-one/pages/${id}`)
  for (const id of websites) await admin.delete(`/whoobe-one/websites/${id}`)
  if (endpointId) await gwAdmin.delete(`/api/v1/gateway/endpoints/${endpointId}`)
})

const resolve = (headers: Record<string, string>, body: unknown = { bindingId: resolveBinding }) => anon().post('/api/v1/gateway/resolve', body, headers)
const submit = (headers: Record<string, string>, attributes: unknown = { class: 'no-such-class' }, bindingId = submitBinding) => anon().post('/api/v1/gateway/submit', { bindingId, attributes }, headers)

describe('site authentication (X-Whoobe-Site-Id / X-Whoobe-Site-Key)', () => {
  it('rejects a call without credentials once the site has a key', async () => {
    const r = await resolve(ip('198.51.100.1'))
    expect(r.status).toBe(401)
  })

  it('accepts the right id + key and resolves the pinned value', async () => {
    const r = await resolve({ ...ip('198.51.100.2'), 'x-whoobe-site-id': siteA, 'x-whoobe-site-key': keyA })
    expect(r.status, r.text.slice(0, 160)).toBe(200)
    expect(r.json.value).toBe('ok')
  })

  it('rejects a wrong key, another site\'s key, and a key presented for the wrong site id', async () => {
    const wrong = await resolve({ ...ip('198.51.100.3'), 'x-whoobe-site-id': siteA, 'x-whoobe-site-key': 'whb_site_nope' })
    const other = await resolve({ ...ip('198.51.100.3'), 'x-whoobe-site-id': siteA, 'x-whoobe-site-key': keyB })
    const swapped = await resolve({ ...ip('198.51.100.3'), 'x-whoobe-site-id': siteB, 'x-whoobe-site-key': keyB })
    for (const r of [wrong, other, swapped]) expect(r.status).toBe(403)
    expect(wrong.json).toEqual(other.json)   // same answer whatever was wrong
  })

  it('does not reveal whether a binding exists differently from a wrong one', async () => {
    const r = await resolve(ip('198.51.100.4'), { bindingId: '00000000-0000-4000-8000-000000000000' })
    expect(r.status).toBe(404)
    const junk = await resolve(ip('198.51.100.4'), { bindingId: "x' OR '1'='1" })
    expect(junk.status).toBeLessThan(500)
    expect(junk.text).not.toMatch(/Failed query|params:|select /i)
  })

  it('a regenerated key invalidates the old one', async () => {
    const k2 = await admin.post(`/whoobe-one/websites/${siteA}/gateway-api-key/regenerate`, {})
    const fresh = k2.json.key as string
    const old = await resolve({ ...ip('198.51.100.5'), 'x-whoobe-site-id': siteA, 'x-whoobe-site-key': keyA })
    expect(old.status).toBe(403)
    const now = await resolve({ ...ip('198.51.100.5'), 'x-whoobe-site-id': siteA, 'x-whoobe-site-key': fresh })
    expect(now.status).toBe(200)
    keyA = fresh
  })

  it('a key never appears in responses or error bodies', async () => {
    const r = await resolve({ ...ip('198.51.100.6'), 'x-whoobe-site-id': siteA, 'x-whoobe-site-key': keyA })
    expect(r.text).not.toContain(keyA)
    const bad = await resolve({ ...ip('198.51.100.6'), 'x-whoobe-site-id': siteA, 'x-whoobe-site-key': 'whb_site_secretguess' })
    expect(bad.text).not.toContain('whb_site_secretguess')
  })

  it('malformed bodies are 400, never 500', async () => {
    for (const body of [{}, { bindingId: 123 }, { bindingId: ['a'] }, { bindingId: { $ne: null } }]) {
      const r = await resolve(ip('198.51.100.7'), body)
      expect(r.status, JSON.stringify(body)).toBeLessThan(500)
    }
  })
})

describe('submit route', () => {
  const auth = () => ({ 'x-whoobe-site-id': siteA, 'x-whoobe-site-key': keyA })

  it('forwards a well-formed submission to the pinned upstream route', async () => {
    const r = await submit({ ...ip('198.51.100.20'), ...auth() })
    expect(r.status, r.text.slice(0, 160)).toBe(200)
    expect(r.json.success).toBe(true)
  })

  it('refuses prototype keys, odd field names, too many fields and oversized values', async () => {
    const many = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`f${i}`, '1']))
    const cases: unknown[] = [JSON.parse('{"__proto__":{"x":1},"class":"c"}'), { 'bad;name': '1' }, many, { class: 'x'.repeat(25_000) }]
    for (const attrs of cases) {
      const r = await submit({ ...ip('198.51.100.21'), ...auth() }, attrs)
      expect(r.status).toBe(400)
    }
  })

  // F-029: only the fields the form actually has go upstream.
  it('drops fields the form does not have before they reach the upstream API', async () => {
    // upstream /public/data-objects/query needs `class`. This form has no such input, so even if the visitor
    // adds one it must be stripped -> upstream rejects (502). The first form does have it -> accepted.
    const narrow = await submit({ ...ip('198.51.100.24'), ...auth() }, { class: 'no-such-class', locale: 'en' }, narrowBinding)
    expect(narrow.status, narrow.text.slice(0, 160)).toBe(502)
    const full = await submit({ ...ip('198.51.100.25'), ...auth() }, { class: 'no-such-class', locale: 'en' })
    expect(full.status).toBe(200)
  })

  it('a submission carrying only declared fields is still forwarded (the upstream rejects it for lack of `class`)', async () => {
    const r = await submit({ ...ip('198.51.100.26'), ...auth() }, { locale: 'en' }, narrowBinding)
    expect(r.status).toBe(502)   // upstream still lacks `class`: nothing smuggled in, nothing else sent
  })

  it('the honeypot answers 204 without touching anything', async () => {
    const r = await submit({ ...ip('198.51.100.22') }, { _hp: 'bot' })
    expect(r.status).toBe(204)
  })

  it('a resolve binding cannot be used as a submit target and vice versa', async () => {
    expect((await submit({ ...ip('198.51.100.23'), ...auth() }, { class: 'x' }, resolveBinding)).status).toBe(404)
    expect((await resolve({ ...ip('198.51.100.23'), ...auth() }, { bindingId: submitBinding })).status).toBe(404)
  })
})

describe('rate limits on the public routes', () => {
  it('one client address is limited without locking out everybody else (submit)', async () => {
    const hdr = { 'x-whoobe-site-id': siteA, 'x-whoobe-site-key': keyA }
    const statuses: number[] = []
    for (let i = 0; i < 14; i++) statuses.push((await submit({ ...ip('192.0.2.200'), ...hdr })).status)
    expect(statuses).toContain(429)
    // another visitor of the same site still gets through
    expect((await submit({ ...ip('192.0.2.201'), ...hdr })).status).toBe(200)
  })

  it('random binding ids from one address are throttled before they cost database lookups (resolve)', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 130; i++) statuses.push((await resolve(ip('192.0.2.210'), { bindingId: randomBytes(8).toString('hex') })).status)
    expect(statuses).toContain(429)
  })
})

describe('gateway response headers', () => {
  it('carry the baseline security headers and no framework banner', async () => {
    const r = await new Client(GATEWAY_TARGET).get('/health')
    expect(r.headers.get('x-content-type-options')).toBe('nosniff')
    expect(r.headers.get('x-powered-by')).toBeNull()
  })
})
