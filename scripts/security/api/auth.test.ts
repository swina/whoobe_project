// Plan 3.1: authentication and session behaviour of core-api /auth/*.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client, clientFor } from '../lib/client'
import { ROLE_USER_PASSWORD, TARGET } from '../lib/config'
import { createTempUser, loginAs, type TempUser } from '../lib/tempuser'
import { known } from '../lib/known'

let admin: Client
const created: TempUser[] = []
const temp = async (role: 'none' | 'read' | 'write' | 'users' = 'read') => { const u = await createTempUser(admin, role); created.push(u); return u }

beforeAll(async () => { admin = await clientFor('admin') })
afterAll(async () => { for (const u of created) await admin.delete(`/auth/users/${u.id}`) })

describe('login responses', () => {
  it('does not reveal whether an e-mail exists (same status and body)', async () => {
    const u = await temp()
    const a = await new Client().post('/auth/login', { email: u.email, password: 'wrong-password-1' })
    const b = await new Client().post('/auth/login', { email: `nobody-${Date.now()}@sectest.local`, password: 'wrong-password-1' })
    expect(a.status).toBe(401)
    expect(b.status).toBe(401)
    expect(a.json).toEqual(b.json)
  })

  it('rejects non-string credentials with 400 (no 500, no stack)', async () => {
    for (const body of [{ email: { $ne: '' }, password: 'x' }, { email: 'a@b.c', password: ['x'] }, {}, { email: 1, password: 2 }]) {
      const res = await new Client().post('/auth/login', body)
      expect(res.status).toBe(400)
      expect(res.text).not.toMatch(/stack|at .*\(.*:\d+:\d+\)/i)
    }
  })

  it('does not set a session cookie on failure', async () => {
    const res = await new Client().post('/auth/login', { email: 'a@sectest.local', password: 'nope-nope-1' })
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})

describe('lockout', () => {
  it('locks an account after repeated failures, also for case variants and spoofed X-Forwarded-For', async () => {
    const u = await temp()
    for (let i = 0; i < 5; i++) {
      const r = await new Client().post('/auth/login', { email: u.email, password: `wrong-${i}-password` }, { 'x-forwarded-for': `10.0.0.${i}` })
      expect(r.status).toBe(401)
    }
    // correct password is now refused too, whatever the case or source address
    for (const email of [u.email, u.email.toUpperCase()]) {
      const r = await new Client().post('/auth/login', { email, password: u.password }, { 'x-forwarded-for': '203.0.113.9' })
      expect(r.status, `lockout bypassed with ${email}`).toBe(429)
    }
  })

  it('whitespace/unicode variants do not log in as the user', async () => {
    const u = await temp()
    for (const email of [` ${u.email} `, u.email.replace('@', '＠'), `${u.email}\u0000`]) {
      const r = await new Client().post('/auth/login', { email, password: u.password })
      expect(r.status, email).not.toBe(200)
    }
  })

  // Anyone can lock a known account (keyed on e-mail only): design trade-off, reported as F-016.
  known('F-016', 'a third party cannot lock out a known account by guessing its password', async () => {
    const u = await temp()
    for (let i = 0; i < 6; i++) await new Client().post('/auth/login', { email: u.email, password: `wrong-${i}-password` })
    const legit = await new Client().post('/auth/login', { email: u.email, password: u.password })
    expect(legit.status).toBe(200)
  })
})

describe('session lifecycle', () => {
  const me = (c: Client) => c.get('/auth/me')

  it('logout invalidates the session server-side (replaying the old cookie fails)', async () => {
    const u = await temp()
    const c = await loginAs(u)
    const oldCookie = c.cookieHeader
    expect((await me(c)).status).toBe(200)
    await c.post('/auth/logout')
    const replay = new Client()
    const res = await replay.request('GET', '/auth/me', { headers: { cookie: oldCookie } })
    expect(res.status).toBe(401)
  })

  it('deleting a user ends their sessions', async () => {
    const u = await temp()
    const c = await loginAs(u)
    expect((await admin.delete(`/auth/users/${u.id}`)).status).toBe(200)
    expect((await me(c)).status).toBe(401)
  })

  it('deactivating a user ends their sessions', async () => {
    const u = await temp()
    const c = await loginAs(u)
    expect((await admin.patch(`/auth/users/${u.id}`, { isActive: false })).status).toBe(200)
    expect((await me(c)).status).toBe(401)
  })

  // F-013: sessions survive an admin-initiated password reset (stolen sessions stay valid).
  known('F-013', 'an admin password reset ends the user\'s existing sessions', async () => {
    const u = await temp()
    const c = await loginAs(u)
    const r = await admin.post(`/auth/users/${u.id}/reset-password`, { password: `${ROLE_USER_PASSWORD}-new` })
    expect(r.status, r.text).toBe(200)
    expect((await me(c)).status).toBe(401)
  })

  it('removing a role permission takes effect on existing sessions immediately', async () => {
    const u = await temp('write')
    const c = await loginAs(u)
    const roles = (await admin.get('/auth/roles')).json.roles as any[]
    const none = roles.find((r) => r.name === 'sec-none')
    expect((await admin.patch(`/auth/users/${u.id}`, { roleIds: [none.id] })).status).toBe(200)
    expect((await c.post('/whoobe-one/pages', {})).status).toBe(403)
  })

  it('a garbage / tampered session cookie is rejected', async () => {
    for (const cookie of ['wcms_session=abc', 'wcms_session=', 'wcms_session=../../etc/passwd', `wcms_session=${'a'.repeat(5000)}`]) {
      const res = await new Client().request('GET', '/auth/me', { headers: { cookie } })
      expect(res.status, cookie.slice(0, 40)).toBe(401)
    }
  })
})

describe('session cookie flags', () => {
  const setCookie = async () => {
    const u = await temp()
    const res = await new Client().post('/auth/login', { email: u.email, password: u.password })
    return (res.headers as any).getSetCookie().find((c: string) => c.startsWith('wcms_session='))! as string
  }

  it('is HttpOnly, SameSite=Lax or stricter, Path=/ and expires', async () => {
    const c = await setCookie()
    expect(c).toMatch(/;\s*HttpOnly/i)
    expect(c).toMatch(/;\s*SameSite=(Lax|Strict)/i)
    expect(c).toMatch(/;\s*Path=\//i)
    expect(c).toMatch(/;\s*Expires=/i)
  })

  // F-012: `secure: false` is hard-coded in setSessionCookie(); behind TLS (production) it must be Secure.
  known('F-012', 'carries the Secure attribute when the deployment is HTTPS (X-Forwarded-Proto: https)', async () => {
    const u = await temp()
    const res = await new Client().post('/auth/login', { email: u.email, password: u.password }, { 'x-forwarded-proto': 'https' })
    const c = (res.headers as any).getSetCookie().find((x: string) => x.startsWith('wcms_session='))
    expect(c).toMatch(/;\s*Secure/i)
  })
})

describe('forgot / reset password', () => {
  it('answers identically for known and unknown e-mails', async () => {
    const u = await temp()
    const a = await new Client().post('/auth/forgot-password', { email: u.email })
    const b = await new Client().post('/auth/forgot-password', { email: `ghost-${Date.now()}@sectest.local` })
    expect(a.status).toBe(200)
    expect(b.status).toBe(a.status)
    expect(b.json).toEqual(a.json)
  })

  it('rate-limits repeated requests for the same e-mail', async () => {
    const email = `flood-${Date.now()}@sectest.local`
    const statuses: number[] = []
    for (let i = 0; i < 12; i++) statuses.push((await new Client().post('/auth/forgot-password', { email })).status)
    expect(statuses).toContain(429)
  })

  it('rejects an invalid or empty reset token', async () => {
    for (const token of ['', 'nope', '0'.repeat(64), 'x'.repeat(10_000)]) {
      const r = await new Client().post('/auth/reset-password', { token, password: 'Some-new-pass-123' })
      expect([400, 401, 404, 410], `token "${token.slice(0, 10)}": ${r.status}`).toContain(r.status)
    }
  })

  it('does not take the reset-link host from the Host / X-Forwarded-Host headers', async () => {
    // The link is built from WHOOBE_HOSTNAME (server side); verified indirectly: the response never echoes it.
    const u = await temp()
    const r = await new Client().post('/auth/forgot-password', { email: u.email }, { 'x-forwarded-host': 'evil.example', origin: 'https://evil.example' })
    expect(r.text).not.toContain('evil.example')
  })
})

describe('transport', () => {
  it('the target is the local throwaway stack', () => { expect(TARGET).toMatch(/localhost|127\.0\.0\.1|\.local/) })
})
