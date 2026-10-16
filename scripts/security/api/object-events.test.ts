// Object events: subscriptions to changes of data objects (docs/plans/datamodel/data-objects-automations.md, object-events-phase0.md).
// Admin only; the delivery goes through the Gateway (credentials and SSRF checks stay there); nothing from the consumer's answer is stored.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { Client, clientFor } from '../lib/client'
import { GATEWAY_TARGET } from '../lib/config'

const tag = randomBytes(3).toString('hex')
const NIL = '11111111-1111-4111-8111-111111111111'   // a well-formed id: a malformed one is answered 404 before the sign-in check, like every id route
let admin: Client
let gwAdmin: Client
let anon: Client
let classId = ''
let endpointId = ''
let routeId = ''
let getRouteId = ''
let paramRouteId = ''
let subId = ''
const cleanup: (() => Promise<unknown>)[] = []

const valid = () => ({ name: `sub-${tag}`, events: ['object.created'], endpointId, routeId })
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function until<T>(fn: () => Promise<T | undefined>, ms = 20_000): Promise<T> {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v !== undefined) return v
    if (Date.now() > end) throw new Error('timed out')
    await wait(500)
  }
}

beforeAll(async () => {
  admin = await clientFor('admin')
  anon = new Client()
  gwAdmin = admin.forBase(GATEWAY_TARGET)
  const c = await admin.post('/data-classes', { name: `Events${tag}`, label: 'Events', fields: [{ name: 'title', title: 'Title', fieldType: 'text' }] })
  expect(c.status, c.text.slice(0, 150)).toBe(201)
  classId = c.json.class.id
  cleanup.push(() => admin.delete(`/data-classes/${classId}`))

  // an endpoint inside the stack that answers a POST (with a 4xx for our body: enough to see the worker call it and log the status)
  const e = await gwAdmin.post('/api/v1/gateway/endpoints', { name: `sec-ev-${tag}`, baseUrl: 'http://core-api:3003', authType: 'none' })
  expect(e.status, e.text.slice(0, 150)).toBe(201)
  endpointId = e.json.id
  cleanup.push(() => gwAdmin.delete(`/api/v1/gateway/endpoints/${endpointId}`))
  const r = await gwAdmin.post(`/api/v1/gateway/endpoints/${endpointId}/routes`, { path: '/public/data-objects/query', method: 'POST' })
  expect(r.status, r.text.slice(0, 150)).toBe(201)
  routeId = r.json.id
  const g = await gwAdmin.post(`/api/v1/gateway/endpoints/${endpointId}/routes`, { path: '/health', method: 'GET' })
  getRouteId = g.json.id
  const p = await gwAdmin.post(`/api/v1/gateway/endpoints/${endpointId}/routes`, { path: '/things/{id}', method: 'POST' })
  paramRouteId = p.json.id
})
afterAll(async () => { for (const f of cleanup.reverse()) { try { await f() } catch { /* best effort */ } } })

describe('access', () => {
  it('needs object_events:manage: anonymous 401, an editor role 403, the administrator passes', async () => {
    const write = await clientFor('write')
    const calls: [string, string][] = [['GET', '/object-event-subscriptions'], ['POST', '/object-event-subscriptions'], ['GET', `/object-event-subscriptions/${NIL}/deliveries`], ['POST', `/object-event-deliveries/${NIL}/retry`]]
    for (const [m, p] of calls) {
      expect((await anon.request(m, p, m === 'GET' ? {} : { body: {} })).status, `${m} ${p} anon`).toBe(401)
      expect((await write.request(m, p, m === 'GET' ? {} : { body: {} })).status, `${m} ${p} write`).toBe(403)
    }
    expect((await admin.get('/object-event-subscriptions')).status).toBe(200)
  })
})

describe('subscriptions', () => {
  it('refuses a body that is not valid', async () => {
    for (const bad of [{}, { ...valid(), name: '' }, { ...valid(), events: ['object.exploded'] }, { ...valid(), events: [] }, { ...valid(), payloadMode: 'fields' },
      { ...valid(), signingSecretRef: 'DATABASE_URL' }, { ...valid(), classId: 'nope' }, { ...valid(), ignoreActors: 'engine' }]) {
      const r = await admin.post('/object-event-subscriptions', bad)
      expect(r.status, JSON.stringify(bad)).toBe(400)
    }
  })

  it('refuses a target that is not a Gateway route that can receive an event', async () => {
    const unknown = await admin.post('/object-event-subscriptions', { ...valid(), endpointId: '11111111-1111-4111-8111-111111111111' })
    expect(unknown.status).toBe(400)
    expect((await admin.post('/object-event-subscriptions', { ...valid(), routeId: getRouteId })).json.error).toMatch(/POST, PUT or PATCH/)
    expect((await admin.post('/object-event-subscriptions', { ...valid(), routeId: paramRouteId })).json.error).toMatch(/fixed path/)
    expect((await admin.post('/object-event-subscriptions', { ...valid(), classId: '11111111-1111-4111-8111-111111111111' })).json.error).toMatch(/class/)
  })

  it('creates, lists, reads, updates and refuses a duplicate name', async () => {
    const created = await admin.post('/object-event-subscriptions', { ...valid(), classId, ignoreActors: ['engine-client'], signingSecretRef: 'OBJECT_EVENTS_SECRET_SECTEST' })
    expect(created.status, created.text.slice(0, 200)).toBe(201)
    subId = created.json.subscription.id
    cleanup.push(() => admin.delete(`/object-event-subscriptions/${subId}`))
    expect(created.json.subscription).toMatchObject({ enabled: true, payloadMode: 'minimal', classId, ignoreActors: ['engine-client'] })
    expect((await admin.get('/object-event-subscriptions')).json.subscriptions.some((s: any) => s.id === subId)).toBe(true)
    expect((await admin.get(`/object-event-subscriptions/${subId}`)).json.subscription.name).toBe(`sub-${tag}`)
    const patched = await admin.patch(`/object-event-subscriptions/${subId}`, { enabled: false })
    expect(patched.json.subscription.enabled).toBe(false)
    expect((await admin.patch(`/object-event-subscriptions/${subId}`, { routeId: getRouteId })).status).toBe(400)
    expect((await admin.post('/object-event-subscriptions', { ...valid() })).status).toBe(409)
    await admin.patch(`/object-event-subscriptions/${subId}`, { enabled: true })
  })

  it('unknown and malformed ids are 404, not 500', async () => {
    for (const id of ['11111111-1111-4111-8111-111111111111', 'not-a-uuid']) {
      expect((await admin.get(`/object-event-subscriptions/${id}`)).status, id).toBe(404)
      expect((await admin.patch(`/object-event-subscriptions/${id}`, { enabled: false })).status, id).toBe(404)
      expect((await admin.delete(`/object-event-subscriptions/${id}`)).status, id).toBe(404)
      expect((await admin.post(`/object-event-subscriptions/${id}/test`, {})).status, id).toBe(404)
      expect((await admin.get(`/object-event-subscriptions/${id}/deliveries`)).status, id).toBe(404)
      expect((await admin.post(`/object-event-deliveries/${id}/retry`, {})).status, id).toBe(404)
    }
  })
})

