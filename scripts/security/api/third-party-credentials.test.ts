// F-059: the push provider key of a website (OneSignal REST API key) must never be in a response - not for anonymous visitors
// (GET /public/apps/:id), not for readers, not for the administrator; the dashboard only learns that one is saved.
// F-058 (part): the seeded editor and viewer roles can really do what their names say.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { Client, clientFor } from '../lib/client'
import { ROLE_USER_PASSWORD } from '../lib/config'

const tag = randomBytes(3).toString('hex')
const KEY = `REST-KEY-${tag}-SECRET`
let admin: Client
let anon: Client
let reader: Client
let siteId = ''
const cleanup: (() => Promise<unknown>)[] = []

const push = (extra: object = {}) => ({ shortName: 'App', push: { provider: 'onesignal', onesignalAppId: 'app-id-1', ...extra } })

beforeAll(async () => {
  admin = await clientFor('admin')
  anon = await clientFor('anon')
  reader = await clientFor('read')
  const site = await admin.post('/whoobe-one/websites', { name: `Push ${tag}`, rootPath: `/push-${tag}` })
  expect(site.status, site.text.slice(0, 120)).toBe(201)
  siteId = site.json.website.id
  cleanup.push(() => admin.delete(`/whoobe-one/websites/${siteId}`))
})
afterAll(async () => { for (const f of cleanup.reverse()) { try { await f() } catch { /* best effort */ } } })

describe('push provider key of a website', () => {
  it('is accepted, but appears in no response', async () => {
    const saved = await admin.patch(`/whoobe-one/websites/${siteId}`, { pwaEnabled: true, pwaConfig: push({ onesignalApiKey: KEY }) })
    expect(saved.status, saved.text.slice(0, 200)).toBe(200)
    expect(saved.text).not.toContain(KEY)
    const responses = [
      await anon.get(`/public/apps/${siteId}`),
      await reader.get(`/whoobe-one/websites/${siteId}`),
      await admin.get(`/whoobe-one/websites/${siteId}`),
      await admin.get('/whoobe-one/websites'),
      await reader.get('/whoobe-one/websites'),
      await admin.get(`/whoobe-one/websites/${siteId}/export`),
    ]
    for (const r of responses) {
      expect(r.status).toBe(200)
      expect(r.text).not.toContain(KEY)
      expect(r.text).not.toMatch(/enc:v1:/)
    }
  })
  it('the dashboard sees that a key is saved; an anonymous app does not even see that', async () => {
    const own = (await admin.get(`/whoobe-one/websites/${siteId}`)).json.website.pwaConfig.push
    expect(own).toMatchObject({ provider: 'onesignal', onesignalAppId: 'app-id-1', onesignalApiKeySet: true })
    expect(own.onesignalApiKey).toBeUndefined()
    const pub = (await anon.get(`/public/apps/${siteId}`)).json.pwaConfig.push
    expect(pub).toEqual({ provider: 'onesignal', onesignalAppId: 'app-id-1' })
  })
  it('saving the settings again without the key (what the dashboard sends) keeps it; a blank one keeps it too', async () => {
    const current = (await admin.get(`/whoobe-one/websites/${siteId}`)).json.website.pwaConfig
    expect((await admin.patch(`/whoobe-one/websites/${siteId}`, { pwaConfig: { ...current, shortName: 'Renamed' } })).status).toBe(200)
    expect((await admin.patch(`/whoobe-one/websites/${siteId}`, { pwaConfig: push({ onesignalApiKey: '  ' }) })).status).toBe(200)
    const after = (await admin.get(`/whoobe-one/websites/${siteId}`)).json.website.pwaConfig
    expect(after.push.onesignalApiKeySet).toBe(true)
  })
  it('a client cannot plant the flag, and the key can be removed explicitly', async () => {
    expect((await admin.patch(`/whoobe-one/websites/${siteId}`, { pwaConfig: push({ clearOnesignalApiKey: true }) })).status).toBe(200)
    expect((await admin.get(`/whoobe-one/websites/${siteId}`)).json.website.pwaConfig.push.onesignalApiKeySet).toBeUndefined()
    expect((await admin.patch(`/whoobe-one/websites/${siteId}`, { pwaConfig: push({ onesignalApiKeySet: true }) })).status).toBe(200)
    expect((await admin.get(`/whoobe-one/websites/${siteId}`)).json.website.pwaConfig.push.onesignalApiKeySet).toBeUndefined()
  })
})

describe('seeded roles (F-058)', () => {
  let editor: Client
  let viewer: Client
  const make = async (roleName: string) => {
    const roles = (await admin.get('/auth/roles')).json.roles as { id: string; name: string }[]
    const roleId = roles.find((r) => r.name === roleName)?.id
    expect(roleId, `role ${roleName}`).toBeTruthy()
    const email = `${roleName}-${tag}@sectest.local`
    const res = await admin.post('/auth/users', { email, password: ROLE_USER_PASSWORD, displayName: roleName, roleIds: [roleId] })
    expect(res.status, res.text.slice(0, 120)).toBe(201)
    cleanup.push(() => admin.delete(`/auth/users/${res.json.user.id}`))
    const c = new Client(undefined, email)
    await c.login(email, ROLE_USER_PASSWORD)
    return c
  }
  beforeAll(async () => { editor = await make('editor'); viewer = await make('viewer') })

  it('an editor reads and writes content but does not publish, manage users or settings', async () => {
    expect((await editor.get('/whoobe-one/pages')).status).toBe(200)
    const created = await editor.post('/whoobe-one/pages', { slug: `ed-${tag}`, title: 'by editor', websiteId: siteId, content: { id: 'r', blocks: [] } })
    expect(created.status, created.text.slice(0, 160)).toBe(201)
    const id = created.json.page.id
    cleanup.push(() => admin.delete(`/whoobe-one/pages/${id}`))
    expect((await editor.patch(`/whoobe-one/pages/${id}`, { title: 'edited' })).status).toBe(200)
    expect((await editor.patch(`/whoobe-one/pages/${id}`, { published: true })).status).toBe(403)
    expect((await editor.get('/auth/users')).status).toBe(403)
    expect((await editor.put(`/whoobe-one/websites/${siteId}/upload-settings`, { enabled: true })).status).toBe(403)
  })
  it('a viewer reads and cannot write', async () => {
    expect((await viewer.get('/whoobe-one/pages')).status).toBe(200)
    expect((await viewer.post('/whoobe-one/pages', { slug: `vw-${tag}`, title: 'x', websiteId: siteId, content: { id: 'r', blocks: [] } })).status).toBe(403)
    expect((await viewer.get('/auth/users')).status).toBe(403)
  })
})
