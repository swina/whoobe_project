// Single sign-on against a REAL Keycloak (docs/plans/system/oidc-login-plan.md, step 6). Opt-in: start it with keycloak/run.sh up and pass
//   KEYCLOAK_ISSUER=http://<gateway of the test network>:8180/realms/whoobe-test
// It checks what a mock cannot: that an actual provider's discovery, authorization-code + PKCE with a client secret, ID token (RS256, group
// membership mapper) and consent-free login page work with core-api, that the groups of a person become roles, and that a person
// deactivated at the provider cannot start a new session.
import { test, expect, ADMIN_URL, TARGET } from './fixtures'
import type { Browser } from '@playwright/test'

const ISSUER = process.env.KEYCLOAK_ISSUER ?? ''
const KC = ISSUER.replace(/\/realms\/.*$/, '')
const OFF = { clearClientSecret: true, enabled: false, localLogin: 'all', autoProvision: false, roleMapping: [], defaultRoleIds: [], roleClaim: null, dashboardUrl: null }

test.skip(!ISSUER, 'set KEYCLOAK_ISSUER (see scripts/security/keycloak/run.sh) to run this')
test.describe.configure({ mode: 'serial' })

async function admin(path: string, init: RequestInit = {}) {
  const t = await (await fetch(`${KC}/realms/master/protocol/openid-connect/token`, {
    method: 'POST', body: new URLSearchParams({ client_id: 'admin-cli', grant_type: 'password', username: 'admin', password: 'admin' }),
  })).json() as { access_token: string }
  return fetch(`${KC}/admin/realms/whoobe-test${path}`, { ...init, headers: { authorization: `Bearer ${t.access_token}`, 'content-type': 'application/json', ...(init.headers ?? {}) } })
}
const kcUser = async (username: string) => ((await (await admin(`/users?username=${username}&exact=true`)).json()) as { id: string }[])[0]
const kcGroup = async (name: string) => ((await (await admin(`/groups?search=${name}`)).json()) as { id: string; name: string }[]).find((g) => g.name === name)!

/** A fresh browser (no Keycloak session) goes through the button, the Keycloak login page, and back. */
async function signInAs(browser: Browser, username: string, password: string) {
  const ctx = await browser.newContext()
  const p = await ctx.newPage()
  await p.goto(`${ADMIN_URL}/`)
  await p.getByTestId('sso-button').click()
  await p.locator('#username').fill(username)
  await p.locator('#password').fill(password)
  await p.locator('#kc-login').click()
  return { ctx, p }
}
const me = async (ctx: { request: { get: (u: string) => Promise<{ status(): number; json(): Promise<any> }> } }) => {
  const r = await ctx.request.get(`${TARGET}/auth/me`)
  return { status: r.status(), body: r.status() === 200 ? await r.json() : null }
}

test.beforeEach(async ({ api }) => {
  const roles = (await api.get('/auth/roles')).json.roles as { id: string; name: string }[]
  const id = (n: string) => roles.find((r) => r.name === n)!.id
  const r = await api.put('/oidc-settings', {
    enabled: true, label: 'Keycloak', issuer: ISSUER, clientId: 'whoobe', clientSecret: 'kc-test-secret', redirectBaseUrl: TARGET, dashboardUrl: ADMIN_URL,
    roleClaim: 'groups', roleMapping: [{ value: 'whoobe-editors', roleId: id('sec-write') }, { value: 'whoobe-readers', roleId: id('sec-read') }],
    defaultRoleIds: [], autoProvision: true, linkByEmail: true, localLogin: 'all',
  })
  expect(r.status, r.text.slice(0, 200)).toBe(200)
})
test.afterAll(async () => {
  const { clientFor } = await import('../lib/client')
  const api = await clientFor('admin')
  await api.put('/oidc-settings', OFF)
  const users = (await api.get('/auth/users')).json.users as { id: string; email: string }[]
  for (const u of users.filter((x) => x.email.endsWith('@kc.test'))) await api.delete(`/auth/users/${u.id}`)
  for (const name of ['alice']) { const u = await kcUser(name); await admin(`/users/${u.id}`, { method: 'PUT', body: JSON.stringify({ enabled: true }) }) }
})

