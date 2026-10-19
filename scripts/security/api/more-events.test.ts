// Events of files in the library and of pages (docs/plans/system/more-events-plan.md): the same subscriptions, outbox, delivery log and loop guard as
// object events. The log shows the type and the id of the subject (never the content); the worker is not needed to see that an event was queued.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { Client, clientFor } from '../lib/client'
import { ASSET_TARGET, GATEWAY_TARGET } from '../lib/config'

const tag = randomBytes(3).toString('hex')
const POSTGRES = process.env.SEC_POSTGRES_CONTAINER ?? 'whoobe-sectest-postgres-1'
const psql = (sql: string) => execFileSync('docker', ['exec', POSTGRES, 'psql', '-U', process.env.SEC_DB_USER ?? 'sectest', '-d', process.env.SEC_DB_NAME ?? 'whoobe_sec_test', '-tAc', sql], { encoding: 'utf8' }).trim()
const dir = `/ev-${tag}`
let admin: Client
let adminAsset: Client
let gwAdmin: Client
let endpointId = ''
let routeId = ''
let subId = ''
const cleanup: (() => Promise<unknown>)[] = []

const log = async (type?: string) => (await admin.get(`/object-event-subscriptions/${subId}/deliveries?limit=200${type ? `&type=${type}` : ''}`)).json.deliveries as { id: string; status: string; event: { type: string; objectId: string | null; test: boolean } }[]
const put = (name: string, data: string, folder = dir) =>
  adminAsset.upload('/api/v1/dam/upload', { pimcorePath: `${folder}/${name}`, isPublic: 'false' }, { file: { name, type: 'text/plain', data } })
const assetId = async (path: string) => {
  const list = (await adminAsset.get(`/api/v1/dam/assets?folderPath=${encodeURIComponent(path.slice(0, path.lastIndexOf('/')))}`)).json.assets as { id: string; pimcorePath: string }[]
  return list.find((a) => a.pimcorePath === path)!.id
}

beforeAll(async () => {
  admin = await clientFor('admin')
  adminAsset = admin.forBase(ASSET_TARGET)
  gwAdmin = admin.forBase(GATEWAY_TARGET)
  const e = await gwAdmin.post('/api/v1/gateway/endpoints', { name: `sec-more-ev-${tag}`, baseUrl: 'http://core-api:3003', authType: 'none' })
  expect(e.status, e.text.slice(0, 150)).toBe(201)
  endpointId = e.json.id
  cleanup.push(() => gwAdmin.delete(`/api/v1/gateway/endpoints/${endpointId}`))
  const r = await gwAdmin.post(`/api/v1/gateway/endpoints/${endpointId}/routes`, { path: '/public/data-objects/query', method: 'POST' })
  expect(r.status, r.text.slice(0, 150)).toBe(201)
  routeId = r.json.id
  const s = await admin.post('/object-event-subscriptions', {
    name: `more-${tag}`, endpointId, routeId, signingSecretRef: null,
    events: ['asset.created', 'asset.updated', 'asset.moved', 'asset.deleted', 'asset.bulk', 'page.published', 'page.unpublished'],
  })
  expect(s.status, s.text.slice(0, 200)).toBe(201)
  subId = s.json.subscription?.id ?? s.json.id
  cleanup.push(() => admin.delete(`/object-event-subscriptions/${subId}`))
})
afterAll(async () => {
  try { await adminAsset.request('DELETE', '/api/v1/dam/folders', { body: { path: dir } }) } catch { /* best effort */ }
  for (const f of cleanup.reverse()) { try { await f() } catch { /* best effort */ } }
})

describe('subscriptions to files and pages', () => {
  it('list the types the guide names, and refuse the impossible: a class with a file type, an unknown type', async () => {
    const classes = (await admin.get('/data-classes')).json.classes as { id: string }[]
    const base = { endpointId, routeId }
    const klass = classes[0]?.id
    if (klass) {
      const r = await admin.post('/object-event-subscriptions', { ...base, name: `bad-${tag}`, classId: klass, events: ['asset.created'] })
      expect(r.status).toBe(400)
      expect(r.json.error).toMatch(/object events only/)
    }
    expect((await admin.post('/object-event-subscriptions', { ...base, name: `bad2-${tag}`, events: ['asset.exploded'] })).status).toBe(400)
    const ok = await admin.post('/object-event-subscriptions', { ...base, name: `ok-${tag}`, events: ['page.published'] })
    expect(ok.status, ok.text.slice(0, 150)).toBe(201)
    await admin.delete(`/object-event-subscriptions/${ok.json.subscription?.id ?? ok.json.id}`)
  })
})

