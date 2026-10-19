// The Security section of the navigation: one main item with the pages that are about who may sign in and do what, what is held about people, and
// what happened. What a person sees there follows their permissions; Settings no longer carries Roles or Security; the header shield opens the audit log.
import { test, expect, ADMIN_URL } from './fixtures'
import { createTempUser, loginAs } from '../lib/tempuser'

const ALL = ['access', 'two-factor', 'sign-in', 'sso', 'data-subject', 'system-logs', 'audit-log']

test('the administrator finds seven pages under one Security item, and the old places are gone', async ({ authed }) => {
  const p = await authed.newPage()
  await p.goto(`${ADMIN_URL}/`)
  await expect(p.getByTestId('nav-item-security')).toBeVisible({ timeout: 15_000 })
  // not main items any more
  await expect(p.getByTestId('nav-item-system-logs')).toHaveCount(0)
  await expect(p.getByTestId('nav-item-audit-log')).toHaveCount(0)
  await p.getByTestId('nav-item-security').click()
  for (const key of ALL) await expect(p.getByTestId(`nav-security-${key}`), key).toBeVisible()
  await expect(p.getByTestId('nav-security-access')).toHaveText('Roles/Users/Workspaces')
  await expect(p.getByTestId('nav-security-two-factor')).toHaveText('Two-Factor Authentication')
  await expect(p.getByTestId('nav-security-sign-in')).toHaveText('Sign-in Requirements')
  await expect(p.getByTestId('nav-security-sso')).toHaveText('SSO')
  await expect(p.getByTestId('nav-security-data-subject')).toHaveText('Data Subject Requests')
  await expect(p.getByTestId('nav-security-system-logs')).toHaveText('System Logs')
  await expect(p.getByTestId('nav-security-audit-log')).toHaveText('Audit Logs')

  // each page opens its own content
  await p.getByTestId('nav-security-access').click()
  await expect(p.getByTestId('security-view').getByRole('heading', { name: 'Roles / Users / Workspaces' })).toBeVisible()
  await p.getByTestId('nav-security-two-factor').click()
  await expect(p.getByText('Two-Factor Authentication').first()).toBeVisible()
  await p.getByTestId('nav-security-sign-in').click()
  await expect(p.getByText('Sign-in requirements', { exact: false }).first()).toBeVisible()
  await p.getByTestId('nav-security-sso').click()
  await expect(p.getByTestId('oidc-card')).toBeVisible()
  await p.getByTestId('nav-security-data-subject').click()
  await expect(p.getByTestId('dsr-card')).toBeVisible()
  await p.getByTestId('nav-security-system-logs').click()
  await expect(p.getByTestId('security-view').getByRole('heading', { name: 'System Logs' })).toBeVisible()
  await p.getByTestId('nav-security-audit-log').click()
  await expect(p.getByTestId('security-view').getByRole('heading', { name: 'Audit Logs' })).toBeVisible()

  // Settings keeps its own pages and lost the two that moved
  await p.getByTestId('nav-item-settings').click()
  await expect(p.getByRole('button', { name: 'General settings', exact: true })).toBeVisible()
  await expect(p.getByRole('button', { name: 'Roles/Users/Workspaces', exact: true })).toHaveCount(1)   // only the one under Security
  await expect(p.locator('aside').getByRole('button', { name: 'Security', exact: true })).toHaveCount(1)  // only the main item
})

test('the header shield opens the audit log', async ({ authed }) => {
  const p = await authed.newPage()
  await p.goto(`${ADMIN_URL}/`)
  await p.getByTestId('header-audit-log').click()
  await expect(p.getByTestId('nav-security-audit-log')).toBeVisible()
  await expect(p.getByRole('heading', { name: 'Security ‣ Audit Logs' })).toBeVisible()
})

test('a person with few permissions sees only what their role allows: their own two-factor page and the system logs', async ({ api, browser }) => {
  const user = await createTempUser(api, 'read')
  try {
    const session = await loginAs(user)
    const ctx = await browser.newContext()
    await ctx.addCookies([{ name: 'wcms_session', value: session.cookieHeader.split('=').slice(1).join('='), domain: 'localhost', path: '/' }])
    const p = await ctx.newPage()
    await p.goto(`${ADMIN_URL}/`)
    await expect(p.getByTestId('nav-item-security')).toBeVisible({ timeout: 15_000 })
    await p.getByTestId('nav-item-security').click()
    await expect(p.getByTestId('nav-security-two-factor')).toBeVisible()
    await expect(p.getByTestId('nav-security-system-logs')).toBeVisible()
    for (const key of ['access', 'sign-in', 'sso', 'data-subject', 'audit-log']) await expect(p.getByTestId(`nav-security-${key}`), key).toHaveCount(0)
    await expect(p.getByTestId('header-audit-log')).toHaveCount(0)
    await ctx.close()
  } finally {
    await api.delete(`/auth/users/${user.id}`)
  }
})
