// Data subject requests in the browser (docs/plans/system/data-subject-plan.md): an administrator finds a person by e-mail, downloads the export,
// erases with the value typed again, and sets the retention of a class.
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test, expect, ADMIN_URL } from './fixtures'

test('an administrator searches, exports, erases a person and sets a retention', async ({ api, authed }) => {
  const tag = randomBytes(3).toString('hex')
  const email = `dsr.${tag}@example.org`
  const cls = await api.post('/data-classes', { name: `Dsr${tag}`, label: `Dsr ${tag}`, fields: [{ name: 'email', title: 'Email', fieldType: 'input' }, { name: 'name', title: 'Name', fieldType: 'input' }] })
  expect(cls.status, cls.text.slice(0, 150)).toBe(201)
  const classId = cls.json.class.id
  try {
    expect((await api.post('/data-objects', { classId, key: `sub-${tag}`, attributes: { email, name: 'Dee' } })).status).toBe(201)
    await api.put('/mail-settings', { provider: 'smtp', smtp: { host: 'smtp.sectest.local', port: 2525, secure: false, user: '' }, fromAddress: 'noreply@sectest.local' })
    await api.post('/mail-settings/test', { to: email, subject: `Hello ${tag}`, text: 'hi' })

    const p = await authed.newPage()
    await p.goto(`${ADMIN_URL}/`)
    await p.getByTestId('nav-item-security').click()
    await p.getByTestId('nav-security-data-subject').click()
    const card = p.getByTestId('dsr-card')
    await expect(card).toBeVisible({ timeout: 15_000 })

    await card.getByTestId('dsr-identifier').fill(email.toUpperCase())
    await card.getByTestId('dsr-search').click()
    await expect(card.getByTestId('dsr-counts')).toContainText('Found 1 object(s), 0 uploaded file(s) and 1 mail(s)', { timeout: 15_000 })

    // the export is a file named after a fingerprint, with the person's data in it and nothing of anybody else
    const [download] = await Promise.all([p.waitForEvent('download'), card.getByTestId('dsr-export').click()])
    expect(download.suggestedFilename()).toMatch(/^data-subject-[0-9a-f]{12}\.json$/)
    const body = JSON.parse(readFileSync((await download.path())!, 'utf8'))
    expect(body.objects).toHaveLength(1)
    expect(body.objects[0].attributes).toMatchObject({ email, name: 'Dee' })

    // erasing needs the value typed again; the button stays off until it matches
    await card.getByTestId('dsr-erase').click()
    const panel = card.getByTestId('dsr-erase-panel')
    await expect(panel).toBeVisible()
    await expect(panel.getByTestId('dsr-erase-confirm')).toBeDisabled()
    await panel.getByTestId('dsr-confirm').fill('someone-else@example.org')
    await expect(panel.getByTestId('dsr-erase-confirm')).toBeDisabled()
    await panel.getByTestId('dsr-confirm').fill(email)
    await panel.getByTestId('dsr-erase-confirm').click()
    await expect(card.getByTestId('dsr-erased')).toContainText('Erased 1 object(s), 0 file(s) and 1 mail(s)', { timeout: 15_000 })
    await expect(card.getByTestId('dsr-counts')).toContainText('Found 0 object(s)')
    expect((await api.get(`/data-objects?classId=${classId}`)).json.objects).toHaveLength(0)

    // retention of the class
    const field = card.getByTestId(`retention-Dsr${tag}`)
    await field.fill('45')
    await field.locator('xpath=following-sibling::button').click()
    await expect(card.getByTestId('retention-message')).toContainText(`Saved for Dsr ${tag}`, { timeout: 10_000 })
    expect((await api.get(`/data-classes/${classId}`)).json.class.retentionDays).toBe(45)
    await card.getByTestId('retention-run').click()
    await expect(card.getByTestId('retention-message')).toContainText('Removed', { timeout: 15_000 })
  } finally {
    await api.delete(`/data-classes/${classId}`)
  }
})
