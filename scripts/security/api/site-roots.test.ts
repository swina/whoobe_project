// A website's root path is the first segment of its preview address on the dashboard's host, so it must not be a name
// the host answers to itself, and the reverse proxy asks core-api (GET /site-root) which paths are websites.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { Client, clientFor } from '../lib/client'

const tag = randomBytes(3).toString('hex')
let admin: Client
let anon: Client
const created: string[] = []
const asked = (uri: string) => anon.request('GET', '/site-root', { headers: { 'x-original-uri': uri } })

beforeAll(async () => { admin = await clientFor('admin'); anon = new Client() })
afterAll(async () => { for (const id of created) await admin.delete(`/whoobe-one/websites/${id}`) })

describe('root paths', () => {
  it.each(['/whoobe-one', '/editor', '/api', '/auth', '/data-objects', '/public', '/assets', '/login', '/settings'])('%s is refused when creating a website', async (rootPath) => {
    const r = await admin.post('/whoobe-one/websites', { name: `Reserved ${tag}`, rootPath })
    expect(r.status, r.text.slice(0, 120)).toBe(400)
    expect(r.json.error).toMatch(/answers to itself/)
  })

  it('...and when changing one', async () => {
    const w = await admin.post('/whoobe-one/websites', { name: `Rename ${tag}`, rootPath: `/rename-${tag}` })
    expect(w.status).toBe(201)
    created.push(w.json.website.id)
    expect((await admin.patch(`/whoobe-one/websites/${w.json.website.id}`, { rootPath: '/whoobe-one' })).status).toBe(400)
    expect((await admin.patch(`/whoobe-one/websites/${w.json.website.id}`, { rootPath: `/renamed-${tag}` })).status).toBe(200)
  })

  it('a name that merely starts like a reserved one is fine', async () => {
    const w = await admin.post('/whoobe-one/websites', { name: `Starts ${tag}`, rootPath: `/api-${tag}` })
    expect(w.status, w.text.slice(0, 120)).toBe(201)
    created.push(w.json.website.id)
  })
})

describe('GET /site-root (asked by the reverse proxy)', () => {
  it('204 for a website\'s root and everything below it, 403 for anything else, no session needed', async () => {
    const root = `/site-${tag}`
    const w = await admin.post('/whoobe-one/websites', { name: `Site ${tag}`, rootPath: root })
    expect(w.status).toBe(201)
    created.push(w.json.website.id)
    for (const uri of [root, `${root}/`, `${root}/blog/article/x?locale=en`, root.toUpperCase()]) expect((await asked(uri)).status, uri).toBe(204)
    for (const uri of ['/', '/login', `${root}-other/x`, '/assets/index.js', '/whoobe-one/editor', '/auth/me']) expect((await asked(uri)).status, uri).toBe(403)
    expect((await anon.request('GET', '/site-root')).status, 'no URI at all').toBe(403)
  })

  it('follows a new website at once and forgets a deleted one', async () => {
    const root = `/fresh-${tag}`
    expect((await asked(`${root}/x`)).status).toBe(403)
    const w = await admin.post('/whoobe-one/websites', { name: `Fresh ${tag}`, rootPath: root })
    expect((await asked(`${root}/x`)).status, 'right after it was created').toBe(204)
    expect((await admin.delete(`/whoobe-one/websites/${w.json.website.id}`)).status).toBe(200)
    expect((await asked(`${root}/x`)).status, 'right after it was deleted').toBe(403)
  })
})
