// Mandatory second factor and password policy (docs/plans/system/mandatory-2fa-plan.md): the settings, the forced enrolment at login
// (no session until the factor is proven), the refusal to switch it off, and the password rules where a password is set.
import { randomBytes } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client, clientFor } from '../lib/client'
import { ROLE_USER_PASSWORD } from '../lib/config'
import { createTempUser, loginAs, type TempUser } from '../lib/tempuser'
import { totp } from '../lib/totp'

let admin: Client
const userIds: string[] = []
const roleIds: string[] = []
const DEFAULTS = { requireMfaRoleIds: [], passwordMinLength: 8, passwordRequireClasses: false }

beforeAll(async () => { admin = await clientFor('admin') })
afterAll(async () => {
  await admin.put('/security-settings', DEFAULTS)
  for (const id of userIds) await admin.delete(`/auth/users/${id}`)
  for (const id of roleIds) await admin.delete(`/auth/roles/${id}`)
})

/** A role of its own (no permissions) and a user holding it: switching the requirement on for that role touches nobody else. */
async function userWithOwnRole() {
  const role = await admin.post('/auth/roles', { name: `sectest-mfa-${randomBytes(4).toString('hex')}`, permissionKeys: [] })
  expect(role.status, role.text.slice(0, 120)).toBe(201)
  const roleId: string = role.json.role.id
  roleIds.push(roleId)
  const email = `req-${randomBytes(4).toString('hex')}@sectest.local`
  const res = await admin.post('/auth/users', { email, password: ROLE_USER_PASSWORD, displayName: 'req', roleIds: [roleId] })
  expect(res.status, res.text.slice(0, 120)).toBe(201)
  userIds.push(res.json.user.id)
  const user: TempUser = { id: res.json.user.id, email, password: ROLE_USER_PASSWORD }
  return { roleId, user }
}

const firstFactor = async (u: TempUser) => {
  const c = new Client()
  const r = await c.post('/auth/login', { email: u.email, password: u.password })
  return { client: c, res: r }
}

describe('security settings', () => {
  it('are for settings managers only', async () => {
    expect((await new Client().get('/security-settings')).status).toBe(401)
    const reader = await createTempUser(admin, 'read'); userIds.push(reader.id)
    const s = await loginAs(reader)
    expect((await s.get('/security-settings')).status).toBe(403)
    expect((await s.put('/security-settings', DEFAULTS)).status).toBe(403)
  })

  it('answer the defaults, and refuse bad input without changing anything', async () => {
    await admin.put('/security-settings', DEFAULTS)
    const got = await admin.get('/security-settings')
    expect(got.status).toBe(200)
    expect(got.json.requireMfaRoleIds).toEqual([])
    expect(got.json.passwordPolicy).toEqual({ minLength: 8, requireClasses: false })
    for (const body of [{ passwordMinLength: 7 }, { passwordMinLength: 200 }, { passwordRequireClasses: 'yes' }, { requireMfaRoleIds: 'x' }, { requireMfaRoleIds: ['00000000-0000-4000-8000-000000000000'] }]) {
      expect((await admin.put('/security-settings', body)).status, JSON.stringify(body)).toBe(400)
    }
    expect((await admin.get('/security-settings')).json.passwordPolicy.minLength).toBe(8)
  })

  it('the change is written to the audit log', async () => {
    const r = await admin.put('/security-settings', { passwordMinLength: 10 })
    expect(r.status).toBe(200)
    const log = await admin.get('/audit-log?action=setting.security_update&limit=1')
    expect(log.status).toBe(200)
    // the key says "password": a snapshot field named like that would be hidden by the audit log's safety net, so the spec calls it policyMinLength
    expect(log.json.entries?.[0]?.after?.policyMinLength).toBe(10)
    await admin.put('/security-settings', DEFAULTS)
  })
})

