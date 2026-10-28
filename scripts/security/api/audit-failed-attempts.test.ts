// Failed attempts in the audit log (docs/plans/system/release-0.4-plan.md 3.1): refused sign-in, wrong second-factor code, refused permission,
// refused API client. One row each, no secret, at most 10 a minute per address and action. The stack runs with TRUST_PROXY=1, so
// X-Forwarded-For plays the client address: each test uses addresses of its own and is not throttled by the others.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { Client, clientFor } from '../lib/client'
import { GATEWAY_TARGET } from '../lib/config'
import { createTempUser, loginAs, type TempUser } from '../lib/tempuser'

const tag = randomBytes(4).toString('hex')
const net = `10.${(parseInt(tag.slice(0, 2), 16) % 200) + 20}.${parseInt(tag.slice(2, 4), 16)}`
let n = 0
const freshIp = () => `${net}.${++n}`
const since = new Date(Date.now() - 5_000).toISOString()
const cleanup: (() => Promise<unknown>)[] = []
let admin: Client

beforeAll(async () => { admin = await clientFor('admin') })
afterAll(async () => { for (const f of cleanup.reverse()) await f().catch(() => undefined) })

const temp = async (role: 'read' | 'write' = 'read'): Promise<TempUser> => {
  const u = await createTempUser(admin, role)
  cleanup.push(() => admin.delete(`/auth/users/${u.id}`))
  return u
}
const rows = async (action: string) => {
  const r = await admin.get(`/audit-log?${new URLSearchParams({ action, from: since, limit: '2000' })}`)
  expect(r.status, r.text.slice(0, 200)).toBe(200)
  return r.json.entries as any[]
}
const byRequest = async (action: string, rid: string) => (await rows(action)).find((e) => e.requestId === rid)
const rid = (what: string) => `sec-fail-${tag}-${what}`

describe('sign-in', () => {
  it('a wrong password: the account as target, the reason, the address, never the password', async () => {
    const u = await temp()
    const ip = freshIp()
    const pw = `Wrong-${tag}-pw`
    const r = await new Client().post('/auth/login', { email: u.email, password: pw }, { 'x-forwarded-for': ip, 'X-Request-Id': rid('pw') })
    expect(r.status).toBe(401)
    const row = await byRequest('auth.login_failed', rid('pw'))
    expect(row).toMatchObject({ actorType: 'anonymous', ip, targetType: 'user', targetId: u.id, targetLabel: u.email, after: { reason: 'wrong_password' } })
    expect(JSON.stringify(row)).not.toContain(pw)
  })

  it('an unknown account: no target, and the e-mail typed is not written', async () => {
    const typed = `nobody-${tag}@sectest.local`
    const r = await new Client().post('/auth/login', { email: typed, password: 'x' }, { 'x-forwarded-for': freshIp(), 'X-Request-Id': rid('unknown') })
    expect(r.status).toBe(401)
    const row = await byRequest('auth.login_failed', rid('unknown'))
    expect(row).toMatchObject({ actorType: 'anonymous', targetId: null, after: { reason: 'unknown_user' } })
    expect(JSON.stringify(row)).not.toContain(typed)
  })

  it('an inactive account', async () => {
    const u = await temp()
    expect((await admin.patch(`/auth/users/${u.id}`, { isActive: false })).status).toBe(200)
    await new Client().post('/auth/login', { email: u.email, password: u.password }, { 'x-forwarded-for': freshIp(), 'X-Request-Id': rid('inactive') })
    expect((await byRequest('auth.login_failed', rid('inactive')))?.after).toEqual({ reason: 'inactive' })
  })
})

describe('second factor', () => {
  it('a wrong code at setup and a wrong password to turn it off: the signed-in user as actor, never the code or the password', async () => {
    const u = await temp()
    const c = await loginAs(u)
    expect((await c.post('/auth/mfa/setup', {})).status).toBe(200)
    const r1 = await c.post('/auth/mfa/verify-setup', { code: '000000' }, { 'x-forwarded-for': freshIp(), 'X-Request-Id': rid('setup') })
    expect(r1.status).toBe(401)
    const setup = await byRequest('auth.mfa_failed', rid('setup'))
    expect(setup).toMatchObject({ actorType: 'user', actorId: u.id, targetId: u.id, after: { step: 'setup', reason: 'wrong_code' } })
    expect(JSON.stringify(setup)).not.toContain('000000')

    const pw = `Wrong-${tag}-off`
    const r2 = await c.post('/auth/mfa/disable', { password: pw }, { 'x-forwarded-for': freshIp(), 'X-Request-Id': rid('disable') })
    expect(r2.status).toBe(401)
    const off = await byRequest('auth.mfa_failed', rid('disable'))
    expect(off?.after).toEqual({ step: 'disable', reason: 'wrong_password' })
    expect(JSON.stringify(off)).not.toContain(pw)
  })
})

describe('permission', () => {
  it('a signed-in user without the permission: the user, the route pattern and the permission', async () => {
    const u = await temp('read')
    const c = await loginAs(u)
    const r = await c.request('DELETE', `/auth/users/${u.id}`, { headers: { 'x-forwarded-for': freshIp(), 'X-Request-Id': rid('perm') } })
    expect(r.status).toBe(403)
    const row = await byRequest('access.permission_refused', rid('perm'))
    expect(row).toMatchObject({ actorType: 'user', actorId: u.id, actorLabel: u.email, after: { method: 'DELETE', route: '/auth/users/:id', permission: 'users:manage' } })
  })

  it('no session is not a refused permission: no row', async () => {
    const r = await new Client().request('DELETE', '/auth/users/00000000-0000-0000-0000-000000000000', { headers: { 'x-forwarded-for': freshIp(), 'X-Request-Id': rid('nosession') } })
    expect(r.status).toBe(401)
    expect(await byRequest('access.permission_refused', rid('nosession'))).toBeUndefined()
  })
})

describe('API client', () => {
  it('an unknown key at the gateway: the reason and the kind of credential, never the key', async () => {
    const key = `wbk_${tag}_notakey_${randomBytes(12).toString('hex')}`
    const r = await new Client(GATEWAY_TARGET).get('/client/v1/me', { Authorization: `Bearer ${key}`, 'x-forwarded-for': freshIp(), 'X-Request-Id': rid('client') })
    expect(r.status).toBe(401)
    const row = await byRequest('api_client.refused', rid('client'))
    expect(row).toMatchObject({ actorType: 'anonymous', after: { presented: 'key' } })
    expect(['unknown', 'malformed']).toContain(row.after.reason)
    expect(JSON.stringify(row)).not.toContain(key)
  })
})

describe('throttle', () => {
  it('at most 10 rows a minute per address and action', async () => {
    const ip = freshIp()
    const anon = new Client()
    for (let i = 0; i < 14; i++) {
      await anon.post('/auth/login', { email: `nobody-${tag}-${i}@sectest.local`, password: 'x' }, { 'x-forwarded-for': ip, 'X-Request-Id': rid(`flood-${i}`) })
    }
    const mine = (await rows('auth.login_failed')).filter((e) => e.ip === ip)
    expect(mine).toHaveLength(10)
  })
})
