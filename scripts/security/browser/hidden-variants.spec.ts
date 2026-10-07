// An element with `lg:hidden` / `md:hidden` (a snippet that only shows on small screens, say) must stay visible and
// selectable on the canvas, like one with the bare `hidden` class: Tailwind runs for real in the editor, so the
// variant used to hide it at the editor's width and it could not be selected or edited any more. The published view is
// not touched: the classes stay on the element.
import { test, expect, EDITOR_URL, ADMIN_URL, pageContent, container, richText } from './fixtures'

const withClasses = (node: any, css: string) => ({ ...node, css: { css, container: '' } })

test('elements hidden by a responsive variant stay visible, selectable and in the tree', async ({ api, authed, tag }) => {
  const inner = richText('inner', 'inside the small-screen snippet')
  const snippet = withClasses(container('snip', [inner], 'flex'), 'flex lg:hidden p-2')
  const plain = withClasses(richText('plain', 'always hidden here'), 'hidden')
  const maxVariant = withClasses(richText('maxv', 'hidden below md'), 'max-md:hidden')
  const header = container('hdr', [snippet, plain, maxVariant], 'flex')
  const page = await api.post('/whoobe-one/pages', { slug: `hid-${tag}`, title: `hid ${tag}`, content: pageContent([header]) })
  expect(page.status, page.text.slice(0, 150)).toBe(201)
  const id = page.json.page.id
  try {
    const p = await authed.newPage()
    await p.setViewportSize({ width: 1400, height: 900 })        // above lg: `lg:hidden` is in force
    await p.goto(`${EDITOR_URL}/whoobe-one/editor?pageId=${id}&parentOrigin=${encodeURIComponent(ADMIN_URL)}`)

    const text = p.getByText('inside the small-screen snippet')
    await text.waitFor({ state: 'visible', timeout: 15_000 })    // used to stay hidden
    await expect(p.getByText('always hidden here')).toBeVisible()
    await expect(p.getByText('hidden below md')).toBeVisible()

    // the badge says how each one is hidden in the published view
    await expect(p.locator('span.font-mono', { hasText: /^lg:hidden$/ }).first()).toBeVisible()
    await expect(p.locator('span.font-mono', { hasText: /^max-md:hidden$/ }).first()).toBeVisible()
    await expect(p.locator('span.font-mono', { hasText: /^hidden$/ }).first()).toBeVisible()

    // ... and it can be selected: the element's own classes show in Advanced > Custom Classes
    await text.click()
    await p.getByRole('button', { name: 'Advanced', exact: true }).click()
    const custom = p.locator('textarea[placeholder^="e.g. flex"]').first()
    if (!(await custom.isVisible())) await p.getByText('Custom Classes', { exact: true }).first().click()
    await custom.waitFor({ timeout: 10_000 })

    // the tree lists everything on the page, hidden or not
    await p.getByRole('button', { name: 'Tree', exact: true }).click()
    await p.waitForTimeout(300)
    const rows = await p.locator('button.cursor-grab, [class*="cursor-grab"]').count()
    expect(rows, 'tree rows for header, snippet container, three elements').toBeGreaterThanOrEqual(5)
  } finally {
    await api.delete(`/whoobe-one/pages/${id}`)
  }
})
