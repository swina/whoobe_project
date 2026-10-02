// Plan 3.1 / 3.15: second-factor flows (enrolment, challenge, replay, brute force, disable).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client, clientFor } from '../lib/client'
import { createTempUser, loginAs, type TempUser } from '../lib/tempuser'
import { totp } from '../lib/totp'

let admin: Client
const created: TempUser[] = []

beforeAll(async () => { admin = await clientFor('admin') })
afterAll(async () => { for (const u of created) await admin.delete(`/auth/users/${u.id}`) })

/** A fresh user with MFA enrolled; returns the secret and the recovery codes. */
async function mfaUser() {
  const u = await createTempUser(admin, 'read')
  created.push(u)
  const session = await loginAs(u)
  const setup = await session.post('/auth/mfa/setup', {})
  expect(setup.status, setup.text.slice(0, 120)).toBe(200)
  const secret: string = setup.json.secret
  const verify = await session.post('/auth/mfa/verify-setup', { code: totp(secret) })
  expect(verify.status, verify.text.slice(0, 120)).toBe(200)
  return { u, session, secret, recoveryCodes: verify.json.recoveryCodes as string[] }
}

const firstFactor = async (u: TempUser) => {
  const c = new Client()
  const r = await c.post('/auth/login', { email: u.email, password: u.password })
  return { client: c, res: r, mfaToken: r.json?.mfaToken as string }
}

describe('MFA endpoints require a session', () => {
  it('status / setup / verify-setup / disable are 401 anonymously', async () => {
    const anon = new Client()
    for (const [m, p] of [['GET', '/auth/mfa/status'], ['POST', '/auth/mfa/setup'], ['POST', '/auth/mfa/verify-setup'], ['POST', '/auth/mfa/disable']] as const) {
      expect((await anon.request(m, p, { body: m === 'GET' ? undefined : {} })).status, `${m} ${p}`).toBe(401)
    }
  })

  it('verify-setup rejects a wrong code and enrols nothing', async () => {
    const u = await createTempUser(admin, 'read'); created.push(u)
    const s = await loginAs(u)
    await s.post('/auth/mfa/setup', {})
    expect((await s.post('/auth/mfa/verify-setup', { code: '000000' })).status).toBe(401)
    expect((await s.get('/auth/mfa/status')).json.enabled).toBe(false)
  })
})

describe('second-factor challenge', () => {
  it('a password login gives no session until the code is accepted', async () => {
    const { u } = await mfaUser()
    const { client, res, mfaToken } = await firstFactor(u)
    expect(res.json.mfaRequired).toBe(true)
    expect(mfaToken).toBeTruthy()
    expect(res.headers.get('set-cookie')).toBeNull()
    expect((await client.get('/auth/me')).status).toBe(401)
  })

  it('unknown, malformed or missing challenge tokens are refused', async () => {
    const anon = new Client()
    expect((await anon.post('/auth/mfa/challenge', { code: '123456' })).status).toBe(400)
    for (const mfaToken of ['nope', 'a'.repeat(48), '../../x', 12345]) {
      const r = await anon.post('/auth/mfa/challenge', { mfaToken, code: '123456' })
      expect(r.status, String(mfaToken)).toBeGreaterThanOrEqual(400)
      expect(r.status).toBeLessThan(500)
    }
  })

  it('the right code opens a session', async () => {
    const { u, secret } = await mfaUser()
    const { client, mfaToken } = await firstFactor(u)
    const r = await client.post('/auth/mfa/challenge', { mfaToken, code: totp(secret) })
    expect(r.status, r.text.slice(0, 120)).toBe(200)
    expect((await client.get('/auth/me')).status).toBe(200)
  })

  // F-032 (fixed): a TOTP code that was already used must not log in a second time within its window.
  it('a code cannot be replayed on a second login', async () => {
    const { u, secret } = await mfaUser()
    const code = totp(secret)
    const a = await firstFactor(u)
    expect((await a.client.post('/auth/mfa/challenge', { mfaToken: a.mfaToken, code })).status).toBe(200)
    const b = await firstFactor(u)
    const replay = await b.client.post('/auth/mfa/challenge', { mfaToken: b.mfaToken, code })
    expect(replay.status).toBe(401)
  })

  it('a challenge token is single use', async () => {
    const { u, secret } = await mfaUser()
    const { mfaToken } = await firstFactor(u)
    expect((await new Client().post('/auth/mfa/challenge', { mfaToken, code: totp(secret) })).status).toBe(200)
    expect((await new Client().post('/auth/mfa/challenge', { mfaToken, code: totp(secret, Date.now() + 30_000) })).status).toBe(401)
  })

  // F-032 (fixed): the guess limit follows the account, not the challenge token.
  it('guessing is limited per account across fresh challenges', async () => {
    const { u, secret } = await mfaUser()
    let attempts = 0
    for (let round = 0; round < 3; round++) {
      const { mfaToken } = await firstFactor(u)
      for (let i = 0; i < 5; i++) { attempts++; await new Client().post('/auth/mfa/challenge', { mfaToken, code: String(100000 + attempts) }) }
    }
    expect(attempts).toBe(15)
    const { mfaToken } = await firstFactor(u)
    const r = await new Client().post('/auth/mfa/challenge', { mfaToken, code: totp(secret) })
    expect(r.status, 'right code refused while locked').toBe(429)
  })

  it('recovery codes work once', async () => {
    const { u, recoveryCodes } = await mfaUser()
    const a = await firstFactor(u)
    expect((await a.client.post('/auth/mfa/challenge', { mfaToken: a.mfaToken, recoveryCode: recoveryCodes[0] })).status).toBe(200)
    const b = await firstFactor(u)
    expect((await b.client.post('/auth/mfa/challenge', { mfaToken: b.mfaToken, recoveryCode: recoveryCodes[0] })).status).toBe(401)
  })

  it('a deactivated user cannot finish a pending challenge', async () => {
    const { u, secret } = await mfaUser()
    const { mfaToken } = await firstFactor(u)
    await admin.patch(`/auth/users/${u.id}`, { isActive: false })
    const r = await new Client().post('/auth/mfa/challenge', { mfaToken, code: totp(secret) })
    expect(r.status).toBe(401)
  })
})

describe('disabling MFA', () => {
  it('needs the password, and password guessing is limited', async () => {
    const { u, session } = await mfaUser()
    for (let i = 0; i < 5; i++) expect((await session.post('/auth/mfa/disable', { password: `wrong-${i}` })).status).toBe(401)
    const locked = await session.post('/auth/mfa/disable', { password: u.password })
    expect(locked.status, 'right password refused while locked').toBe(429)
  })

  it('the right password disables it', async () => {
    const { u, session } = await mfaUser()
    expect((await session.post('/auth/mfa/disable', { password: u.password })).status).toBe(200)
    expect((await session.get('/auth/mfa/status')).json.enabled).toBe(false)
  })
})
