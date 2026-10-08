// Settings > Outgoing Mail: choose whose mail (the default, or a website), choose SMTP or a provider, fill the
// provider's fields (they come from its definition), save, and the API key is never shown again.
import { test, expect, ADMIN_URL } from './fixtures'

test('a website gets its own OneSignal configuration from the dashboard, and the key is not shown again', async ({ api, authed, tag }) => {
  const KEY = `os_ui_secret_${tag}_do_not_show`
  // the message below needs a default to send with; do not depend on another suite having saved one
  const dflt = await api.put('/mail-settings', { provider: 'smtp', smtp: { host: 'smtp.sectest.local', port: 2525, secure: false, user: '' }, fromAddress: 'noreply@sectest.local' })
  expect(dflt.status, dflt.text.slice(0, 120)).toBe(200)
  const site = await api.post('/whoobe-one/websites', { name: `UI Mail ${tag}`, rootPath: `/uimail-${tag}` })
  expect(site.status, site.text.slice(0, 100)).toBe(201)
  const siteId = site.json.website.id
  try {
    const p = await authed.newPage()
    await p.goto(`${ADMIN_URL}/`)
    await p.getByText('Outgoing Mail', { exact: true }).first().click()
    const scope = p.locator('#mail-scope')
    await scope.waitFor({ timeout: 15_000 })

    // the default: SMTP, as before
    await expect(p.getByText('Host', { exact: true })).toBeVisible()

    // one website
    await scope.selectOption({ label: `UI Mail ${tag}` })
    await expect(p.getByText('This website has no configuration of its own: it sends with the default')).toBeVisible({ timeout: 10_000 })
    await p.getByLabel('Send with').selectOption({ label: 'OneSignal' })
    // the fields come from the provider's definition
    await expect(p.getByText('App ID')).toBeVisible()
    await expect(p.getByText('App API key')).toBeVisible()
    await expect(p.getByText('Host', { exact: true })).toHaveCount(0)
    await p.getByLabel('App ID').fill('11111111-2222-4333-8444-555555555555')
    await p.getByLabel('App API key').fill(KEY)
    await p.getByLabel('From address (optional)').fill('noreply@mail.sectest.local')
    await p.getByRole('button', { name: 'Give this website its own configuration' }).click()
    await expect(p.getByText('Saved.')).toBeVisible({ timeout: 10_000 })

    // after the save: it has its own, the key field is empty and says "leave blank", the key is nowhere on the page
    await expect(p.getByText('This website sends with its own configuration')).toBeVisible()
    await expect(p.getByLabel(/App API key.*leave blank to keep the current one/)).toHaveValue('')
    expect(await p.content()).not.toContain(KEY)
    expect((await api.get(`/mail-settings?websiteId=${siteId}`)).text).not.toContain(KEY)

    // back to the default
    p.once('dialog', (d) => d.accept())
    await p.getByRole('button', { name: 'Use the default again' }).click()
    await expect(p.getByText('This website has no configuration of its own: it sends with the default')).toBeVisible({ timeout: 10_000 })
  } finally {
    await api.delete(`/whoobe-one/websites/${siteId}`)
  }
})
