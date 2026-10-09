// The editor's right side: a narrow vertical bar of tool icons at the far right, always there; every panel hidden until its icon is
// clicked, then shown to the LEFT of the bar; the same icon (or the panel's close button) hides it again; one panel at a time.
import { test, expect, EDITOR_URL, ADMIN_URL, pageContent, richText } from './fixtures'

test('the tools are a bar of icons at the far right; their panels open to its left and are hidden by default', async ({ api, authed, tag }) => {
  const page = await api.post('/whoobe-one/pages', { slug: `bar-${tag}`, title: `bar ${tag}`, content: pageContent([richText('t1', 'hello')]) })
  expect(page.status, page.text.slice(0, 150)).toBe(201)
  const id = page.json.page.id
  try {
    const p = await authed.newPage()
    await p.setViewportSize({ width: 1400, height: 900 })
    await p.goto(`${EDITOR_URL}/whoobe-one/editor?pageId=${id}&parentOrigin=${encodeURIComponent(ADMIN_URL)}`)
    await p.locator('#t1').waitFor({ timeout: 20_000 })
    const bar = p.getByTestId('editor-toolbar')
    const panel = p.getByTestId('editor-panel')
    const canvas = p.locator('#whoobe-editor-canvas')

    // default: only the bar, narrow, against the right edge
    await expect(bar).toBeVisible()
    await expect(panel).toHaveCount(0)
    const box = (await bar.boundingBox())!
    expect(box.width, 'a minimal width').toBeLessThanOrEqual(48)
    expect(box.x + box.width, 'at the far right').toBeGreaterThanOrEqual(1400 - 2)
    const wide = (await canvas.boundingBox())!.width

    // an icon shows its panel to the left of the bar
    const elements = bar.getByRole('button', { name: 'Elements', exact: true })
    await expect(elements).toHaveAttribute('aria-pressed', 'false')
    await elements.click()
    await expect(panel).toBeVisible()
    await expect(panel).toContainText('Elements')
    await expect(elements).toHaveAttribute('aria-pressed', 'true')
    const pb = (await panel.boundingBox())!
    expect(pb.x + pb.width, 'the panel ends where the bar starts').toBeLessThanOrEqual(box.x + 1)
    expect((await canvas.boundingBox())!.width, 'the canvas gives it room').toBeLessThan(wide)

    // another icon switches to its panel (only one at a time); the same icon hides it
    await bar.getByRole('button', { name: 'Tree', exact: true }).click()
    await expect(panel).toHaveCount(1)
    await expect(panel).toContainText('Tree')
    await expect(elements).toHaveAttribute('aria-pressed', 'false')
    await bar.getByRole('button', { name: 'Tree', exact: true }).click()
    await expect(panel).toHaveCount(0)
    expect((await canvas.boundingBox())!.width).toBeCloseTo(wide, 0)

    // the close button in the panel's header hides it too
    await bar.getByRole('button', { name: 'Customize', exact: true }).click()
    await expect(panel).toBeVisible()
    await p.getByTestId('editor-panel-close').click()
    await expect(panel).toHaveCount(0)

    // the bar stays at the right edge whatever is open, and the App Config tool is only offered in app mode
    await expect(bar.getByRole('button', { name: 'App Config', exact: true })).toBeHidden()
    expect(Math.round((await bar.boundingBox())!.x + (await bar.boundingBox())!.width)).toBeGreaterThanOrEqual(1398)
  } finally {
    await api.delete(`/whoobe-one/pages/${id}`)
  }
})
