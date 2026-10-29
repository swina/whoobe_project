// The gateway's administration in the audit log (docs/plans/system/release-0.4-plan.md, "Gateway administration audited"): endpoints,
// routes and API clients each leave one row, with the allow-listed fields of apps/gateway/src/audit-specs.ts. An endpoint's credential
// and a client's key are never in a row: a credential sent is "changed", a key is named by its prefix.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { Client, clientFor } from '../lib/client'
import { GATEWAY_TARGET } from '../lib/config'

const tag = randomBytes(4).toString('hex')
const since = new Date(Date.now() - 5_000).toISOString()
const secret = `sec-gw-secret-${tag}-${randomBytes(8).toString('hex')}`
const secret2 = `sec-gw-secret2-${tag}-${randomBytes(8).toString('hex')}`
let admin: Client
let gw: Client
let endpointId = ''
let clientId = ''

beforeAll(async () => {
  admin = await clientFor('admin')
  gw = admin.forBase(GATEWAY_TARGET)
})
afterAll(async () => {
  if (clientId) await gw.delete(`/api/v1/gateway/clients/${clientId}`).catch(() => undefined)
  if (endpointId) await gw.delete(`/api/v1/gateway/endpoints/${endpointId}`).catch(() => undefined)
})

// the row is written when the response has finished: give it a moment
const row = async (action: string, targetId: string, pick: (e: any) => boolean = () => true) => {
  for (let i = 0; i < 20; i++) {
    const r = await admin.get(`/audit-log?${new URLSearchParams({ action, from: since, limit: '500' })}`)
    expect(r.status, r.text.slice(0, 200)).toBe(200)
    const found = (r.json.entries as any[]).filter((e) => e.targetId === targetId).find(pick)
    if (found) return found
    await new Promise((res) => setTimeout(res, 100))
  }
  return undefined
}

describe('endpoints and routes', () => {
  it('an endpoint created with a credential: the fields and the NAMES of the credentials, never a value', async () => {
    const r = await gw.post('/api/v1/gateway/endpoints', { name: `sec-audit-${tag}`, baseUrl: 'http://core-api:3003', authType: 'api-key', authConfig: { keyValue: secret, keyHeader: 'X-Api-Key' } })
    expect(r.status, r.text.slice(0, 200)).toBe(201)
    endpointId = r.json.id
    const e = await row('gateway_endpoint.create', endpointId)
    expect(e).toMatchObject({ actorType: 'user', targetType: 'gateway_endpoint', targetLabel: `sec-audit-${tag}`, before: null })
    expect(e.after).toMatchObject({ name: `sec-audit-${tag}`, baseUrl: 'http://core-api:3003', authType: 'api-key', authFields: ['keyHeader', 'keyValue'] })
    expect(JSON.stringify(e)).not.toContain(secret)
  })

  it('a new credential is "changed"; a blank one keeps the stored value and is no change', async () => {
    expect((await gw.patch(`/api/v1/gateway/endpoints/${endpointId}`, { description: 'audited', authConfig: { keyValue: secret2, keyHeader: '' } })).status).toBe(200)
    const e = await row('gateway_endpoint.update', endpointId)
    expect(e.before).toEqual({ description: '' })
    expect(e.after).toEqual({ description: 'audited', 'authConfig.keyValue': 'changed' })
    expect(JSON.stringify(e)).not.toContain(secret2)
    expect(JSON.stringify(e)).not.toContain(secret)
  })

  let routeId = ''
  it('a route: created (the target is the route, not the endpoint of the path), changed, called, deleted', async () => {
    const c = await gw.post(`/api/v1/gateway/endpoints/${endpointId}/routes`, { path: '/health', method: 'GET' })
    expect(c.status, c.text.slice(0, 200)).toBe(201)
    routeId = c.json.id
    expect((await row('gateway_route.create', routeId))?.after).toMatchObject({ endpointId, path: '/health', method: 'GET' })

    expect((await gw.patch(`/api/v1/gateway/routes/${routeId}`, { description: 'probe' })).status).toBe(200)
    expect(await row('gateway_route.update', routeId)).toMatchObject({ targetLabel: 'GET /health', before: { description: '' }, after: { description: 'probe' } })

    const x = await gw.post(`/api/v1/gateway/routes/${routeId}/execute`, { requestBody: { token: secret } })
    expect(x.json.upstreamStatus).toBe(200)
    const call = await row('gateway_route.execute', routeId)
    expect(call.after).toEqual({ endpointId, upstreamStatus: 200, failed: false })
    expect(JSON.stringify(call)).not.toContain(secret)

    expect((await gw.delete(`/api/v1/gateway/routes/${routeId}`)).status).toBe(204)
    expect((await row('gateway_route.delete', routeId))?.before).toMatchObject({ path: '/health', method: 'GET' })
  })

  it('a call that never reached the upstream (route gone) writes nothing', async () => {
    const x = await gw.post(`/api/v1/gateway/routes/${routeId}/execute`, {})
    expect(x.json).toMatchObject({ error: true, upstreamStatus: 0 })
    const r = await admin.get(`/audit-log?${new URLSearchParams({ action: 'gateway_route.execute', from: since, limit: '500' })}`)
    expect((r.json.entries as any[]).filter((e) => e.targetId === routeId)).toHaveLength(1)
  })

  it('an endpoint deleted: what it was, still without a credential', async () => {
    expect((await gw.delete(`/api/v1/gateway/endpoints/${endpointId}`)).status).toBe(204)
    const e = await row('gateway_endpoint.delete', endpointId)
    expect(e.before).toMatchObject({ name: `sec-audit-${tag}`, authFields: ['keyHeader', 'keyValue'] })
    expect(JSON.stringify(e)).not.toContain(secret2)
    endpointId = ''
  })
})

