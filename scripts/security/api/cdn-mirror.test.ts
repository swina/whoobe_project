// CDN mirroring settings and the mirror call (docs/plans/assets/cdn-providers-plan.md): per website with the installation's default as the fallback,
// Cloudinary and Cloudflare Images as providers, the token stored encrypted and never shown, the upload to a mock Cloudflare Images with the real
// asset service.
import { randomBytes } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client, clientFor } from '../lib/client'
import { ASSET_TARGET } from '../lib/config'
import { startMockCloudflare } from '../lib/mock-cloudflare'

const tag = randomBytes(3).toString('hex')
const TOKEN = `cf-token-${randomBytes(6).toString('hex')}`
const ACCOUNT = randomBytes(16).toString('hex')
const ROUTE = '11111111-1111-4111-8111-111111111111'
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
let admin: Client
let adminAsset: Client
let cf: Awaited<ReturnType<typeof startMockCloudflare>>
let siteA = ''
let siteB = ''
const assets: string[] = []
const cleanup: (() => Promise<unknown>)[] = []

const cfSettings = (over: Record<string, unknown> = {}, token: string | undefined = TOKEN) => ({
  provider: 'cloudflare-images', config: { accountId: ACCOUNT, apiBase: cf.base, ...over }, ...(token ? { secrets: { apiToken: token } } : {}),
})
async function upload(name: string, type: string, data: Buffer | string) {
  const r = await adminAsset.upload('/api/v1/dam/upload', { pimcorePath: `/cdn-${tag}/${name}`, isPublic: 'true' }, { file: { name, type, data: data as any } })
  expect(r.status, r.text.slice(0, 200)).toBe(200)
  assets.push(`/cdn-${tag}/${name}`)
  return r.json.asset.id as string
}
const assetRecord = async (id: string) => (await adminAsset.get(`/api/v1/dam/assets/${id}`)).json.asset ?? (await adminAsset.get(`/api/v1/dam/assets/${id}`)).json

beforeAll(async () => {
  admin = await clientFor('admin')
  adminAsset = admin.forBase(ASSET_TARGET)
  cf = await startMockCloudflare({ token: TOKEN, account: ACCOUNT })
  for (const n of ['A', 'B']) {
    const site = await admin.post('/whoobe-one/websites', { name: `Cdn${n} ${tag}`, rootPath: `/cdn${n.toLowerCase()}${tag}` })
    expect(site.status, site.text.slice(0, 150)).toBe(201)
    if (n === 'A') siteA = site.json.website.id; else siteB = site.json.website.id
    cleanup.push(() => admin.delete(`/whoobe-one/websites/${site.json.website.id}`))
  }
  await admin.delete('/whoobe-one/settings/cdn-mirror')   // no default to start from
})
afterAll(async () => {
  for (const p of assets) { try { await adminAsset.request('DELETE', '/api/v1/dam/asset', { body: { pimcorePath: p } }) } catch { /* best effort */ } }
  await admin.delete('/whoobe-one/settings/cdn-mirror')
  for (const f of cleanup.reverse()) { try { await f() } catch { /* best effort */ } }
  await cf.close()
})

describe('who may read and change the settings', () => {
  it('everybody who reads objects can read them; changing them needs settings:manage (it holds a credential)', async () => {
    expect((await new Client().get('/whoobe-one/settings/cdn-mirror')).status).toBe(401)
    const write = await clientFor('write')
    expect((await write.get('/whoobe-one/settings/cdn-mirror')).status).toBe(200)
    expect((await write.get('/whoobe-one/settings/cdn-providers')).status).toBe(200)
    for (const [m, p] of [['PUT', '/whoobe-one/settings/cdn-mirror'], ['DELETE', '/whoobe-one/settings/cdn-mirror'], ['POST', '/whoobe-one/settings/cdn-mirror/test']] as const) {
      expect((await write.request(m, p, { body: {} })).status, `${m} ${p}`).toBe(403)
    }
  })
  it('lists the two providers with their fields, and marks the token as secret', async () => {
    const r = await admin.get('/whoobe-one/settings/cdn-providers')
    const byId = Object.fromEntries((r.json.providers as any[]).map((p) => [p.id, p]))
    expect(Object.keys(byId).sort()).toEqual(['cloudflare-images', 'cloudinary'])
    expect(byId['cloudinary'].fields.map((f: any) => f.name)).toEqual(['gatewayRouteId', 'uploadPreset'])
    expect(byId['cloudflare-images'].fields.find((f: any) => f.name === 'apiToken').secret).toBe(true)
  })
})

