// CDN mirroring in the dashboard (docs/plans/assets/cdn-providers-plan.md): the installation's default under Settings > DAM, a website's own under
// Websites > Settings, and what Publish says about the website chosen. Cloudflare Images is a mock; the token is never shown again.
import { randomBytes } from 'node:crypto'
import { test, expect, ADMIN_URL } from './fixtures'
import { startMockCloudflare } from '../lib/mock-cloudflare'

const TOKEN = `cf-ui-token-${randomBytes(5).toString('hex')}`
const ACCOUNT = randomBytes(16).toString('hex')
const ACCOUNT_B = randomBytes(16).toString('hex')

test('the default is set in Settings > DAM, a website has its own, and Publish names the one that applies', async ({ api, authed, tag }) => {
  const cf = await startMockCloudflare({ token: TOKEN, account: ACCOUNT })
  const site = await api.post('/whoobe-one/websites', { name: `CdnUi ${tag}`, rootPath: `/cdnui${tag}` })
  expect(site.status, site.text.slice(0, 120)).toBe(201)
  const websiteId = site.json.website.id
  await api.delete('/whoobe-one/settings/cdn-mirror')
  try {
    const p = await authed.newPage()
    await p.goto(`${ADMIN_URL}/`)

    // -- the installation's default: Settings > DAM configuration > CDN Mirroring
    await p.getByTestId('nav-item-settings').click()
    await p.getByRole('button', { name: 'DAM configuration', exact: true }).click()
    await p.getByRole('button', { name: 'CDN Mirroring', exact: true }).click()
    const card = p.getByTestId('cdn-card').first()
    await expect(card).toBeVisible({ timeout: 15_000 })
    await card.getByTestId('cdn-provider').selectOption({ label: 'Cloudflare Images' })
    // Cloudinary's route and preset are not Cloudflare's fields
    await expect(card.getByText('Unsigned upload preset')).toHaveCount(0)
    await card.getByTestId('cdn-field-accountId').fill(ACCOUNT)
    await card.getByTestId('cdn-field-apiToken').fill(TOKEN)
    await card.getByTestId('cdn-field-apiBase').fill(cf.base)
    await card.getByTestId('cdn-save').click()
    await expect(card.getByText('Saved.')).toBeVisible({ timeout: 10_000 })
    // the token is not on the page, and the field says it is set
    expect(await p.content()).not.toContain(TOKEN)
    await expect(card.getByText('(set - leave blank to keep it)')).toBeVisible()
    await card.getByTestId('cdn-test').click()
    await expect(card.getByTestId('cdn-test-result')).toContainText('the settings work', { timeout: 15_000 })
    expect((await api.get('/whoobe-one/settings/cdn-mirror')).json).toMatchObject({ scope: 'default', provider: 'cloudflare-images', configured: true })

    // -- Publish: the website has no CDN of its own, so the default applies
    await p.getByTestId('nav-item-publish').click()
    await p.getByTestId('publish-website').selectOption(websiteId)
    await expect(p.getByTestId('publish-cdn-summary')).toContainText('Cloudflare Images', { timeout: 15_000 })
    await expect(p.getByTestId('publish-cdn-summary')).toContainText("installation's default")
    // the command does not ask for a route or a preset any more
    // the script is the value of a text area, not its text
    const areas = await p.locator('textarea').all()
    const command = (await Promise.all(areas.map((a) => a.inputValue()))).find((v) => v.includes('publish:sync-cdn')) ?? ''
    expect(command).toContain('pnpm publish:sync-cdn')
    expect(command).toContain(`--website-id "${websiteId}"`)
    expect(command).not.toMatch(/--gateway-route-id|--upload-preset/)

    // -- the website's own CDN: Websites > the website > Settings
    await p.getByTestId('publish-cdn-edit').click()
    const own = p.getByTestId('cdn-card').last()
    await expect(own.getByTestId('cdn-use-default')).toBeChecked({ timeout: 15_000 })
    await own.getByTestId('cdn-use-own').check()
    await own.getByTestId('cdn-provider').selectOption({ label: 'Cloudflare Images' })
    await own.getByTestId('cdn-field-accountId').fill(ACCOUNT_B)
    await own.getByTestId('cdn-field-apiToken').fill('another-token')
    await own.getByTestId('cdn-save').click()
    await expect(own.getByText('Saved.')).toBeVisible({ timeout: 10_000 })
    const mine = (await api.get(`/whoobe-one/settings/cdn-mirror?websiteId=${websiteId}`)).json
    expect(mine).toMatchObject({ scope: 'website', own: true, provider: 'cloudflare-images', config: { accountId: ACCOUNT_B } })
    // another website still gets the default
    expect((await api.get('/whoobe-one/settings/cdn-mirror')).json.config.accountId).toBe(ACCOUNT)

    // back to the default
    await own.getByTestId('cdn-use-default').check()
    await own.getByTestId('cdn-save').click()
    await expect(own.getByText('Saved.')).toBeVisible({ timeout: 10_000 })
    expect((await api.get(`/whoobe-one/settings/cdn-mirror?websiteId=${websiteId}`)).json).toMatchObject({ scope: 'default', own: false })
  } finally {
    await api.delete('/whoobe-one/settings/cdn-mirror')
    await api.delete(`/whoobe-one/websites/${websiteId}`)
    await cf.close()
  }
})