describe('events and the delivery log', () => {
  it('a data object created through the API is queued, delivered through the Gateway (the worker calls the route) and logged; no content in the log', async () => {
    const o = await admin.post('/data-objects', { classId, key: `ev-${tag}`, attributes: { title: `SECRET-TITLE-${tag}` } })
    expect(o.status, o.text.slice(0, 150)).toBe(201)
    cleanup.push(() => admin.delete(`/data-objects/${o.json.object.id}`))
    const row = await until(async () => {
      const log = await admin.get(`/object-event-subscriptions/${subId}/deliveries`)
      const d = log.json.deliveries.find((x: any) => x.event.type === 'object.created' && x.attempts >= 1)
      return d
    })
    expect(row.event.objectId).toBe(o.json.object.id)
    // this subscription names a signing secret that the stack does not have: the attempt fails closed, nothing is sent
    expect(row.status).toBe('retrying')
    expect(row.lastError).toMatch(/signing secret "OBJECT_EVENTS_SECRET_SECTEST" is not set/)
    const log = await admin.get(`/object-event-subscriptions/${subId}/deliveries`)
    expect(log.text).not.toContain(`SECRET-TITLE-${tag}`)
    expect(log.text).not.toContain('"payload"')
  })

  it('without the signing secret the worker calls the Gateway route: the status of the answer is logged, not the answer', async () => {
    expect((await admin.patch(`/object-event-subscriptions/${subId}`, { signingSecretRef: null })).status).toBe(200)
    const t = await admin.post(`/object-event-subscriptions/${subId}/test`, {})
    expect(t.status).toBe(202)
    const row = await until(async () => {
      const log = await admin.get(`/object-event-subscriptions/${subId}/deliveries`)
      return log.json.deliveries.find((x: any) => x.event.id === t.json.eventId && x.attempts >= 1)
    })
    expect(row.event.test).toBe(true)
    // the route answers a 4xx for this body (retrying, the status is kept) or accepts it (delivered)
    if (row.status === 'retrying') expect(row.lastError).toMatch(/^the consumer answered HTTP \d{3}$/)
    else expect(row.status).toBe('delivered')
  })

  it('a write by an ignored actor starts nothing is covered in the unit suite; a disabled subscription gets nothing', async () => {
    await admin.patch(`/object-event-subscriptions/${subId}`, { enabled: false })
    const before = (await admin.get(`/object-event-subscriptions/${subId}/deliveries`)).json.deliveries.length
    const o = await admin.post('/data-objects', { classId, key: `ev2-${tag}`, attributes: { title: 'x' } })
    cleanup.push(() => admin.delete(`/data-objects/${o.json.object.id}`))
    await wait(1000)
    expect((await admin.get(`/object-event-subscriptions/${subId}/deliveries`)).json.deliveries.length).toBe(before)
    await admin.patch(`/object-event-subscriptions/${subId}`, { enabled: true })
  })

  it('the log can be filtered and rejects an unknown status; retry only works on a dead delivery', async () => {
    expect((await admin.get(`/object-event-subscriptions/${subId}/deliveries?status=bogus`)).status).toBe(400)
    expect((await admin.get(`/object-event-subscriptions/${subId}/deliveries?status=dead&limit=5`)).status).toBe(200)
    const any = (await admin.get(`/object-event-subscriptions/${subId}/deliveries`)).json.deliveries[0]
    expect((await admin.post(`/object-event-deliveries/${any.id}/retry`, {})).status).toBe(409)
  })

  it('deleting a subscription removes its log', async () => {
    const s = await admin.post('/object-event-subscriptions', { ...valid(), name: `tmp-${tag}` })
    const id = s.json.subscription.id
    await admin.post(`/object-event-subscriptions/${id}/test`, {})
    expect((await admin.get(`/object-event-subscriptions/${id}/deliveries`)).json.deliveries.length).toBe(1)
    expect((await admin.delete(`/object-event-subscriptions/${id}`)).status).toBe(200)
    expect((await admin.get(`/object-event-subscriptions/${id}/deliveries`)).status).toBe(404)
  })
})
