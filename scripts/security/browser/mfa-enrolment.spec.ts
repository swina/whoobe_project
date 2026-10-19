// Forced second factor (docs/plans/system/mandatory-2fa-plan.md): a user of a required role signs in with the password, is led to
// enrolment (QR code and key), gets no dashboard until the code is right, sees the recovery codes once, and then is in.
// Settings > Security > Sign-in requirements is where an administrator turns it on.
import { randomBytes } from 'node:crypto'
import { test, expect, ADMIN_URL } from './fixtures'
import { ROLE_USER_PASSWORD } from '../lib/config'
import { totp } from '../lib/totp'

test.afterEach(async ({ api }) => {
  await api.put('/security-settings', { requireMfaRoleIds: [], passwordMinLength: 8, passwordRequireClasses: false })
})

test('the enrolment step stands between the password and the dashboard', async ({ api, browser, tag }) => {
  const role = await api.post('/auth/roles', { name: `ui-mfa-${tag}`, permissionKeys: [] })
  expect(role.status, role.text.slice(0, 100)).toBe(201)
  const email = `ui-${randomBytes(3).toString('hex')}@sectest.local`
  const user = await api.post('/auth/users', { email, password: ROLE_USER_PASSWORD, displayName: 'UI', roleIds: [role.json.role.id] })
  expect(user.status, user.text.slice(0, 100)).toBe(201)
  try {
    expect((await api.put('/security-settings', { requireMfaRoleIds: [role.json.role.id] })).status).toBe(200)
    const ctx = await browser.newContext()
    const p = await ctx.newPage()
    await p.goto(`${ADMIN_URL}/`)
    await p.locator('input[type=email]').fill(email)
    await p.locator('input[type=password]').fill(ROLE_USER_PASSWORD)
    await p.getByRole('button', { name: 'Sign In' }).click()

    await expect(p.getByText('Your role requires two-factor authentication')).toBeVisible({ timeout: 15_000 })
    await expect(p.getByAltText('MFA QR code')).toBeVisible()
    const secret = (await p.locator('code').first().innerText()).trim()
    expect(secret).toMatch(/^[A-Z2-7]{16,}$/)

    // a wrong code: still no dashboard, and a message
    await p.getByPlaceholder('123456').fill('000000')
    await p.getByRole('button', { name: 'Confirm and sign in' }).click()
    await expect(p.getByText('Invalid code')).toBeVisible()
    await expect(p.getByText('Your role requires two-factor authentication')).toBeVisible()

    await p.getByPlaceholder('123456').fill(totp(secret))
    await p.getByRole('button', { name: 'Confirm and sign in' }).click()
    await expect(p.getByText('Save these recovery codes somewhere safe')).toBeVisible({ timeout: 15_000 })
    await expect(p.locator('code')).toHaveCount(8)
    await p.getByRole('button', { name: "I've saved these codes" }).click()
    await expect(p.getByRole('button', { name: 'Sign In' })).toHaveCount(0, { timeout: 15_000 })
    await ctx.close()
  } finally {
    await api.put('/security-settings', { requireMfaRoleIds: [] })
    await api.delete(`/auth/users/${user.json.user.id}`)
    await api.delete(`/auth/roles/${role.json.role.id}`)
  }
})

test('an administrator sets the requirement and the password policy from Settings > Security', async ({ api, authed, tag }) => {
  const role = await api.post('/auth/roles', { name: `ui-mfa-set-${tag}`, permissionKeys: [] })
  expect(role.status).toBe(201)
  try {
    const p = await authed.newPage()
    await p.goto(`${ADMIN_URL}/`)
    await p.getByTestId('nav-item-settings').click()
    await p.getByRole('button', { name: 'Security', exact: true }).first().click()
    await expect(p.getByText('Sign-in requirements')).toBeVisible({ timeout: 15_000 })
    await p.getByLabel(`ui-mfa-set-${tag}`).check()
    await p.locator('input[type=number]').fill('14')
    await p.getByRole('button', { name: 'Save' }).click()
    await expect(p.getByText('Saved.')).toBeVisible({ timeout: 10_000 })

    const got = await api.get('/security-settings')
    expect(got.json.requireMfaRoleIds).toEqual([role.json.role.id])
    expect(got.json.passwordPolicy.minLength).toBe(14)

    // a value out of range is stopped by the form (min / max), nothing is sent
    await p.locator('input[type=number]').fill('300')
    await p.getByRole('button', { name: 'Save' }).click()
    await expect(p.locator('input[type=number]:invalid')).toHaveCount(1)
    expect((await api.get('/security-settings')).json.passwordPolicy.minLength).toBe(14)
  } finally {
    await api.put('/security-settings', { requireMfaRoleIds: [], passwordMinLength: 8 })
    await api.delete(`/auth/roles/${role.json.role.id}`)
  }
})