describe('the default and the website\'s own settings', () => {
  it('nothing is set; the old body of the default still works and the sync script still finds its keys', async () => {
    const none = await admin.get(`/whoobe-one/settings/cdn-mirror?websiteId=${siteA}`)
    expect(none.json).toMatchObject({ scope: 'none', configured: false })
    const legacy = await admin.put('/whoobe-one/settings/cdn-mirror', { gatewayRouteId: ROUTE, uploadPreset: 'old-preset', provider: 'cloudinary' })
    expect(legacy.status, legacy.text.slice(0, 200)).toBe(200)
    const got = await admin.get(`/whoobe-one/settings/cdn-mirror?websiteId=${siteA}`)
    expect(got.json).toMatchObject({ scope: 'default', provider: 'cloudinary', own: false, configured: true, gatewayRouteId: ROUTE, uploadPreset: 'old-preset' })
  })

  it('a website gets its own, the other keeps the default, and removing goes back', async () => {
    const put = await admin.put('/whoobe-one/settings/cdn-mirror', { websiteId: siteA, ...cfSettings() })
    expect(put.status, put.text.slice(0, 200)).toBe(200)
    expect(put.json).toMatchObject({ scope: 'website', provider: 'cloudflare-images', own: true, configured: true, gatewayRouteId: null })
    expect((await admin.get(`/whoobe-one/settings/cdn-mirror?websiteId=${siteA}`)).json).toMatchObject({ scope: 'website', provider: 'cloudflare-images', own: true })
    expect((await admin.get(`/whoobe-one/settings/cdn-mirror?websiteId=${siteB}`)).json).toMatchObject({ scope: 'default', provider: 'cloudinary', own: false })
    expect((await admin.request('DELETE', `/whoobe-one/settings/cdn-mirror?websiteId=${siteA}`)).json).toEqual({ removed: true })
    expect((await admin.get(`/whoobe-one/settings/cdn-mirror?websiteId=${siteA}`)).json).toMatchObject({ scope: 'default', provider: 'cloudinary' })
  })

  it('refuses what is not valid, and a website that is not there', async () => {
    for (const body of [
      { provider: 'imgix', config: {} }, { provider: 'cloudflare-images', config: { accountId: 'short' } }, { provider: 'cloudflare-images', config: { accountId: ACCOUNT, variant: 'a b' } },
      { provider: 'cloudflare-images', config: { accountId: ACCOUNT, apiBase: 'ftp://x' } }, { provider: 'cloudflare-images', config: { accountId: ACCOUNT, apiBase: 'https://u:p@x.com' } },
      { provider: 'cloudinary', config: { gatewayRouteId: 'nope' } }, { provider: 'cloudinary', config: { gatewayRouteId: 5 } },
    ]) expect((await admin.put('/whoobe-one/settings/cdn-mirror', body)).status, JSON.stringify(body)).toBe(400)
    expect((await admin.put('/whoobe-one/settings/cdn-mirror', { websiteId: '99999999-9999-4999-8999-999999999999', ...cfSettings() })).status).toBe(404)
  })
})

