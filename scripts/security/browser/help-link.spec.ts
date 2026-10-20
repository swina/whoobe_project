// The dashboard's Help entry (docs/plans/community/github-discussions-plan.md): a plain link to the project's public discussions, taken from the `community`
// field of /health (COMMUNITY_URL), that the person follows in a new tab. Nothing is sent by the page: it is an <a>, not a request.
import { test, expect, ADMIN_URL } from './fixtures'

test('the sidebar offers Help: a link in a new tab, taken from /health, and hidden when the setting is empty', async ({ api, authed }) => {
  const health = await api.get('/health')
  const url: string | undefined = health.json?.community?.url
  const p = await authed.newPage()
  await p.goto(`${ADMIN_URL}/`)
  await expect(p.getByText('System Online')).toBeVisible({ timeout: 15_000 })
  const link = p.getByTestId('help-community')
  if (!url) {
    await expect(link).toHaveCount(0)
    return
  }
  await expect(link).toHaveAttribute('href', url)
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', /noopener/)
  await expect(p.getByTestId('help-docs')).toHaveAttribute('target', '_blank')
})
