// The login page shows the sign-in form and nothing else: the recovery-codes panel belongs to the end of a forced enrolment
// (mfa-enrolment.spec.ts) and must not be on screen before anybody has signed in. In 0.2.0 the single sign-on block broke the v-if chain
// of LoginView.vue, so the panel (the final v-else) showed under the form on every installation without single sign-on.
import { test, expect, ADMIN_URL } from './fixtures'

test('the login page does not show the recovery codes panel', async ({ browser }) => {
  const ctx = await browser.newContext()
  const p = await ctx.newPage()
  await p.goto(`${ADMIN_URL}/`)
  await expect(p.getByText('Sign in to continue')).toBeVisible({ timeout: 15_000 })
  await expect(p.locator('input[type=email]')).toBeVisible()
  await expect(p.getByText('Save these recovery codes')).toHaveCount(0)
  await expect(p.getByTestId('recovery-codes')).toHaveCount(0)
  await ctx.close()
})
