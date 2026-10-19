// Staff sign-in with an OpenID Connect provider (docs/plans/system/oidc-login-plan.md), against a mock provider that signs real RS256 tokens:
// authorization code with PKCE, who the person is, the roles from a claim, and every way an ID token or the flow can be wrong.
import { randomBytes } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Client, clientFor } from '../lib/client'
import { TARGET } from '../lib/config'
import { createTempUser, loginAs } from '../lib/tempuser'
import { roleDbName } from '../lib/roles'
import { startMockOidc, type MockIdentity } from '../lib/mock-oidc'

const CLIENT_ID = 'whoobe-sectest'
const SECRET = `sso-secret-${randomBytes(6).toString('hex')}`
let admin: Client
let idp: Awaited<ReturnType<typeof startMockOidc>>
let roleRead = ''
let roleWrite = ''
const userIds: string[] = []
const OFF = { enabled: false, localLogin: 'all', autoProvision: false, linkByEmail: true, roleMapping: [], defaultRoleIds: [], roleClaim: null }

const sub = () => `sub-${randomBytes(4).toString('hex')}`
const mail = () => `sso-${randomBytes(4).toString('hex')}@idp.test`

async function configure(over: Record<string, unknown> = {}) {
  const r = await admin.put('/oidc-settings', {
    enabled: true, label: 'Sectest SSO', issuer: idp.issuer, clientId: CLIENT_ID, clientSecret: SECRET, redirectBaseUrl: TARGET,
    roleClaim: 'groups', roleMapping: [{ value: 'whoobe-editors', roleId: roleWrite }, { value: 'whoobe-readers', roleId: roleRead }],
    defaultRoleIds: [], autoProvision: true, linkByEmail: true, localLogin: 'all', ...over,
  })
  expect(r.status, r.text.slice(0, 200)).toBe(200)
}

/** The whole dance without a browser: start, let the provider answer, come back with the cookie of the first step. */
async function signIn(identity: MockIdentity, client = new Client()) {
  idp.state.login = identity
  const start = await client.get('/auth/oidc/login')
  expect(start.status, start.text.slice(0, 120)).toBe(302)
  const authorize = await fetch(start.headers.get('location')!, { redirect: 'manual' })
  const back = new URL(authorize.headers.get('location')!)
  const cb = await client.get(back.pathname + back.search)
  const location = cb.headers.get('location') ?? ''
  const error = new URL(location, TARGET).searchParams.get('sso_error')
  return { client, cb, location, error, back }
}

beforeAll(async () => {
  admin = await clientFor('admin')
  idp = await startMockOidc({ clientId: CLIENT_ID, clientSecret: SECRET })
  const roles = (await admin.get('/auth/roles')).json.roles as { id: string; name: string }[]
  roleRead = roles.find((r) => r.name === roleDbName('read'))!.id
  roleWrite = roles.find((r) => r.name === roleDbName('write'))!.id
})
afterAll(async () => {
  await admin.put('/oidc-settings', OFF)
  for (const id of userIds) await admin.delete(`/auth/users/${id}`)
  await idp.close()
})
beforeEach(() => { idp.state.tamper = undefined; idp.state.denyAuthorize = false })

async function userByEmail(email: string) {
  const list = (await admin.get('/auth/users')).json.users as { id: string; email: string; roleIds: string[]; isActive: boolean }[]
  const u = list.find((x) => x.email === email)
  if (u) userIds.push(u.id)
  return u
}