describe('API clients', () => {
  let plaintext = ''
  it('a client created: its settings, never the key handed out', async () => {
    const r = await gw.post('/api/v1/gateway/clients', { name: `sec-audit-client-${tag}`, scopes: [], rateLimitRps: 5 })
    expect(r.status, r.text.slice(0, 200)).toBe(201)
    clientId = r.json.client.id
    plaintext = r.json.plaintext
    const e = await row('api_client.create', clientId)
    expect(e).toMatchObject({ targetType: 'api_client', targetLabel: `sec-audit-client-${tag}` })
    expect(e.after).toMatchObject({ name: `sec-audit-client-${tag}`, authMode: 'key', status: 'active', scopes: [], rateLimitRps: 5 })
    expect(JSON.stringify(e)).not.toContain(plaintext)
  })

  it('suspended, a key added and revoked, deleted', async () => {
    expect((await gw.patch(`/api/v1/gateway/clients/${clientId}`, { status: 'suspended' })).status).toBe(200)
    expect(await row('api_client.update', clientId)).toMatchObject({ before: { status: 'active' }, after: { status: 'suspended' } })

    const k = await gw.post(`/api/v1/gateway/clients/${clientId}/keys`, { label: 'rotation' })
    expect(k.status, k.text.slice(0, 200)).toBe(201)
    const added = await row('api_client.key_add', clientId)
    expect(added.after).toMatchObject({ keyId: k.json.key.id, prefix: k.json.key.prefix, label: 'rotation' })
    expect(JSON.stringify(added)).not.toContain(k.json.plaintext)

    expect((await gw.delete(`/api/v1/gateway/clients/${clientId}/keys/${k.json.key.id}`)).status).toBe(200)
    expect((await row('api_client.key_revoke', clientId))?.after).toEqual({ keyId: k.json.key.id })

    expect((await gw.delete(`/api/v1/gateway/clients/${clientId}`)).status).toBe(200)
    expect((await row('api_client.delete', clientId))?.before).toMatchObject({ name: `sec-audit-client-${tag}`, status: 'suspended' })
    clientId = ''
  })
})
