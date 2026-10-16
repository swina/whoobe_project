// The Objects list gives the record's id (the one an API client puts in /client/v1/data/<Class>/<id>): right click > Copy id.
import { test, expect, ADMIN_URL } from './fixtures'

test('Objects list: right click > Copy id puts the record id on the clipboard', async ({ api, authed, tag }) => {
  const cls = await api.post('/data-classes', { name: `CopyId${tag}`, label: `CopyId${tag}`, fields: [{ name: 'note', title: 'Note', fieldType: 'text' }] })
  const obj = await api.post('/data-objects', { classId: cls.json.class.id, key: `cid-${tag}`, attributes: { note: 'x' } })
  expect(obj.status, obj.text.slice(0, 120)).toBe(201)
  try {
    await authed.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ADMIN_URL })
    const p = await authed.newPage()
    await p.goto(`${ADMIN_URL}/`); await p.waitForTimeout(2000)
    await p.locator('aside').getByText(`CopyId${tag}`, { exact: true }).first().click(); await p.waitForTimeout(2000)
    await p.getByText(`cid-${tag}`).first().click({ button: 'right' }); await p.waitForTimeout(500)
    await p.getByRole('menuitem', { name: 'Copy id' }).click(); await p.waitForTimeout(500)
    expect(await p.evaluate(() => navigator.clipboard.readText())).toBe(obj.json.object.id)
    expect(await p.locator('body').innerText()).toContain(obj.json.object.id)   // the toast names it too
  } finally {
    await api.delete(`/data-objects/${obj.json.object.id}`)
    await api.delete(`/data-classes/${cls.json.class.id}`)
  }
})

test('Object tab is named by the field marked "tab title", else by the first text field, not by the key', async ({ api, authed, tag }) => {
  const cls = await api.post('/data-classes', { name: `TabT${tag}`, label: `TabT${tag}`, fields: [
    { name: 'first', title: 'First', fieldType: 'input' }, { name: 'company', title: 'Company', fieldType: 'input', tabTitle: true }] })
  expect(cls.status, cls.text.slice(0, 120)).toBe(201)
  const a = await api.post('/data-objects', { classId: cls.json.class.id, key: `tk-a-${tag}`, attributes: { first: 'Anna', company: `Acme ${tag}` } })
  const b = await api.post('/data-objects', { classId: cls.json.class.id, key: `tk-b-${tag}`, attributes: { first: `Bruno ${tag}` } })
  try {
    expect((await api.get(`/data-classes/${cls.json.class.id}`)).json.class.fields.find((x: any) => x.name === 'company').tabTitle, 'the flag is stored').toBe(true)
    const p = await authed.newPage()
    await p.goto(`${ADMIN_URL}/`); await p.waitForTimeout(2000)
    await p.locator('aside').getByText(`TabT${tag}`, { exact: true }).first().click(); await p.waitForTimeout(2000)
    for (const key of [`tk-a-${tag}`, `tk-b-${tag}`]) {
      await p.getByText(key).first().click({ button: 'right' }); await p.waitForTimeout(400)
      await p.getByRole('menuitem', { name: /Edit/ }).first().click(); await p.waitForTimeout(1500)
      await p.locator('aside').getByText(`TabT${tag}`, { exact: true }).first().click(); await p.waitForTimeout(800)
    }
    const tabs = (await p.locator('span.truncate.max-w-\\[160px\\]').allInnerTexts()).join(' | ')   // the tab strip only (the list shows the keys)
    expect(tabs).toContain(`Acme ${tag}`)       // the marked field
    expect(tabs).toContain(`Bruno ${tag}`)      // no mark in the data: the first text field with a value
    expect(tabs).not.toContain(`tk-a-${tag}`)
    expect(tabs).not.toContain(`tk-b-${tag}`)
  } finally {
    await api.delete(`/data-objects/${a.json.object.id}`); await api.delete(`/data-objects/${b.json.object.id}`)
    await api.delete(`/data-classes/${cls.json.class.id}`)
  }
})