describe('single sign-on settings', () => {
  it('are for settings managers only', async () => {
    expect((await new Client().get('/oidc-settings')).status).toBe(401)
    const reader = await createTempUser(admin, 'read'); userIds.push(reader.id)
    const s = await loginAs(reader)
    expect((await s.get('/oidc-settings')).status).toBe(403)
    expect((await s.put('/oidc-settings', OFF)).status).toBe(403)
    expect((await s.post('/oidc-settings/test', {})).status).toBe(403)
  })

  it('refuse bad input and a switch-on without the address, client and redirect', async () => {
    await admin.put('/oidc-settings', { ...OFF, issuer: null, clientId: null, redirectBaseUrl: null })
    expect((await admin.put('/oidc-settings', { enabled: true })).status).toBe(400)
    for (const body of [
      { issuer: 'ftp://x' }, { issuer: 'https://user:pw@x.test' }, { scopes: 'email profile' }, { roleClaim: 'bad claim!' },
      { localLogin: 'none' }, { roleMapping: [{ value: 'x', roleId: 'nope' }] }, { defaultRoleIds: ['00000000-0000-4000-8000-000000000000'] },
      { roleClaim: null, roleMapping: [{ value: 'x', roleId: roleRead }] },
    ]) expect((await admin.put('/oidc-settings', body)).status, JSON.stringify(body)).toBe(400)
  })

  it('never show the client secret, and the audit row says "changed" without the value', async () => {
    await configure()
    const got = await admin.get('/oidc-settings')
    expect(got.json.hasClientSecret).toBe(true)
    expect(got.text).not.toContain(SECRET)
    const log = await admin.get('/audit-log?action=setting.oidc_update&limit=1')
    expect(log.status).toBe(200)
    expect(JSON.stringify(log.json)).not.toContain(SECRET)
    expect(JSON.stringify(log.json.entries[0].after)).toContain('"clientSecret":"changed"')
    expect(log.json.entries[0].after.issuer).toBe(idp.issuer)
  })

  it('can be tried: the discovery document is read, and a wrong address is reported', async () => {
    await configure()
    const ok = await admin.post('/oidc-settings/test', {})
    expect(ok.json).toMatchObject({ ok: true, authorizationEndpoint: `${idp.issuer}/authorize`, tokenEndpoint: `${idp.issuer}/token` })
    await admin.put('/oidc-settings', { issuer: `${idp.issuer}/nowhere` })
    const bad = await admin.post('/oidc-settings/test', {})
    expect(bad.json.ok).toBe(false)
  })
})

describe('the sign-in screen', () => {
  it('learns whether to show the button, and nothing else about the provider', async () => {
    await admin.put('/oidc-settings', OFF)
    expect((await new Client().get('/auth/oidc/config')).json).toMatchObject({ enabled: false })
    expect((await new Client().get('/auth/oidc/login')).status).toBe(404)
    await configure()
    const on = await new Client().get('/auth/oidc/config')
    expect(on.json).toEqual({ enabled: true, label: 'Sectest SSO', localLogin: 'all' })
    expect(on.text).not.toContain(idp.issuer)
  })
})

