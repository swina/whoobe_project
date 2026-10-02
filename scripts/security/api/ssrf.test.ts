// Plan 3.8: server-side requests to operator-supplied URLs (gateway upstreams, OpenAPI spec import).
// The stack runs NODE_ENV=production, so loopback/link-local/metadata are blocked by the outbound policy;
// private ranges stay allowed by default (a positive control proves the proxy still works).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client, clientFor } from '../lib/client'
import { GATEWAY_TARGET } from '../lib/config'

let gw: Client
const endpoints: string[] = []

async function endpoint(baseUrl: string, path = '/health') {
  const e = await gw.post('/api/v1/gateway/endpoints', { name: `sec-ssrf-${endpoints.length}`, baseUrl, authType: 'none' })
  expect(e.status, e.text.slice(0, 150)).toBe(201)
  endpoints.push(e.json.id)
  const r = await gw.post(`/api/v1/gateway/endpoints/${e.json.id}/routes`, { path, method: 'GET' })
  expect(r.status, r.text.slice(0, 150)).toBe(201)
  return { endpointId: e.json.id as string, routeId: r.json.id as string }
}

beforeAll(async () => { gw = (await clientFor('admin')).forBase(GATEWAY_TARGET) })
afterAll(async () => { for (const id of endpoints) await gw.delete(`/api/v1/gateway/endpoints/${id}`) })

describe('gateway admin API is not open', () => {
  it('rejects anonymous and under-privileged callers', async () => {
    const anon = new Client(GATEWAY_TARGET)
    const write = (await clientFor('write')).forBase(GATEWAY_TARGET)
    for (const [m, p] of [['GET', '/api/v1/gateway/endpoints'], ['POST', '/api/v1/gateway/endpoints'], ['POST', '/api/v1/gateway/routes/00000000-0000-4000-8000-000000000000/test'], ['POST', '/api/v1/gateway/routes/00000000-0000-4000-8000-000000000000/execute'], ['POST', '/api/v1/gateway/endpoints/00000000-0000-4000-8000-000000000000/import-openapi']] as const) {
      expect((await anon.request(m, p, { body: m === 'GET' ? undefined : {} })).status, `${m} ${p} anon`).toBe(401)
      expect((await write.request(m, p, { body: m === 'GET' ? undefined : {} })).status, `${m} ${p} write`).toBe(403)
    }
  })
})

describe('gateway upstreams cannot reach internal-only addresses', () => {
  const blocked = ['http://127.0.0.1:3001', 'http://localhost:3003', 'http://[::1]:3003', 'http://127.1:3003', 'http://2130706433:3003', 'http://[::ffff:127.0.0.1]:3003', 'http://169.254.169.254', 'http://0.0.0.0:3003']

  it.each(blocked)('route test against %s is refused and leaks nothing', async (base) => {
    const { routeId } = await endpoint(base)
    const r = await gw.post(`/api/v1/gateway/routes/${routeId}/test`, {})
    expect(r.status, r.text.slice(0, 200)).toBeGreaterThanOrEqual(400)
    expect(r.text).not.toMatch(/"status":"ok"|"service":"/)
  })

  it('route execute against loopback is refused too', async () => {
    const { routeId } = await endpoint('http://127.0.0.1:3003')
    const r = await gw.post(`/api/v1/gateway/routes/${routeId}/execute`, {})
    // execute reports upstream failures as 200 { error: true }
    expect(r.json?.error, r.text.slice(0, 200)).toBe(true)
    expect(r.text).not.toMatch(/"service":"core-api"/)
  })

  it('positive control: a private-network upstream (core-api on the compose network) still works by default', async () => {
    const { routeId } = await endpoint('http://core-api:3003')
    const r = await gw.post(`/api/v1/gateway/routes/${routeId}/test`, {})
    expect(r.status, r.text.slice(0, 200)).toBe(200)
    expect(r.text).toContain('core-api')
  })
})

describe('OpenAPI import', () => {
  let target = ''
  beforeAll(async () => { target = (await endpoint('http://core-api:3003')).endpointId })
  const importSpec = (body: unknown) => gw.post(`/api/v1/gateway/endpoints/${target}/import-openapi`, body)

  it.each(['http://127.0.0.1:3003/health', 'http://169.254.169.254/latest/meta-data/', 'http://localhost:3001/health', 'file:///etc/passwd'])('specUrl %s is refused and its content is not returned', async (specUrl) => {
    const r = await importSpec({ specUrl })
    expect(r.status).toBeGreaterThanOrEqual(400)
    expect(r.text).not.toMatch(/root:x:0:0|"service":/)
  })

  it('a pasted spec cannot pull in local files or internal URLs through $ref', async () => {
    const spec = {
      openapi: '3.0.0', info: { title: 't', version: '1' },
      paths: {
        '/a': { get: { responses: { '200': { description: 'ok', content: { 'application/json': { schema: { $ref: 'file:///etc/passwd' } } } } } } },
        '/b': { get: { responses: { '200': { description: 'ok', content: { 'application/json': { schema: { $ref: 'http://core-api:3003/health' } } } } } } },
      },
    }
    const r = await importSpec({ specRaw: JSON.stringify(spec) })
    expect(r.text).not.toMatch(/root:x:0:0|"service":"core-api"|daemon:/)
  })

  it('a harmless inline spec still imports (the importer keeps working)', async () => {
    const spec = { openapi: '3.0.0', info: { title: 't', version: '1' }, paths: { '/ping': { get: { responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } } } } } } } }
    const r = await importSpec({ specRaw: JSON.stringify(spec) })
    expect(r.status, r.text.slice(0, 200)).toBe(200)
  })
})