describe('the token', () => {
  it('is never returned, is "changed" in the audit row, and is kept when a later save does not send it', async () => {
    const put = await admin.put('/whoobe-one/settings/cdn-mirror', { websiteId: siteA, ...cfSettings() })
    expect(put.text).not.toContain(TOKEN)
    expect(put.json.secretsSet).toEqual({ apiToken: true })
    expect((await admin.get(`/whoobe-one/settings/cdn-mirror?websiteId=${siteA}`)).text).not.toContain(TOKEN)
    // the audit row is written when the answer has gone: look for it for a moment
    const findRow = async () => ((await admin.get('/audit-log?action=setting.cdn_mirror_update&limit=30')).json.entries as any[]).find((e) => e.targetId === `cdn_mirror:${siteA}` && e.after?.['secrets.apiToken'])
    let row = await findRow()
    for (let i = 0; i < 10 && !row; i++) { await new Promise((r) => setTimeout(r, 300)); row = await findRow() }
    expect(row, `no audit row for ${siteA}: ${JSON.stringify(((await admin.get('/audit-log?action=setting.cdn_mirror_update&limit=8')).json.entries as any[]).map((e) => [e.targetId, e.at]))}`).toBeTruthy()
    const log = { json: { entries: [row] } }
    expect(JSON.stringify(log.json)).not.toContain(TOKEN)
    expect(JSON.stringify(log.json.entries[0].after)).toContain('"secrets.apiToken":"changed"')
    expect(log.json.entries[0]).toMatchObject({ targetId: `cdn_mirror:${siteA}`, action: 'setting.cdn_mirror_update' })
    // another save without the token: still configured, the token is still the one that works
    const again = await admin.put('/whoobe-one/settings/cdn-mirror', { websiteId: siteA, ...cfSettings({ variant: 'hero' }, undefined) })
    expect(again.json).toMatchObject({ configured: true, secretsSet: { apiToken: true } })
    const t = await admin.post('/whoobe-one/settings/cdn-mirror/test', { websiteId: siteA })
    expect(t.json).toEqual({ ok: true })
  })

  it('the test says what Cloudflare said for a wrong token, and what is missing for an incomplete setting', async () => {
    await admin.put('/whoobe-one/settings/cdn-mirror', { websiteId: siteB, ...cfSettings({}, 'wrong-token') })
    const bad = await admin.post('/whoobe-one/settings/cdn-mirror/test', { websiteId: siteB })
    expect(bad.json).toMatchObject({ ok: false, error: expect.stringContaining('Invalid access token') })
    await admin.put('/whoobe-one/settings/cdn-mirror', { websiteId: siteB, ...cfSettings({}, undefined) })   // provider kept, token dropped? no: same provider keeps it
    await admin.request('DELETE', `/whoobe-one/settings/cdn-mirror?websiteId=${siteB}`)
    await admin.put('/whoobe-one/settings/cdn-mirror', { websiteId: siteB, provider: 'cloudflare-images', config: { accountId: ACCOUNT } })
    const missing = await admin.post('/whoobe-one/settings/cdn-mirror/test', { websiteId: siteB })
    expect(missing.json).toMatchObject({ ok: false, error: expect.stringContaining('apiToken') })
    await admin.request('DELETE', `/whoobe-one/settings/cdn-mirror?websiteId=${siteB}`)
  })
})

