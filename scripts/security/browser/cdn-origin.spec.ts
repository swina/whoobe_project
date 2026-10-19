// The "CDN in front of this installation" provider in the dashboard (docs/plans/assets/cdn-providers-plan.md): Settings > DAM configuration > CDN Mirroring
// offers it with one field, the address, and no secret; the Test button asks the CDN for a public file.
import { test, expect, ADMIN_URL } from './fixtures'
import { ASSET_TARGET } from '../lib/config'
import { startMockCdn } from '../lib/mock-cdn'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

test('the default can be a CDN in front of this installation: one address, no secret, a test through the CDN', async ({ api, authed, tag }) => {
  const cdn = await startMockCdn()
  const pimcorePath = `/cdnoriginui-${tag}/sample.png`
  await api.delete('/whoobe-one/settings/cdn-mirror')
  const up = await api.forBase(ASSET_TARGET).upload('/api/v1/dam/upload', { pimcorePath, isPublic: 'true' }, { file: { name: 'sample.png', type: 'image/png', data: PNG as any } })
  expect(up.status, up.text.slice(0, 120)).toBe(200)
  try {
    const p = await authed.newPage()
    await p.goto(`${ADMIN_URL}/`)
    await p.getByTestId('nav-item-settings').click()
    await p.getByRole('button', { name: 'DAM configuration', exact: true }).click()
    await p.getByRole('button', { name: 'CDN Mirroring', exact: true }).click()
    const card = p.getByTestId('cdn-card').first()
    await expect(card).toBeVisible({ timeout: 15_000 })
    await card.getByTestId('cdn-provider').selectOption({ label: 'CDN in front of this installation' })
    // only the address: no Cloudinary route or preset, no Cloudflare account or token
    await expect(card.getByTestId('cdn-field-baseUrl')).toBeVisible()
    await expect(card.getByText('Unsigned upload preset')).toHaveCount(0)
    await expect(card.getByTestId('cdn-field-apiToken')).toHaveCount(0)
    await card.getByTestId('cdn-field-baseUrl').fill(`${cdn.base}/`)
    await card.getByTestId('cdn-save').click()
    await expect(card.getByText('Saved.')).toBeVisible({ timeout: 10_000 })
    expect((await api.get('/whoobe-one/settings/cdn-mirror')).json).toMatchObject({ scope: 'default', provider: 'cdn-origin', configured: true, config: { baseUrl: cdn.base } })

    await card.getByTestId('cdn-test').click()
    await expect(card.getByTestId('cdn-test-result')).toContainText('the settings work', { timeout: 15_000 })
    expect(cdn.log.some((l) => l.method === 'HEAD' && l.path.startsWith('/dam-asset/'))).toBe(true)

    // a CDN that forwards to the dashboard returns its page: the test says so
    cdn.state.mode = 'html'
    await card.getByTestId('cdn-test').click()
    await expect(card.getByTestId('cdn-test-result')).toContainText('web page', { timeout: 15_000 })
  } finally {
    try { await api.forBase(ASSET_TARGET).request('DELETE', '/api/v1/dam/asset', { body: { pimcorePath } }) } catch { /* best effort */ }
    await api.delete('/whoobe-one/settings/cdn-mirror')
    await cdn.close()
  }
})
