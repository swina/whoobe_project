// Events of files and pages in the Object events screen (docs/plans/system/more-events-plan.md): three groups of events, and the impossible
// combination (a class with a file or page event) is refused before anything is sent.
import { test, expect, ADMIN_URL, GATEWAY_TARGET } from './fixtures'

test('Object events: the editor lists data records, files and pages, and refuses a class with a file event', async ({ api, authed, tag }) => {
  const gw = api.forBase(GATEWAY_TARGET)
  const cls = await api.post('/data-classes', { name: `MoreUi${tag}`, label: `MoreUi${tag}`, fields: [{ name: 'title', title: 'Title', fieldType: 'text' }] })
  expect(cls.status, cls.text.slice(0, 150)).toBe(201)
  const ep = await gw.post('/api/v1/gateway/endpoints', { name: `moreui-${tag}`, baseUrl: 'http://core-api:3003', authType: 'none' })
  const route = await gw.post(`/api/v1/gateway/endpoints/${ep.json.id}/routes`, { path: '/public/data-objects/query', method: 'POST' })
  try {
    const p = await authed.newPage()
    await p.goto(`${ADMIN_URL}/`); await p.waitForTimeout(2000)
    await p.locator('aside').getByText('Object events', { exact: true }).first().click(); await p.waitForTimeout(2000)
    await p.getByRole('button', { name: /New subscription/ }).click()

    await expect(p.getByTestId('events-object')).toBeVisible()
    await expect(p.getByTestId('events-asset')).toContainText('Uploaded')
    await expect(p.getByTestId('events-asset')).toContainText('Folder deleted')
    await expect(p.getByTestId('events-page')).toContainText('Published')

    // name, endpoint and route filled; a class chosen; a file event ticked: refused with the reason, nothing created
    await p.getByRole('textbox', { name: 'Name' }).fill(`moreui-${tag}`)
    await p.getByRole('combobox', { name: 'Class' }).selectOption({ label: `MoreUi${tag}` })
    await p.getByTestId('events-asset').getByText('Uploaded', { exact: true }).click()
    await p.getByRole('combobox', { name: 'Integrations endpoint' }).selectOption({ label: `moreui-${tag}` })
    await p.getByRole('combobox', { name: /^Route/ }).selectOption({ index: 1 })
    await p.getByRole('button', { name: /^(Create|Save)/ }).click()
    await expect(p.getByText(/A class applies to data records only/)).toBeVisible()
    expect(((await api.get('/object-event-subscriptions')).json.subscriptions as { name: string }[]).some((s) => s.name === `moreui-${tag}`)).toBe(false)
  } finally {
    await api.delete(`/data-classes/${cls.json.class.id}`)
    await gw.delete(`/api/v1/gateway/endpoints/${ep.json.id}`)
  }
})
