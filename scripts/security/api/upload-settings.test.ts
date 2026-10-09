// A website's upload limits (settings.uploads): read as normalized, written only when they can be trusted, and only with settings:manage.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { Client, clientFor } from '../lib/client'

const tag = randomBytes(3).toString('hex')
let admin: Client
let read: Client
let write: Client
let siteId = ''
const url = () => `/whoobe-one/websites/${siteId}/upload-settings`

beforeAll(async () => {
  admin = await clientFor('admin')
  read = await clientFor('read')
  write = await clientFor('write')
  const r = await admin.post('/whoobe-one/websites', { name: `Uploads ${tag}`, rootPath: `/up-${tag}` })
  expect(r.status, r.text.slice(0, 120)).toBe(201)
  siteId = r.json.website.id
})
afterAll(async () => { if (siteId) await admin.delete(`/whoobe-one/websites/${siteId}`) })

describe('website upload settings', () => {
  it('start off, private and small', async () => {
    const r = await admin.get(url())
    expect(r.status).toBe(200)
    expect(r.json.uploads).toMatchObject({ enabled: false, allowedExtensions: [], targetFolder: 'private/forms', allowPublicFolder: false })
    expect(r.json.availableExtensions).toContain('pdf')
    expect(r.json.availableExtensions).not.toContain('html')
    expect(r.json.ceilings.maxFileBytes).toBeGreaterThan(0)
  })
  it('saves valid limits and reads them back', async () => {
    const put = await admin.put(url(), { enabled: true, allowedExtensions: ['pdf', 'png'], maxFileBytes: 2 * 1024 * 1024, maxFiles: 2, dailyBytes: 50 * 1024 * 1024, targetFolder: 'private/cv' })
    expect(put.status, put.text.slice(0, 200)).toBe(200)
    const r = await admin.get(url())
    expect(r.json.uploads).toMatchObject({ enabled: true, allowedExtensions: ['pdf', 'png'], maxFileBytes: 2 * 1024 * 1024, maxFiles: 2, targetFolder: 'private/cv' })
  })
  it('refuses file types that can never be allowed, and says which', async () => {
    const r = await admin.put(url(), { enabled: true, allowedExtensions: ['pdf', 'html', 'svg', 'exe'] })
    expect(r.status).toBe(400)
    expect(r.json.rejectedExtensions.sort()).toEqual(['exe', 'html', 'svg'])
    expect((await admin.get(url())).json.uploads.allowedExtensions).toEqual(['pdf', 'png']) // unchanged
  })
  it('a public or invalid folder is refused unless allowed', async () => {
    expect((await admin.put(url(), { enabled: true, allowedExtensions: ['pdf'], targetFolder: 'public/cv' })).status).toBe(400)
    expect((await admin.put(url(), { enabled: true, allowedExtensions: ['pdf'], targetFolder: '../etc' })).status).toBe(400)
    expect((await admin.put(url(), { enabled: true, allowedExtensions: ['pdf'], targetFolder: 'public/cv', allowPublicFolder: true })).status).toBe(200)
    expect((await admin.get(url())).json.uploads.targetFolder).toBe('public/cv')
  })
  it('numbers beyond the ceilings are held to them', async () => {
    await admin.put(url(), { enabled: true, allowedExtensions: ['pdf'], maxFileBytes: 10 ** 12, maxFiles: 999 })
    const u = (await admin.get(url())).json.uploads
    expect(u.maxFileBytes).toBeLessThanOrEqual(25 * 1024 * 1024)
    expect(u.maxFiles).toBeLessThanOrEqual(10)
  })
  it('404 for an unknown website, 400 for a body that is not an object', async () => {
    expect((await admin.get('/whoobe-one/websites/00000000-0000-0000-0000-000000000000/upload-settings')).status).toBe(404)
    expect((await admin.put(url(), [1, 2])).status).toBe(400)
  })
  it('needs settings:manage', async () => {
    for (const c of [read, write]) {
      expect([401, 403]).toContain((await c.get(url())).status)
      expect([401, 403]).toContain((await c.put(url(), { enabled: true })).status)
    }
  })
})