describe('authorization code with PKCE', () => {
  it('sends the person to the provider with state, nonce and an S256 challenge, and keeps the verifier to itself', async () => {
    await configure()
    const start = await new Client().get('/auth/oidc/login')
    const u = new URL(start.headers.get('location')!)
    expect(u.origin).toBe(idp.issuer)
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      response_type: 'code', client_id: CLIENT_ID, redirect_uri: `${TARGET}/auth/oidc/callback`, scope: 'openid email profile', code_challenge_method: 'S256',
    })
    expect(u.searchParams.get('state')!.length).toBeGreaterThan(20)
    expect(u.searchParams.get('nonce')!.length).toBeGreaterThan(20)
    expect(u.searchParams.get('code_challenge')!.length).toBeGreaterThan(30)
    expect(start.headers.get('set-cookie')).toMatch(/wcms_oidc=.+HttpOnly/i)
    expect(start.headers.get('set-cookie')).not.toContain(u.searchParams.get('code_challenge')!)
  })

  it('signs a new person in: the account is created, the roles come from the claim, the session works', async () => {
    await configure()
    const email = mail()
    const r = await signIn({ sub: sub(), email, email_verified: true, name: 'Ada Lovelace', groups: ['whoobe-editors', 'other'] })
    expect(r.error).toBeNull()
    expect(r.cb.status).toBe(302)
    expect(r.location).toBe(`${TARGET}/`)
    expect(r.cb.headers.get('set-cookie')).toMatch(/wcms_session=/)
    const me = await r.client.get('/auth/me')
    expect(me.status).toBe(200)
    expect(me.json).toMatchObject({ email, displayName: 'Ada Lovelace' })
    expect(me.json.permissions).toContain('objects:write')
    const u = await userByEmail(email)
    expect(u?.roleIds).toEqual([roleWrite])
    // the provider got the code once, with the verifier and the client secret by HTTP Basic, and our tokens-not-kept promise holds
    const last = idp.state.tokenRequests.at(-1)!
    expect(last.body).toMatchObject({ grant_type: 'authorization_code' })
    expect(last.body.code_verifier.length).toBeGreaterThan(40)
    expect(last.authorization).toMatch(/^Basic /)
    expect(last.body.client_secret).toBeUndefined()
    // the person cannot use the account's password (there is none to know), only the provider
    const pw = await new Client().post('/auth/login', { email, password: 'whatever-123456' })
    expect(pw.status).toBe(401)
  })

  it('knows the person again by (issuer, subject): the e-mail may change at the provider, the account stays', async () => {
    await configure()
    const s = sub()
    const first = mail()
    await signIn({ sub: s, email: first, email_verified: true, groups: ['whoobe-readers'] })
    const before = await userByEmail(first)
    const again = await signIn({ sub: s, email: mail(), email_verified: true, groups: ['whoobe-readers'] })
    expect(again.error).toBeNull()
    expect((await again.client.get('/auth/me')).json.email).toBe(first)
    expect(before?.id).toBeTruthy()
  })
})

describe('roles from the claim', () => {
  it('follow the claim at every sign-in: granted when present, taken away when not, the ones given by hand left alone', async () => {
    await configure()
    const s = sub()
    const email = mail()
    await signIn({ sub: s, email, email_verified: true, groups: ['whoobe-editors'] })
    const u = (await userByEmail(email))!
    expect(u.roleIds).toEqual([roleWrite])
    // an administrator gives a role by hand (not in the mapping's managed set? read IS in it - use the third role)
    const extra = (await admin.get('/auth/roles')).json.roles.find((r: any) => r.name === roleDbName('none')).id
    const patch = await admin.request('PATCH', `/auth/users/${u.id}`, { body: { roleIds: [roleWrite, extra] } })
    expect(patch.status).toBe(200)
    // the claim now says readers, not editors
    const r = await signIn({ sub: s, email, email_verified: true, groups: ['whoobe-readers'] })
    expect(r.error).toBeNull()
    const after = (await userByEmail(email))!
    expect([...after.roleIds].sort()).toEqual([roleRead, extra].sort())   // write gone, read in, the hand-given one kept
    expect((await r.client.get('/auth/me')).json.permissions).not.toContain('objects:write')
  })

  it('refuse a person who would have no role at all, and do not even create the account', async () => {
    await configure()
    const email = mail()
    const r = await signIn({ sub: sub(), email, email_verified: true, groups: ['nobody-knows-this'] })
    expect(r.error).toBe('no_access')
    expect(r.cb.headers.get('set-cookie') ?? '').not.toMatch(/wcms_session=[^;]/)
    expect(await userByEmail(email)).toBeUndefined()
  })

  it('give a new person the default roles when the claim matches nothing', async () => {
    await configure({ defaultRoleIds: [roleRead] })
    const email = mail()
    const r = await signIn({ sub: sub(), email, email_verified: true, groups: [] })
    expect(r.error).toBeNull()
    expect((await userByEmail(email))?.roleIds).toEqual([roleRead])
  })

  it('end the access of someone whose only role was taken away at the provider', async () => {
    await configure()
    const s = sub()
    const email = mail()
    await signIn({ sub: s, email, email_verified: true, groups: ['whoobe-editors'] })
    const r = await signIn({ sub: s, email, email_verified: true, groups: [] })
    expect(r.error).toBe('no_access')
    expect((await userByEmail(email))?.roleIds).toEqual([])
  })
})

