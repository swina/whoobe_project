// Settings > Form uploads: choose a website, allow file types, set the limits, save; unsafe values are refused by the server.
import { test, expect, ADMIN_URL } from './fixtures'

test('the upload limits of a website are set in Settings', async ({ api, authed, tag }) => {
  const made = await api.post('/whoobe-one/websites', { name: `UpSet ${tag}`, rootPath: `/upset-${tag}` })
  expect(made.status, made.text.slice(0, 120)).toBe(201)
  const id = made.json.website.id
  try {
    const p = await authed.newPage()
    await p.setViewportSize({ width: 1400, height: 900 })
    await p.goto(`${ADMIN_URL}/`)
    await p.getByTestId('nav-item-settings').click()
    await p.getByRole('button', { name: 'Form uploads', exact: true }).first().click()

    const card = p.getByTestId('upload-settings')
    await expect(card).toBeVisible()
    await card.getByTestId('upload-website').selectOption(id)
    await expect(card.getByTestId('upload-enabled')).toBeVisible()
    // off by default: the rest is disabled
    await expect(card.getByTestId('upload-ext-pdf')).toBeDisabled()
    await expect(card.getByTestId('upload-ext-html')).toHaveCount(0)

    await card.getByTestId('upload-enabled').check()
    await card.getByTestId('upload-ext-pdf').check()
    await card.getByTestId('upload-ext-png').check()
    await card.getByTestId('upload-max-mb').fill('2')
    await card.getByTestId('upload-max-files').fill('2')
    await card.getByTestId('upload-folder').fill('private/cv')
    await card.getByTestId('upload-save').click()

    await expect.poll(async () => (await api.get(`/whoobe-one/websites/${id}/upload-settings`)).json.uploads).toMatchObject({
      enabled: true, allowedExtensions: ['pdf', 'png'], maxFileBytes: 2 * 1024 * 1024, maxFiles: 2, targetFolder: 'private/cv',
    })

    // a public folder without the permission to use one is refused, with the reason shown
    await card.getByTestId('upload-folder').fill('public/cv')
    await card.getByTestId('upload-save').click()
    await expect(card.getByTestId('upload-error')).toContainText('folder')
    // allowing it works and shows the warning
    await card.getByTestId('upload-allow-public').check()
    await expect(card.getByTestId('upload-public-warning')).toBeVisible()
    await card.getByTestId('upload-save').click()
    await expect.poll(async () => (await api.get(`/whoobe-one/websites/${id}/upload-settings`)).json.uploads.targetFolder).toBe('public/cv')
  } finally {
    await api.delete(`/whoobe-one/websites/${id}`)
  }
})
