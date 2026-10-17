// The loop guard in the dashboard: the subscription shows a "loop guard" badge and its delivery log lists the stopped deliveries with the reason.
import { test, expect, ADMIN_URL, GATEWAY_TARGET } from './fixtures'

test('Object events: a stopped delivery shows in the log and the subscription gets the loop guard badge', async ({ api, authed, tag }) => {
  const gw = api.forBase(GATEWAY_TARGET)
  const cls = await api.post('/data-classes', { name: `LoopUi${tag}`, label: `LoopUi${tag}`, fields: [{ name: 'title', title: 'Title', fieldType: 'text' }] })
  expect(cls.status, cls.text.slice(0, 150)).toBe(201)
  const ep = await gw.post('/api/v1/gateway/endpoints', { name: `loopui-${tag}`, baseUrl: 'http://core-api:3003', authType: 'none' })
  const route = await gw.post(`/api/v1/gateway/endpoints/${ep.json.id}/routes`, { path: '/public/data-objects/query', method: 'POST' })
  const client = await gw.post('/api/v1/gateway/clients', { name: `loopui-${tag}`, scopes: [`data:write:LoopUi${tag}`], rateLimitRps: 100 })
  expect(client.status, client.text.slice(0, 150)).toBe(201)
  const sub = await api.post('/object-event-subscriptions', { name: `loopui-${tag}`, events: ['object.updated'], endpointId: ep.json.id, routeId: route.json.id, classId: cls.json.class.id })
  expect(sub.status, sub.text.slice(0, 150)).toBe(201)
  const auth = { authorization: `Bearer ${client.json.plaintext}`, 'content-type': 'application/json' }
  const created = await fetch(`${GATEWAY_TARGET}/client/v1/data/LoopUi${tag}`, { method: 'POST', headers: auth, body: JSON.stringify({ key: `lu-${tag}`, attributes: { title: 'a' } }) })
  const objectId = (await created.json()).object.id
  try {
    for (let i = 0; i < 8; i++) {
      const r = await fetch(`${GATEWAY_TARGET}/client/v1/data/LoopUi${tag}/${objectId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ attributes: { title: `t${i}` } }) })
      expect(r.status).toBe(200)
    }
    const p = await authed.newPage()
    await p.goto(`${ADMIN_URL}/`); await p.waitForTimeout(2000)
    await p.locator('aside').getByText('Object events', { exact: true }).first().click(); await p.waitForTimeout(2000)
    const row = p.locator('tr', { hasText: `loopui-${tag}` })
    await expect(row.getByText('loop guard', { exact: true })).toBeVisible()
    await row.getByTitle('Delivery log', { exact: true }).click(); await p.waitForTimeout(1500)
    const stopped = p.locator('tr', { hasText: /loop guard: more than 5 events by this API client/ })
    await expect(stopped.first()).toBeVisible()
    await expect(stopped.first().getByText('stopped', { exact: true })).toBeVisible()
    expect(await stopped.first().getByRole('button', { name: 'Retry' }).count()).toBe(0)
  } finally {
    await api.delete(`/object-event-subscriptions/${sub.json.subscription.id}`)
    await api.delete(`/data-objects/${objectId}`)
    await api.delete(`/data-classes/${cls.json.class.id}`)
    await gw.delete(`/api/v1/gateway/clients/${client.json.client.id}`)
    await gw.delete(`/api/v1/gateway/endpoints/${ep.json.id}`)
  }
})