describe('who the person is', () => {
  it('links to a local account of the same e-mail when the provider verified it', async () => {
    await configure()
    const local = await createTempUser(admin, 'read'); userIds.push(local.id)
    const r = await signIn({ sub: sub(), email: local.email, email_verified: true, groups: ['whoobe-readers'] })
    expect(r.error).toBeNull()
    expect((await r.client.get('/auth/me')).json.id).toBe(local.id)
    const log = await admin.get(`/audit-log?action=user.sso_link&targetId=${local.id}`)
    expect(log.json.entries.length).toBeGreaterThan(0)
    expect(log.json.entries[0].actorType).toBe('system')
  })

  it('never links or creates on an e-mail the provider has not verified', async () => {
    await configure()
    const local = await createTempUser(admin, 'read'); userIds.push(local.id)
    expect((await signIn({ sub: sub(), email: local.email, email_verified: false, groups: ['whoobe-readers'] })).error).toBe('email_not_verified')
    const fresh = mail()
    expect((await signIn({ sub: sub(), email: fresh, groups: ['whoobe-readers'] })).error).toBe('email_not_verified')
    expect(await userByEmail(fresh)).toBeUndefined()
  })

  it('does not link when linking is switched off, and does not create when provisioning is', async () => {
    await configure({ linkByEmail: false })
    const local = await createTempUser(admin, 'read'); userIds.push(local.id)
    expect((await signIn({ sub: sub(), email: local.email, email_verified: true, groups: ['whoobe-readers'] })).error).toBe('no_account')
    await configure({ autoProvision: false })
    const fresh = mail()
    expect((await signIn({ sub: sub(), email: fresh, email_verified: true, groups: ['whoobe-readers'] })).error).toBe('no_account')
    expect(await userByEmail(fresh)).toBeUndefined()
  })

  it('writes the creation of an account to the audit log', async () => {
    await configure()
    const email = mail()
    await signIn({ sub: sub(), email, email_verified: true, groups: ['whoobe-readers'] })
    const u = (await userByEmail(email))!
    const log = await admin.get(`/audit-log?action=user.sso_provision&targetId=${u.id}`)
    expect(log.json.entries[0]).toMatchObject({ actorType: 'system', targetLabel: email })
  })
})

describe('a deactivated user', () => {
  it('cannot start a new session, here or at the provider', async () => {
    await configure()
    const s = sub()
    const email = mail()
    await signIn({ sub: s, email, email_verified: true, groups: ['whoobe-readers'] })
    const u = (await userByEmail(email))!
    expect((await admin.request('PATCH', `/auth/users/${u.id}`, { body: { isActive: false } })).status).toBe(200)
    const here = await signIn({ sub: s, email, email_verified: true, groups: ['whoobe-readers'] })
    expect(here.error).toBe('inactive')
    expect(here.cb.headers.get('set-cookie') ?? '').not.toMatch(/wcms_session=[^;]/)
    await admin.request('PATCH', `/auth/users/${u.id}`, { body: { isActive: true } })
    // at the provider: it refuses to authenticate, no code is ever issued
    idp.state.denyAuthorize = true
    const start = await new Client().get('/auth/oidc/login')
    const authorize = await fetch(start.headers.get('location')!, { redirect: 'manual' })
    const back = new URL(authorize.headers.get('location')!)
    const c = new Client()
    const cb = await (async () => { const st = await c.get('/auth/oidc/login'); const a = await fetch(st.headers.get('location')!, { redirect: 'manual' }); const b = new URL(a.headers.get('location')!); return c.get(b.pathname + b.search) })()
    expect(new URL(cb.headers.get('location')!, TARGET).searchParams.get('sso_error')).toBe('provider_error')
    expect(back.searchParams.get('error')).toBe('access_denied')
  })
})