describe('the mirror call', () => {
  it('sends the bytes to Cloudflare Images with the token of the website, stores the delivery URL as that provider\'s mirror, and the sync status knows', async () => {
    await admin.put('/whoobe-one/settings/cdn-mirror', { websiteId: siteA, ...cfSettings() })
    const id = await upload('mirror.png', 'image/png', PNG)
    const status = async (provider: string) => (await new Client().get(`/public/dam/assets/mirror-status?paths=${id}&provider=${provider}`)).json.status[id].mirrored
    expect([await status('cloudflare-images'), await status('cloudinary')]).toEqual([false, false])

    const r = await adminAsset.post(`/api/v1/dam/assets/${id}/mirror-cdn`, { websiteId: siteA })
    expect(r.status, r.text.slice(0, 300)).toBe(200)
    const mirrors = r.json.asset.cdnMirrors
    expect(Object.keys(mirrors)).toEqual(['cloudflare-images'])
    expect(mirrors['cloudflare-images']).toMatchObject({ provider: 'cloudflare-images', url: `https://imagedelivery.example/HASH/${id}/public`, providerAssetId: id, bytesSent: PNG.length })
    const stored = cf.images.get(id)!
    expect(stored.bytes.equals(PNG)).toBe(true)
    expect(stored.contentType).toBe('image/png')
    expect(cf.log.at(-1)!.authorization).toBe(`Bearer ${TOKEN}`)
    expect([await status('cloudflare-images'), await status('cloudinary')]).toEqual([true, false])

    // a second mirror of the same asset: the old image is deleted and sent again, the URL stays
    const again = await adminAsset.post(`/api/v1/dam/assets/${id}/mirror-cdn`, { websiteId: siteA })
    expect(again.status, again.text.slice(0, 300)).toBe(200)
    expect(again.json.asset.cdnMirrors['cloudflare-images'].url).toBe(mirrors['cloudflare-images'].url)
    expect(cf.log.filter((l) => l.method === 'DELETE').length).toBeGreaterThan(0)
    expect(cf.images.size).toBeGreaterThanOrEqual(1)
  })

  it('what Cloudflare cannot take is refused before anything is sent, and a refusal of Cloudflare is reported with its own words', async () => {
    const pdf = await upload('doc.pdf', 'application/pdf', '%PDF-1.4\n%%EOF\n')
    const before = cf.log.length
    const r = await adminAsset.post(`/api/v1/dam/assets/${pdf}/mirror-cdn`, { websiteId: siteA })
    expect(r.status).toBe(415)
    expect(r.json.error).toMatch(/not application\/pdf/)
    expect(cf.log.length).toBe(before)

    const png = await upload('refused.png', 'image/png', PNG)
    cf.state.fail = { status: 403, code: 10000, message: 'Authentication error' }
    const bad = await adminAsset.post(`/api/v1/dam/assets/${png}/mirror-cdn`, { websiteId: siteA })
    cf.state.fail = undefined
    expect(bad.status).toBe(502)
    expect(bad.json.detail).toBe('10000 Authentication error')   // in `detail`: a 5xx's `error` is replaced in production
  })

  it('a website with nothing set up (and no default) is told so; the old call with a Gateway route still means Cloudinary', async () => {
    await admin.delete('/whoobe-one/settings/cdn-mirror')   // the default goes
    const id = await upload('none.png', 'image/png', PNG)
    const none = await adminAsset.post(`/api/v1/dam/assets/${id}/mirror-cdn`, { websiteId: siteB })
    expect(none.status).toBe(400)
    expect(none.json.error).toMatch(/not set up for this website/)
    // the old body: Cloudinary through a Gateway route, which does not exist (or cannot be reached) here -> a failure of that path, not the "not set up" 400 and
    // not a call to Cloudflare
    const sent = cf.log.length
    const legacy = await adminAsset.post(`/api/v1/dam/assets/${id}/mirror-cdn`, { gatewayRouteId: ROUTE, uploadPreset: 'p' })
    expect(legacy.status).toBeGreaterThanOrEqual(500)
    expect(cf.log.length).toBe(sent)
  })

  it('a website without its own settings uses the default: Cloudflare as the default sends to Cloudflare', async () => {
    await admin.put('/whoobe-one/settings/cdn-mirror', cfSettings())   // the default, no website
    const id = await upload('dflt.png', 'image/png', PNG)
    const r = await adminAsset.post(`/api/v1/dam/assets/${id}/mirror-cdn`, { websiteId: siteB })
    expect(r.status, r.text.slice(0, 300)).toBe(200)
    expect(r.json.asset.cdnMirrors['cloudflare-images'].url).toContain(id)
    const noSite = await adminAsset.post(`/api/v1/dam/assets/${id}/mirror-cdn`, {})
    expect(noSite.status).toBe(200)
  })
})