test('the saved address is read from the real discovery document', async ({ api }) => {
  const t = await api.post('/oidc-settings/test', {})
  expect(t.json.ok, t.text).toBe(true)
  expect(t.json.authorizationEndpoint).toContain('/protocol/openid-connect/auth')
})

test('alice (group whoobe-editors) signs in with the secret and PKCE, and gets the editor role', async ({ browser, api }) => {
  const { ctx, p } = await signInAs(browser, 'alice', 'alice-pass')
  await expect(p.getByRole('button', { name: 'Sign In' })).toHaveCount(0, { timeout: 30_000 })
  const who = await me(ctx)
  expect(who.status).toBe(200)
  expect(who.body.email).toBe('alice@kc.test')
  expect(who.body.displayName).toBe('Alice Editor')
  expect(who.body.permissions).toContain('objects:write')
  const u = ((await api.get('/auth/users')).json.users as any[]).find((x) => x.email === 'alice@kc.test')
  expect(u.roleNames).toEqual(['sec-write'])
  await ctx.close()
})

test('bob (readers) can read and not write; carol (no group) and dave (unverified e-mail) are turned back with a message', async ({ browser }) => {
  const bob = await signInAs(browser, 'bob', 'bob-pass')
  await expect(bob.p.getByRole('button', { name: 'Sign In' })).toHaveCount(0, { timeout: 30_000 })
  const b = await me(bob.ctx)
  expect(b.body.permissions).toContain('objects:read')
  expect(b.body.permissions).not.toContain('objects:write')
  await bob.ctx.close()

  const carol = await signInAs(browser, 'carol', 'carol-pass')
  await expect(carol.p.getByTestId('sso-error')).toHaveText(/No access has been given/, { timeout: 30_000 })
  expect((await me(carol.ctx)).status).toBe(401)
  await carol.ctx.close()

  const dave = await signInAs(browser, 'dave', 'dave-pass')
  await expect(dave.p.getByTestId('sso-error')).toHaveText(/has not verified your e-mail/, { timeout: 30_000 })
  expect((await me(dave.ctx)).status).toBe(401)
  await dave.ctx.close()
})

test('a group taken away at the provider takes the role away at the next sign-in', async ({ browser, api }) => {
  const alice = await kcUser('alice')
  const editors = await kcGroup('whoobe-editors')
  const readers = await kcGroup('whoobe-readers')
  try {
    await admin(`/users/${alice.id}/groups/${readers.id}`, { method: 'PUT' })
    await admin(`/users/${alice.id}/groups/${editors.id}`, { method: 'DELETE' })
    const { ctx, p } = await signInAs(browser, 'alice', 'alice-pass')
    await expect(p.getByRole('button', { name: 'Sign In' })).toHaveCount(0, { timeout: 30_000 })
    const who = await me(ctx)
    expect(who.body.permissions).toContain('objects:read')
    expect(who.body.permissions).not.toContain('objects:write')
    const u = ((await api.get('/auth/users')).json.users as any[]).find((x) => x.email === 'alice@kc.test')
    expect(u.roleNames).toEqual(['sec-read'])
    await ctx.close()
  } finally {
    await admin(`/users/${alice.id}/groups/${editors.id}`, { method: 'PUT' })
    await admin(`/users/${alice.id}/groups/${readers.id}`, { method: 'DELETE' })
  }
})

test('a person deactivated at the provider cannot start a new session', async ({ browser }) => {
  const alice = await kcUser('alice')
  try {
    await admin(`/users/${alice.id}`, { method: 'PUT', body: JSON.stringify({ enabled: false }) })
    const { ctx, p } = await signInAs(browser, 'alice', 'alice-pass')
    // Keycloak does not send the browser back with a code: it stays on its own page, with an error
    await expect(p.locator('#input-error, .kc-feedback-text, #kc-error-message')).toBeVisible({ timeout: 30_000 })
    expect(p.url()).not.toContain(TARGET)
    expect((await me(ctx)).status).toBe(401)
    await ctx.close()
  } finally {
    await admin(`/users/${alice.id}`, { method: 'PUT', body: JSON.stringify({ enabled: true }) })
  }
})