describe('a forged or wrong ID token', () => {
  for (const [tamper, want] of [
    ['bad-signature', 'invalid_token'], ['wrong-audience', 'invalid_token'], ['wrong-issuer', 'invalid_token'], ['expired', 'invalid_token'],
    ['wrong-nonce', 'invalid_token'], ['none-alg', 'invalid_token'], ['hs256', 'invalid_token'], ['wrong-azp', 'invalid_token'], ['no-id-token', 'token_exchange'],
  ] as const) {
    it(`${tamper}: no session, no account`, async () => {
      await configure()
      idp.state.tamper = tamper
      const email = mail()
      const r = await signIn({ sub: sub(), email, email_verified: true, groups: ['whoobe-editors'] })
      expect(r.error).toBe(want)
      expect(r.cb.headers.get('set-cookie') ?? '').not.toMatch(/wcms_session=[^;]/)
      expect((await r.client.get('/auth/me')).status).toBe(401)
      expect(await userByEmail(email)).toBeUndefined()
    })
  }
})

describe('the flow itself', () => {
  it('refuses a callback that was already used, one from another browser, an unknown state, an error and an empty call', async () => {
    await configure()
    const used = await signIn({ sub: sub(), email: mail(), email_verified: true, groups: ['whoobe-readers'] })
    expect(used.error).toBeNull()
    // the same callback address again, with the same cookie jar: the state is spent
    const replay = await used.client.get(used.back.pathname + used.back.search)
    expect(new URL(replay.headers.get('location')!, TARGET).searchParams.get('sso_error')).toBe('invalid_state')

    // started in one browser, finished in another (login CSRF / a planted code)
    idp.state.login = { sub: sub(), email: mail(), email_verified: true, groups: ['whoobe-readers'] }
    const victim = new Client()
    const start = await victim.get('/auth/oidc/login')
    const a = await fetch(start.headers.get('location')!, { redirect: 'manual' })
    const back = new URL(a.headers.get('location')!)
    const attacker = new Client()
    const planted = await attacker.get(back.pathname + back.search)
    expect(new URL(planted.headers.get('location')!, TARGET).searchParams.get('sso_error')).toBe('invalid_state')
    expect((await attacker.get('/auth/me')).status).toBe(401)

    const anon = new Client()
    for (const q of ['?code=abc&state=nope', '?error=access_denied&state=nope', '', '?state=' + 'a'.repeat(5000)]) {
      const r = await anon.get(`/auth/oidc/callback${q}`)
      expect(r.status, q).toBe(302)
      expect(new URL(r.headers.get('location')!, TARGET).searchParams.get('sso_error'), q).toBe('invalid_state')
    }
  })

  it('always lands on the configured address: nothing in the request chooses where the browser goes', async () => {
    await configure()
    const start = await new Client().get('/auth/oidc/login?redirect=https://evil.example&return_to=https://evil.example')
    expect(new URL(start.headers.get('location')!).origin).toBe(idp.issuer)
    const r = await signIn({ sub: sub(), email: mail(), email_verified: true, groups: ['whoobe-readers'] })
    expect(r.location).toBe(`${TARGET}/`)
  })
})

describe('the password form next to single sign-on', () => {
  it('"admins" keeps the break-glass for those who manage users and sends everybody else to the provider', async () => {
    await configure({ localLogin: 'admins' })
    const reader = await createTempUser(admin, 'read'); userIds.push(reader.id)
    const denied = await new Client().post('/auth/login', { email: reader.email, password: reader.password })
    expect(denied.status).toBe(403)
    expect(denied.headers.get('set-cookie') ?? '').not.toMatch(/wcms_session=[^;]/)
    expect((await new Client().get('/auth/oidc/config')).json.localLogin).toBe('admins')
    // the administrator can still sign in with the password
    const adminAgain = await clientFor('admin')
    expect((await adminAgain.get('/auth/me')).status).toBe(200)
    await configure({ localLogin: 'all' })
    expect((await new Client().post('/auth/login', { email: reader.email, password: reader.password })).status).toBe(200)
  })
})
