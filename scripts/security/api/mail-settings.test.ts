// Outgoing mail: one default configuration, optionally one per website; SMTP or an HTTP mail provider (OneSignal ...);
// passwords and API keys are write-only. The actual sending is not exercised here (it would call the provider).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { Client, clientFor } from '../lib/client'

const tag = randomBytes(3).toString('hex')
const KEY = `os_secret_${tag}_do_not_leak`
const SMTP_PW = `smtp_pw_${tag}_do_not_leak`
let admin: Client
let anon: Client
let siteId = ''
const cleanup: (() => Promise<unknown>)[] = []

beforeAll(async () => {
  admin = await clientFor('admin')
  anon = new Client()
  const w = await admin.post('/whoobe-one/websites', { name: `Mail ${tag}`, rootPath: `/mail-${tag}` })
  expect(w.status, w.text.slice(0, 100)).toBe(201)
  siteId = w.json.website.id
  cleanup.push(() => admin.delete(`/whoobe-one/websites/${siteId}`))
})
afterAll(async () => { for (const f of cleanup.reverse()) { try { await f() } catch { /* best effort */ } } })

describe('mail providers', () => {
  it('lists the installed providers with their fields, and needs a permission', async () => {
    expect((await anon.get('/mail-providers')).status).toBe(401)
    const r = await admin.get('/mail-providers')
    expect(r.status).toBe(200)
    const os = r.json.find((p: any) => p.id === 'onesignal')
    expect(os.label).toBe('OneSignal')
    expect(os.configFields.map((f: any) => [f.name, !!f.secret])).toEqual([['appId', false], ['apiKey', true], ['senderDomain', false]])
    expect(os.capabilities).toMatchObject({ html: true, attachments: false })
    expect(JSON.stringify(r.json)).not.toMatch(/Authorization|request/)   // the definitions' internals stay on the server
  })
})

describe('the default configuration (SMTP)', () => {
  it('saves in the nested shape and the old flat one; the password never comes back', async () => {
    const a = await admin.put('/mail-settings', { provider: 'smtp', smtp: { host: 'smtp.sectest.local', port: 2525, secure: false, user: 'u', password: SMTP_PW }, fromAddress: 'noreply@sectest.local' })
    expect(a.status, a.text.slice(0, 160)).toBe(200)
    expect(a.json.settings.smtp).toMatchObject({ host: 'smtp.sectest.local', port: 2525, hasPassword: true })
    const flat = await admin.put('/mail-settings', { host: 'smtp.sectest.local', port: 2525, secure: false, user: 'u', fromAddress: 'noreply@sectest.local' })
    expect(flat.status).toBe(200)
    expect(flat.json.settings.smtp.hasPassword, 'a blank password keeps the stored one').toBe(true)
    const g = await admin.get('/mail-settings')
    expect(g.json).toMatchObject({ websiteId: null, encryptionConfigured: true, effective: { scope: 'default', provider: 'smtp' } })
    expect(a.text + flat.text + g.text).not.toContain(SMTP_PW)
  })

  it('refuses SMTP without a host, a port or a sender', async () => {
    expect((await admin.put('/mail-settings', { provider: 'smtp', smtp: { host: '', port: 25 }, fromAddress: 'a@b.co' })).status).toBe(400)
    expect((await admin.put('/mail-settings', { provider: 'smtp', smtp: { host: 'h', port: 25 } })).status).toBe(400)
  })

  it('cannot be removed', async () => {
    expect((await admin.delete('/mail-settings')).status).toBe(400)
  })
})

describe('a website with its own provider', () => {
  const body = (over: Record<string, unknown> = {}) => ({ websiteId: siteId, provider: 'onesignal', providerConfig: { appId: '11111111-2222-4333-8444-555555555555', apiKey: KEY, senderDomain: 'mail.sectest.local' }, fromAddress: 'noreply@mail.sectest.local', fromName: 'Sectest', ...over })

  it('before: it sends with the default', async () => {
    const g = await admin.get(`/mail-settings?websiteId=${siteId}`)
    expect(g.json.settings).toBeNull()
    expect(g.json.effective).toMatchObject({ scope: 'default', provider: 'smtp' })
  })

  it('saves; the API key is encrypted on the server and never shown, only that it is set', async () => {
    const r = await admin.put('/mail-settings', body())
    expect(r.status, r.text.slice(0, 160)).toBe(200)
    expect(r.json.settings).toMatchObject({ scope: 'website', websiteId: siteId, provider: 'onesignal', fromAddress: 'noreply@mail.sectest.local', secretsSet: { apiKey: true } })
    expect(r.json.settings.providerConfig).toEqual({ appId: '11111111-2222-4333-8444-555555555555', senderDomain: 'mail.sectest.local' })
    const g = await admin.get(`/mail-settings?websiteId=${siteId}`)
    expect(g.json.effective).toMatchObject({ scope: 'website', provider: 'onesignal' })
    expect(r.text + g.text).not.toContain(KEY)
  })

  it('a blank API key keeps the stored one; the other fields change', async () => {
    const r = await admin.put('/mail-settings', body({ providerConfig: { appId: '99999999-2222-4333-8444-555555555555', apiKey: '', senderDomain: '' } }))
    expect(r.status).toBe(200)
    expect(r.json.settings.secretsSet).toEqual({ apiKey: true })
    expect(r.json.settings.providerConfig.appId).toBe('99999999-2222-4333-8444-555555555555')
  })

  it('refuses a missing required field, an unknown provider and an unknown website', async () => {
    const missing = await admin.put('/mail-settings', body({ providerConfig: { apiKey: KEY } }))
    expect(missing.status).toBe(400)
    expect(missing.json.error).toMatch(/App ID is required/)
    expect((await admin.put('/mail-settings', body({ provider: 'nope' }))).status).toBe(400)
    expect((await admin.put('/mail-settings', body({ websiteId: '00000000-0000-4000-8000-000000000000' }))).status).toBe(404)
    expect((await admin.get('/mail-settings?websiteId=not-a-uuid')).status).toBe(404)
  })

  it('removing it returns the website to the default; removing again says nothing was there', async () => {
    const r = await admin.delete(`/mail-settings?websiteId=${siteId}`)
    expect(r.json).toEqual({ removed: true })
    expect((await admin.get(`/mail-settings?websiteId=${siteId}`)).json.effective).toMatchObject({ scope: 'default' })
    expect((await admin.delete(`/mail-settings?websiteId=${siteId}`)).json).toEqual({ removed: false })
  })

  it('goes with the website when the website is deleted', async () => {
    const w = await admin.post('/whoobe-one/websites', { name: `Mail gone ${tag}`, rootPath: `/mailgone-${tag}` })
    const id = w.json.website.id
    expect((await admin.put('/mail-settings', body({ websiteId: id }))).status).toBe(200)
    expect((await admin.delete(`/whoobe-one/websites/${id}`)).status).toBe(200)
    expect((await admin.get(`/mail-settings?websiteId=${id}`)).status).toBe(404)
  })
})

describe('the test mail and the log know whose configuration was used', () => {
  it('a test for an unknown website is refused before anything is sent', async () => {
    const r = await admin.post('/mail-settings/test', { websiteId: '00000000-0000-4000-8000-000000000000', to: 'a@b.co', subject: 's', text: 'x' })
    expect(r.status).toBe(404)
  })
})
