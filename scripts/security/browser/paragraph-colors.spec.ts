// A paragraph with TipTap colours (inline styles on spans): selecting it on the canvas and then using any other
// control used to commit the canvas DOM on blur with every style="" removed, so the colours were lost and only the
// classes of the element were left. Nothing was typed: the blur alone did it.
import { test, expect, EDITOR_URL, ADMIN_URL, pageContent } from './fixtures'

const paragraph = (content: string) => ({ id: 'p1', element: 'p', tag: 'p', type: 'text', label: 'Paragraph', editable: true, content, blocks: [], css: { css: 'text-sm', container: '' } })

test('colours made in TipTap survive selecting the paragraph and using another control', async ({ api, authed, tag }) => {
  const html = 'plain <span style="color: #ff0000">red text</span> and <mark style="background-color: #fef08a">marked</mark>'
  const page = await api.post('/whoobe-one/pages', { slug: `col-${tag}`, title: `col ${tag}`, content: pageContent([paragraph(html)]) })
  expect(page.status, page.text.slice(0, 150)).toBe(201)
  const id = page.json.page.id
  try {
    const p = await authed.newPage()
    await p.goto(`${EDITOR_URL}/whoobe-one/editor?pageId=${id}&parentOrigin=${encodeURIComponent(ADMIN_URL)}`)
    const red = p.locator('span', { hasText: 'red text' }).first()
    await red.waitFor({ timeout: 15_000 })
    const colour = () => red.evaluate((e) => getComputedStyle(e).color)
    expect(await colour()).toBe('rgb(255, 0, 0)')

    // select the paragraph on the canvas (it takes the focus, it is contenteditable) ...
    await p.locator('p', { has: red }).first().click({ position: { x: 3, y: 3 } })
    // ... then use a control that is not the canvas: it blurs the paragraph
    await p.getByRole('button', { name: 'Advanced', exact: true }).click()
    const custom = p.locator('textarea[placeholder^="e.g. flex"]').first()
    if (!(await custom.isVisible())) await p.getByText('Custom Classes', { exact: true }).first().click()
    await custom.waitFor({ timeout: 10_000 })
    await custom.fill('text-base font-bold')
    await custom.blur()
    await p.waitForTimeout(500)

    expect(await colour(), 'the colour is still there after the blur').toBe('rgb(255, 0, 0)')
    expect(await p.locator('mark').first().evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(254, 240, 138)')
    // and the classes of the element were applied as well
    expect(await p.locator('p', { has: red }).first().getAttribute('class')).toContain('font-bold')
  } finally {
    await api.delete(`/whoobe-one/pages/${id}`)
  }
})

test('typing in the paragraph still commits the text and keeps the colours', async ({ api, authed, tag }) => {
  const html = 'plain <span style="color: #ff0000">red text</span>'
  const page = await api.post('/whoobe-one/pages', { slug: `col2-${tag}`, title: `col2 ${tag}`, content: pageContent([paragraph(html)]) })
  expect(page.status, page.text.slice(0, 150)).toBe(201)
  const id = page.json.page.id
  try {
    const p = await authed.newPage()
    await p.goto(`${EDITOR_URL}/whoobe-one/editor?pageId=${id}&parentOrigin=${encodeURIComponent(ADMIN_URL)}`)
    const red = p.locator('span', { hasText: 'red text' }).first()
    await red.waitFor({ timeout: 15_000 })
    const para = p.locator('p', { has: red }).first()
    await para.click()
    await p.keyboard.press('End')
    await p.keyboard.type(' typed-tail')
    await p.getByRole('button', { name: 'Advanced', exact: true }).click()
    await p.waitForTimeout(500)
    await expect(para).toContainText('typed-tail')
    expect(await red.evaluate((e) => getComputedStyle(e).color), 'the colour made in TipTap is kept').toBe('rgb(255, 0, 0)')
  } finally {
    await api.delete(`/whoobe-one/pages/${id}`)
  }
})