describe('forced enrolment at login', () => {
  it('a user of a required role gets no session until the second factor is proven', async () => {
    const { roleId, user } = await userWithOwnRole()
    expect((await admin.put('/security-settings', { requireMfaRoleIds: [roleId] })).status).toBe(200)

    const { client, res } = await firstFactor(user)
    expect(res.status).toBe(200)
    expect(res.json.mfaEnrolmentRequired).toBe(true)
    expect(res.json.enrolToken).toBeTruthy()
    expect(res.headers.get('set-cookie')).toBeNull()
    expect((await client.get('/auth/me')).status).toBe(401)
    const enrolToken: string = res.json.enrolToken

    const setup = await client.post('/auth/mfa/enrol/setup', { enrolToken })
    expect(setup.status, setup.text.slice(0, 120)).toBe(200)
    expect(setup.json.secret).toBeTruthy()
    expect(setup.json.qrCodeDataUrl).toMatch(/^data:image\//)

    const wrong = await client.post('/auth/mfa/enrol/verify', { enrolToken, code: '000000' })
    expect(wrong.status).toBe(401)
    expect(wrong.headers.get('set-cookie')).toBeNull()
    expect((await client.get('/auth/me')).status).toBe(401)

    const ok = await client.post('/auth/mfa/enrol/verify', { enrolToken, code: totp(setup.json.secret) })
    expect(ok.status, ok.text.slice(0, 120)).toBe(200)
    expect(ok.json.recoveryCodes).toHaveLength(8)
    expect((await client.get('/auth/me')).status).toBe(200)
    expect((await client.get('/auth/mfa/status')).json.enabled).toBe(true)

    // the token is spent, and the next login is the ordinary second-factor challenge
    expect((await client.post('/auth/mfa/enrol/setup', { enrolToken })).status).toBe(401)
    const again = await firstFactor(user)
    expect(again.res.json.mfaRequired).toBe(true)

    // the requirement cannot be undone by the user
    const disable = await client.post('/auth/mfa/disable', { password: user.password })
    expect(disable.status).toBe(409)
    expect((await client.get('/auth/mfa/status')).json.enabled).toBe(true)
  })

  it('a user of another role is not asked, and unknown tokens are refused', async () => {
    const { roleId } = await userWithOwnRole()
    await admin.put('/security-settings', { requireMfaRoleIds: [roleId] })
    const other = await createTempUser(admin, 'read'); userIds.push(other.id)
    const { res } = await firstFactor(other)
    expect(res.json.mfaEnrolmentRequired).toBeUndefined()
    expect(res.headers.get('set-cookie')).toBeTruthy()

    const anon = new Client()
    for (const enrolToken of [undefined, 'nope', 'a'.repeat(48), 12345]) {
      expect((await anon.post('/auth/mfa/enrol/setup', { enrolToken })).status, String(enrolToken)).toBe(401)
      expect((await anon.post('/auth/mfa/enrol/verify', { enrolToken, code: '123456' })).status, String(enrolToken)).toBe(401)
    }
  })

  it('the enrolment token gives up after five wrong codes', async () => {
    const { roleId, user } = await userWithOwnRole()
    await admin.put('/security-settings', { requireMfaRoleIds: [roleId] })
    const { client, res } = await firstFactor(user)
    const enrolToken: string = res.json.enrolToken
    const setup = await client.post('/auth/mfa/enrol/setup', { enrolToken })
    for (let i = 0; i < 5; i++) expect((await client.post('/auth/mfa/enrol/verify', { enrolToken, code: '000000' })).status).toBe(401)
    expect((await client.post('/auth/mfa/enrol/verify', { enrolToken, code: totp(setup.json.secret) })).status).toBe(401)
    expect((await client.get('/auth/me')).status).toBe(401)
  })

  it('a user who switches the setting off is let in again', async () => {
    const { roleId, user } = await userWithOwnRole()
    await admin.put('/security-settings', { requireMfaRoleIds: [roleId] })
    expect((await firstFactor(user)).res.json.mfaEnrolmentRequired).toBe(true)
    await admin.put('/security-settings', { requireMfaRoleIds: [] })
    expect((await firstFactor(user)).res.json.mfaEnrolmentRequired).toBeUndefined()
  })
})

describe('password policy', () => {
  it('is public and follows the settings', async () => {
    await admin.put('/security-settings', { passwordMinLength: 12, passwordRequireClasses: true })
    const r = await new Client().get('/auth/password-policy')
    expect(r.status).toBe(200)
    expect(r.json).toEqual({ minLength: 12, requireClasses: true })
  })

  it('is applied when an administrator creates a user, with the broken rule named', async () => {
    const { roleId } = await userWithOwnRole()
    await admin.put('/security-settings', { passwordMinLength: 12, passwordRequireClasses: true })
    const create = (password: string, email = `pol-${randomBytes(4).toString('hex')}@sectest.local`) =>
      admin.post('/auth/users', { email, password, displayName: 'p', roleIds: [roleId] })
    const short = await create('Short1!')
    expect(short.status).toBe(400)
    expect(short.json.error).toMatch(/at least 12/)
    const flat = await create('alllowercaseletters')
    expect(flat.status).toBe(400)
    expect(flat.json.error).toMatch(/three of/)
    const email = `pol-${randomBytes(4).toString('hex')}@sectest.local`
    expect((await create(email, email)).status).toBe(400)
    const fine = await create('Long-enough-1')
    expect(fine.status, fine.text.slice(0, 120)).toBe(201)
    userIds.push(fine.json.user.id)
  })

  it('is applied when a password is reset', async () => {
    const { user } = await userWithOwnRole()
    await admin.put('/security-settings', { passwordMinLength: 12, passwordRequireClasses: false })
    const token = (await admin.post(`/auth/users/${user.id}/reset-password`, {})).json.token as string
    const anon = new Client()
    const short = await anon.post('/auth/reset-password', { token, password: 'twelve-less' })
    expect(short.status).toBe(400)
    expect(short.json.error).toMatch(/at least 12/)
    expect((await anon.post('/auth/reset-password', { token, password: 'twelve-chars-ok' })).status).toBe(200)
  })

  it('does not touch a login: an existing short password still signs in', async () => {
    const { user } = await userWithOwnRole()
    await admin.put('/security-settings', { passwordMinLength: 64 })
    const { res } = await firstFactor(user)
    expect(res.status).toBe(200)
  })
})
