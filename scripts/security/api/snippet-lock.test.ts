// Snippet lock: a locked snippet is not saved automatically (the server refuses a PATCH flagged autosave with 423),
// a manual save still works, and the lock needs objects:write.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { Client, clientFor } from '../lib/client'

const tag = randomBytes(3).toString('hex')
let admin: Client
let read: Client
let id = ''
const node = (t: string) => ({ id: 'n', blocks: [{ id: 'b', text: t }] })

beforeAll(async () => {
  admin = await clientFor('admin')
  read = await clientFor('read')
  const r = await admin.post('/whoobe-one/snippets', { name: `Lock ${tag}`, category: 'sec', node: node('v1') })
  id = r.json.snippet.id
})
afterAll(async () => { if (id) await admin.delete(`/whoobe-one/snippets/${id}`) })

describe('snippet lock', () => {
  it('a new snippet is unlocked and autosave works', async () => {
    expect((await admin.get(`/whoobe-one/snippets/${id}`)).json.snippet.locked).toBe(false)
    expect((await admin.patch(`/whoobe-one/snippets/${id}`, { name: `Lock ${tag}`, category: 'sec', node: node('auto'), autosave: true })).status).toBe(200)
  })
  it('locking is validated and needs the write permission', async () => {
    expect((await admin.put(`/whoobe-one/snippets/${id}/lock`, { locked: 'yes' })).status).toBe(400)
    expect((await admin.put('/whoobe-one/snippets/00000000-0000-0000-0000-000000000000/lock', { locked: true })).status).toBe(404)
    expect([401, 403]).toContain((await read.put(`/whoobe-one/snippets/${id}/lock`, { locked: true })).status)
  })
  it('locked: autosave is refused with 423 and changes nothing, a manual save works', async () => {
    expect((await admin.put(`/whoobe-one/snippets/${id}/lock`, { locked: true })).status).toBe(200)
    expect((await admin.get(`/whoobe-one/snippets/${id}`)).json.snippet.locked).toBe(true)
    const auto = await admin.patch(`/whoobe-one/snippets/${id}`, { name: `Lock ${tag}`, category: 'sec', node: node('should-not-save'), autosave: true })
    expect(auto.status).toBe(423)
    expect(auto.json.locked).toBe(true)
    expect(JSON.stringify((await admin.get(`/whoobe-one/snippets/${id}`)).json.snippet.node)).not.toContain('should-not-save')
    expect((await admin.patch(`/whoobe-one/snippets/${id}`, { name: `Lock ${tag}`, category: 'sec', node: node('manual') })).status).toBe(200)
  })
  it('unlocked again: autosave works', async () => {
    expect((await admin.put(`/whoobe-one/snippets/${id}/lock`, { locked: false })).status).toBe(200)
    expect((await admin.patch(`/whoobe-one/snippets/${id}`, { name: `Lock ${tag}`, category: 'sec', node: node('auto2'), autosave: true })).status).toBe(200)
  })
})
