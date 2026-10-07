// Customize > Border: the sliders must be able to give 1px (`border`, `border-t`, ...) and not only 2/4/8. The leftmost
// step used to be `border` itself, the same position as "no class", so the slider never fired for it.
import { test, expect, EDITOR_URL, ADMIN_URL, pageContent } from './fixtures'

const paragraph = () => ({ id: 'p1', element: 'p', tag: 'p', type: 'text', label: 'Paragraph', editable: true, content: 'border me', blocks: [], css: { css: 'text-sm', container: '' } })

test('the border sliders reach 1px, and "none" removes the class', async ({ api, authed, tag }) => {
  const page = await api.post('/whoobe-one/pages', { slug: `bd-${tag}`, title: `bd ${tag}`, content: pageContent([paragraph()]) })
  expect(page.status, page.text.slice(0, 150)).toBe(201)
  const id = page.json.page.id
  try {
    const p = await authed.newPage()
    await p.goto(`${EDITOR_URL}/whoobe-one/editor?pageId=${id}&parentOrigin=${encodeURIComponent(ADMIN_URL)}`)
    const para = p.locator('p', { hasText: 'border me' }).first()
    await para.waitFor({ timeout: 15_000 })
    await para.click({ position: { x: 3, y: 3 } })
    await p.getByRole('button', { name: 'Customize', exact: true }).click()
    await p.getByRole('button', { name: 'border', exact: true }).first().click()

    const list = async () => ((await para.getAttribute('class')) ?? '').split(/\s+/).filter(Boolean)
    const borders = async () => (await list()).filter((c) => /^border(-[trbl])?(-\d+)?$/.test(c))
    // the sliders of the open group, in order: all, top, right, bottom, left
    const sliders = p.locator('input[type="range"]')
    const [all, top] = [sliders.nth(0), sliders.nth(1)]

    await all.focus()
    await p.keyboard.press('ArrowRight')
    expect(await borders(), 'the first step away from "none" is `border` (1px)').toEqual(['border'])
    await p.keyboard.press('ArrowRight')
    expect(await borders(), 'one width at a time').toEqual(['border-2'])
    await p.keyboard.press('ArrowLeft')
    await p.keyboard.press('ArrowLeft')
    expect(await borders(), 'the first position removes the class, it does not set a 0').toEqual([])
    await p.keyboard.press('ArrowRight')
    expect(await borders()).toEqual(['border'])

    // a side: with `border` on, taking the top slider to "none" must not add border-t-0 (that would remove the top edge)
    await top.focus()
    await p.keyboard.press('ArrowRight')
    expect(await borders(), 'the top slider reaches `border-t`').toEqual(['border', 'border-t'])
    await p.keyboard.press('ArrowRight')
    expect(await borders()).toEqual(['border', 'border-t-2'])
    await p.keyboard.press('ArrowLeft')
    await p.keyboard.press('ArrowLeft')
    expect(await borders(), 'top at "none": its class is gone, `border` stays, nothing is zeroed').toEqual(['border'])
    expect((await list()).some((c) => /-0$/.test(c))).toBe(false)
  } finally {
    await api.delete(`/whoobe-one/pages/${id}`)
  }
})
