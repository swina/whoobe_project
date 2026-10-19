// The CDN in front of this installation (provider "cdn-origin", docs/plans/assets/cdn-providers-plan.md): nothing is uploaded, the CDN URL of a public file is
// built from the CDN address, the path the asset service serves and the file's version, and a mock CDN is asked once to confirm it serves the file. A private
// file is refused, a CDN that forwards to the wrong place is reported with a reason, a re-uploaded file gets a new `?v=`.
import { randomBytes } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client, clientFor } from '../lib/client'
import { ASSET_TARGET } from '../lib/config'
import { startMockCdn } from '../lib/mock-cdn'

const tag = randomBytes(3).toString('hex')
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
let admin: Client
let adminAsset: Client
let cdn: Awaited<ReturnType<typeof startMockCdn>>
let site = ''
const paths: string[] = []

async function upload(name: string, isPublic: boolean, data: Buffer = PNG) {
  const pimcorePath = `/cdnorigin-${tag}/${name}`
  const r = await adminAsset.upload('/api/v1/dam/upload', { pimcorePath, isPublic: String(isPublic) }, { file: { name, type: 'image/png', data: data as any } })
  expect(r.status, r.text.slice(0, 200)).toBe(200)
  if (!paths.includes(pimcorePath)) paths.push(pimcorePath)
  return { id: r.json.asset.id as string, pimcorePath }
}
const record = async (id: string) => { const r = await adminAsset.get(`/api/v1/dam/assets/${id}`); return r.json.asset ?? r.json }
const mirror = (id: string) => adminAsset.post(`/api/v1/dam/assets/${id}/mirror-cdn`, { websiteId: site })

beforeAll(async () => {
  admin = await clientFor('admin')
  adminAsset = admin.forBase(ASSET_TARGET)
  cdn = await startMockCdn()
  const s = await admin.post('/whoobe-one/websites', { name: `CdnOrigin ${tag}`, rootPath: `/cdnorigin${tag}` })
  expect(s.status, s.text.slice(0, 150)).toBe(201)
  site = s.json.website.id
  await admin.delete('/whoobe-one/settings/cdn-mirror')
  const put = await admin.put('/whoobe-one/settings/cdn-mirror', { websiteId: site, provider: 'cdn-origin', config: { baseUrl: `${cdn.base}/` } })
  expect(put.status, put.text.slice(0, 200)).toBe(200)
})
afterAll(async () => {
  for (const p of paths) { try { await adminAsset.request('DELETE', '/api/v1/dam/asset', { body: { pimcorePath: p } }) } catch { /* best effort */ } }
  try { await admin.delete(`/whoobe-one/websites/${site}`) } catch { /* best effort */ }
  await admin.delete('/whoobe-one/settings/cdn-mirror')
  await cdn.close()
})

describe('the settings', () => {
  it('the provider is offered with one field, the address, and no secret', async () => {
    const r = await admin.get('/whoobe-one/settings/cdn-providers')
    const p = (r.json.providers as { id: string; fields: { name: string; secret?: boolean }[] }[]).find((x) => x.id === 'cdn-origin')
    expect(p?.fields.map((f) => f.name)).toEqual(['baseUrl'])
    expect(p?.fields.some((f) => f.secret)).toBe(false)
  })
  it('the address is stored without its trailing slash; credentials, a query and a missing address are refused', async () => {
    const got = await admin.get(`/whoobe-one/settings/cdn-mirror?websiteId=${site}`)
    expect(got.json).toMatchObject({ scope: 'website', provider: 'cdn-origin', configured: true, config: { baseUrl: cdn.base } })
    for (const baseUrl of ['https://u:p@cdn.example.com', 'https://cdn.example.com/?a=1', 'nope']) {
      const bad = await admin.put('/whoobe-one/settings/cdn-mirror', { websiteId: site, provider: 'cdn-origin', config: { baseUrl } })
      expect(bad.status, baseUrl).toBe(400)
    }
    const kept = await admin.get(`/whoobe-one/settings/cdn-mirror?websiteId=${site}`)
    expect(kept.json.config.baseUrl).toBe(cdn.base)
  })
})

describe('the mirror call', () => {
  it('builds the CDN URL of a public file, asks the CDN once, and sends nothing', async () => {
    const { id } = await upload('logo one.png', true)
    const rec = await record(id)
    cdn.log.length = 0
    const r = await mirror(id)
    expect(r.status, r.text.slice(0, 300)).toBe(200)
    const m = r.json.asset.cdnMirrors['cdn-origin']
    expect(m).toMatchObject({ provider: 'cdn-origin', bytesSent: 0 })
    expect(m.url).toBe(`${cdn.base}/dam-asset/${rec.s3Key.split('/').map(encodeURIComponent).join('/')}?v=${rec.version}`)
    expect(cdn.log).toHaveLength(1)
    expect(cdn.log[0]).toMatchObject({ method: 'HEAD', query: `?v=${rec.version}` })
    expect(cdn.log[0].path).toBe(new URL(m.url).pathname)
  })

  it('a private file is refused and the CDN is not asked', async () => {
    const { id } = await upload('secret.png', false)
    cdn.log.length = 0
    const r = await mirror(id)
    expect(r.status).toBe(400)
    expect(r.json.error).toMatch(/private/)
    expect(cdn.log).toHaveLength(0)
    expect((await record(id)).cdnMirrors?.['cdn-origin']).toBeUndefined()
  })

  it('a CDN that forwards to the wrong place is reported with the reason, and nothing is recorded', async () => {
    const { id } = await upload('wrong.png', true)
    cdn.state.mode = 'html'
    const page = await mirror(id)
    cdn.state.mode = 'notfound'
    const missing = await mirror(id)
    cdn.state.mode = 'error'
    const down = await mirror(id)
    cdn.state.mode = 'ok'
    expect(page.status).toBe(502); expect(page.json.detail).toMatch(/web page/)   // in `detail`: a 5xx's `error` is replaced in production
    expect(missing.status).toBe(502); expect(missing.json.detail).toMatch(/404/)
    expect(down.status).toBe(502); expect(down.json.detail).toMatch(/503/)
    expect((await record(id)).cdnMirrors?.['cdn-origin']).toBeUndefined()
  })

  it('a re-uploaded file gets its own ?v= without a new mirror call (the origin sends files as immutable for a year)', async () => {
    const { id, pimcorePath } = await upload('replace.png', true)
    const first = (await mirror(id)).json.asset.cdnMirrors['cdn-origin'].url as string
    expect(first).toMatch(/\?v=1$/)
    await upload('replace.png', true, Buffer.concat([PNG, Buffer.from([0])]))
    cdn.log.length = 0
    const rec = await record(id)
    expect(rec.pimcorePath).toBe(pimcorePath)
    expect(rec.version).toBe(2)
    expect(rec.cdnMirrors['cdn-origin'].url).toBe(first.replace(/\?v=1$/, '?v=2'))
    expect(cdn.log).toHaveLength(0)
  })
})

describe('the test button', () => {
  it('checks a public file through the CDN: ok when it is served, a reason when it is not', async () => {
    await upload('sample.png', true)
    const ok = await admin.post('/whoobe-one/settings/cdn-mirror/test', { websiteId: site })
    expect(ok.json).toEqual({ ok: true })
    cdn.state.mode = 'notfound'
    const bad = await admin.post('/whoobe-one/settings/cdn-mirror/test', { websiteId: site })
    cdn.state.mode = 'ok'
    expect(bad.json).toMatchObject({ ok: false, error: expect.stringContaining('404') })
  })
})
