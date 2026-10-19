// Single sign-on in the browser (docs/plans/system/oidc-login-plan.md): the button on the sign-in screen, the round trip through the provider
// (a mock one that signs real tokens) and back into the dashboard, the message when it fails, and the settings card.
import { randomBytes } from 'node:crypto'
import { test, expect, ADMIN_URL, TARGET } from './fixtures'
import { startMockOidc } from '../lib/mock-oidc'

const CLIENT_ID = 'whoobe-sectest-ui'
const OFF = { clearClientSecret: true, enabled: false, localLogin: 'all', autoProvision: false, roleMapping: [], defaultRoleIds: [], roleClaim: null, dashboardUrl: null }

test.describe.configure({ mode: 'serial' })

let idp: Awaited<ReturnType<typeof startMockOidc>>
test.beforeAll(async () => { idp = await startMockOidc({ clientId: CLIENT_ID }) })
test.afterAll(async () => { await idp.close() })
test.afterEach(async ({ api }) => { await api.put('/oidc-settings', OFF) })

async function configure(api: any, readRoleId: string, over: Record<string, unknown> = {}) {
  const r = await api.put('/oidc-settings', {
    enabled: true, label: 'Sectest SSO', issuer: idp.issuer, clientId: CLIENT_ID, redirectBaseUrl: TARGET, dashboardUrl: ADMIN_URL,
    roleClaim: 'groups', roleMapping: [{ value: 'whoobe-readers', roleId: readRoleId }], autoProvision: true, ...over,
  })
  expect(r.status, r.text.slice(0, 200)).toBe(200)
}
const readRole = async (api: any) => ((await api.get('/auth/roles')).json.roles as { id: string; name: string }[]).find((r) => r.name === 'sec-read')!.id

test('the button signs a person in through the provider and into the dashboard', async ({ api, browser }) => {
  await configure(api, await readRole(api))
  const email = `ui-sso-${randomBytes(3).toString('hex')}@idp.test`
  idp.state.login = { sub: `ui-${randomBytes(3).toString('hex')}`, email, email_verified: true, name: 'Grace Hopper', groups: ['whoobe-readers'] }
  try {
    const ctx = await browser.newContext()
    const p = await ctx.newPage()
    await p.goto(`${ADMIN_URL}/`)
    await expect(p.getByTestId('sso-button')).toHaveText(/Sign in with Sectest SSO/, { timeout: 15_000 })
    await p.getByTestId('sso-button').click()
    // back on the dashboard, signed in: no sign-in form, no error
    await expect(p.getByRole('button', { name: 'Sign In' })).toHaveCount(0, { timeout: 20_000 })
    expect(p.url()).toMatch(new RegExp(`^${ADMIN_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$`))
    const me = await ctx.request.get(`${TARGET}/auth/me`)
    expect((await me.json()).email).toBe(email)
    await ctx.close()
  } finally {
    const users = (await api.get('/auth/users')).json.users as { id: string; email: string }[]
    const u = users.find((x) => x.email === email)
    if (u) await api.delete(`/auth/users/${u.id}`)
  }
})

test('a refused sign-in comes back with a message, and the password form is still there', async ({ api, browser }) => {
  await configure(api, await readRole(api))
  idp.state.denyAuthorize = true
  try {
    const ctx = await browser.newContext()
    const p = await ctx.newPage()
    await p.goto(`${ADMIN_URL}/`)
    await p.getByTestId('sso-button').click()
    await expect(p.getByTestId('sso-error')).toHaveText(/The provider refused the sign-in/, { timeout: 20_000 })
    await expect(p.locator('input[type=password]')).toBeVisible()
    // the code is taken out of the address bar
    expect(p.url()).not.toContain('sso_error')
    await ctx.close()
  } finally {
    idp.state.denyAuthorize = false
  }
})

test('there is no button while single sign-on is off', async ({ browser }) => {
  const ctx = await browser.newContext()
  const p = await ctx.newPage()
  await p.goto(`${ADMIN_URL}/`)
  await expect(p.locator('input[type=password]')).toBeVisible({ timeout: 15_000 })
  await expect(p.getByTestId('sso-button')).toHaveCount(0)
  await ctx.close()
})

test('an administrator sets it up from Settings > Security and tests the address', async ({ api, authed }) => {
  const p = await authed.newPage()
  await p.goto(`${ADMIN_URL}/`)
  await p.getByTestId('nav-item-settings').click()
  await p.getByRole('button', { name: 'Security', exact: true }).first().click()
  const card = p.getByTestId('oidc-card')
  await expect(card).toBeVisible({ timeout: 15_000 })
  await card.getByTestId('oidc-issuer').fill(idp.issuer)
  await card.getByTestId('oidc-client-id').fill(CLIENT_ID)
  await card.getByTestId('oidc-base-url').fill(TARGET)
  await card.getByTestId('oidc-role-claim').fill('groups')
  await card.getByTestId('oidc-add-mapping').click()
  await card.getByTestId('oidc-map-value-0').fill('whoobe-readers')
  await card.getByTestId('oidc-map-role-0').selectOption({ label: 'sec-read' })
  await card.getByTestId('oidc-enabled').check()
  await card.getByTestId('oidc-save').click()
  await expect(card.getByText('Saved.')).toBeVisible({ timeout: 10_000 })
  await card.getByTestId('oidc-test').click()
  await expect(card.getByTestId('oidc-test-result')).toContainText('The provider answered', { timeout: 15_000 })

  const got = await api.get('/oidc-settings')
  expect(got.json).toMatchObject({ enabled: true, issuer: idp.issuer, clientId: CLIENT_ID, roleClaim: 'groups', hasClientSecret: false })
  expect(got.json.roleMapping).toHaveLength(1)
})