describe('files', () => {
  it('an upload is asset.created with the id of the file; a second upload to the path is asset.updated', async () => {
    const up = await put('a.txt', 'first')
    expect(up.status, up.text.slice(0, 200)).toBe(200)
    const id = up.json.asset.id
    expect((await log('asset.created')).map((d) => d.event.objectId)).toContain(id)
    const again = await put('a.txt', 'second, longer')
    expect(again.status).toBe(200)
    expect((await log('asset.updated')).filter((d) => d.event.objectId === id)).toHaveLength(1)
    expect((await log('asset.created')).filter((d) => d.event.objectId === id)).toHaveLength(1)
  })

  it('a move is one asset.moved, not a created and a deleted', async () => {
    const up = await put('m.txt', 'moving')
    const id = up.json.asset.id
    const before = { created: (await log('asset.created')).length, deleted: (await log('asset.deleted')).length }
    const moved = await adminAsset.post('/api/v1/dam/assets/move', { pimcorePath: `${dir}/m.txt`, targetFolderPath: `${dir}/moved` })
    expect(moved.status, moved.text.slice(0, 200)).toBe(200)
    const newId = moved.json.asset.id
    expect((await log('asset.moved')).map((d) => d.event.objectId)).toContain(newId)
    expect((await log('asset.created')).length).toBe(before.created)
    expect((await log('asset.deleted')).length).toBe(before.deleted)
    expect(id).toBeTruthy()
  })

  it('a delete is asset.deleted with the id of the file that went', async () => {
    await put('d.txt', 'bye')
    const id = await assetId(`${dir}/d.txt`)
    const r = await adminAsset.request('DELETE', '/api/v1/dam/asset', { body: { pimcorePath: `${dir}/d.txt` } })
    expect(r.status, r.text.slice(0, 200)).toBe(200)
    expect((await log('asset.deleted')).map((d) => d.event.objectId)).toContain(id)
  })

  it('a folder of a few files gives one asset.deleted each; a big one ONE asset.bulk', async () => {
    for (let i = 0; i < 2; i++) await put(`s${i}.txt`, 'x', `${dir}/small`)
    const smallIds = [await assetId(`${dir}/small/s0.txt`), await assetId(`${dir}/small/s1.txt`)]
    const del = await adminAsset.request('DELETE', '/api/v1/dam/folders', { body: { path: `${dir}/small` } })
    expect(del.status, del.text.slice(0, 200)).toBe(200)
    const deleted = (await log('asset.deleted')).map((d) => d.event.objectId)
    for (const id of smallIds) expect(deleted).toContain(id)

    const bulkBefore = (await log('asset.bulk')).length
    const deletedBefore = (await log('asset.deleted')).length
    for (let i = 0; i < 11; i++) expect((await put(`b${i}.txt`, 'x', `${dir}/big`)).status).toBe(200)
    const big = await adminAsset.request('DELETE', '/api/v1/dam/folders', { body: { path: `${dir}/big` } })
    expect(big.json.deletedAssetCount).toBe(11)
    expect((await log('asset.bulk')).length).toBe(bulkBefore + 1)
    expect((await log('asset.deleted')).length).toBe(deletedBefore)
  })

  it('who may delete a file did not change: a person without assets:delete still gets 403, the event is not the way around it', async () => {
    const none = await clientFor('none')
    const r = await none.forBase(ASSET_TARGET).request('DELETE', '/api/v1/dam/asset', { body: { pimcorePath: `${dir}/a.txt` } })
    expect([401, 403]).toContain(r.status)
    expect(await assetId(`${dir}/a.txt`)).toBeTruthy()
  })
})

describe('what the event carries', () => {
  it('the id, the path, the type and the size of a file - not its bytes - and the person who uploaded it', async () => {
    const up = await put('shape.txt', 'SECRET-BYTES-OF-THE-FILE')
    const id = up.json.asset.id
    const payload = JSON.parse(psql(`SELECT payload FROM object_events WHERE type = 'asset.created' AND object_id = '${id}'`))
    expect(payload).toMatchObject({
      type: 'asset.created', actor: { type: 'user' },
      asset: { id, path: `${dir}/shape.txt`, filename: 'shape.txt', mimeType: 'text/plain', fileType: 'TXT', isPublic: false, version: 1 },
    })
    expect(payload.asset.sizeBytes).toBe(24)
    expect(payload.actor.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(payload.class).toBeUndefined()
    expect(JSON.stringify(payload)).not.toContain('SECRET-BYTES')
    expect(psql(`SELECT class_id IS NULL AND subject_type = 'asset' FROM object_events WHERE object_id = '${id}' AND type = 'asset.created'`)).toBe('t')
  })
})

describe('pages', () => {
  it('publishing a page is page.published, unpublishing page.unpublished, saving an already published page neither', async () => {
    const site = await admin.post('/whoobe-one/websites', { name: `Ev ${tag}`, rootPath: `/ev-${tag}` })
    expect(site.status, site.text.slice(0, 150)).toBe(201)
    cleanup.push(() => admin.delete(`/whoobe-one/websites/${site.json.website.id}`))
    const page = await admin.post('/whoobe-one/pages', { slug: `ev-${tag}`, title: 'Ev', websiteId: site.json.website.id, content: { id: 'root', tag: 'document', type: 'container', element: 'div', css: { css: '', container: '' }, blocks: [] } })
    expect(page.status, page.text.slice(0, 200)).toBe(201)
    const id = page.json.page.id
    cleanup.push(() => admin.delete(`/whoobe-one/pages/${id}`))
    const count = async (t: string) => (await log(t)).filter((d) => d.event.objectId === id).length

    expect((await admin.patch(`/whoobe-one/pages/${id}`, { title: 'Ev 2' })).status).toBe(200)
    expect([await count('page.published'), await count('page.unpublished')]).toEqual([0, 0])
    expect((await admin.patch(`/whoobe-one/pages/${id}`, { published: true })).status).toBe(200)
    expect((await admin.patch(`/whoobe-one/pages/${id}`, { published: true, title: 'Ev 3' })).status).toBe(200)
    expect([await count('page.published'), await count('page.unpublished')]).toEqual([1, 0])
    expect((await admin.patch(`/whoobe-one/pages/${id}`, { published: false })).status).toBe(200)
    expect([await count('page.published'), await count('page.unpublished')]).toEqual([1, 1])
  })
})
