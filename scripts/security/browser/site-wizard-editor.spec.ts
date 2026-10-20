// A generated site must be editable in the editor like one made by hand: the Custom CSS box shows the classes of the selected element, and what a person
// types there takes effect (docs/plans/ai/template-wizard.md). The editor's controls read and write `css.css`; the classes of a container used to be in
// `css.container`, so the box was empty and a class typed there lost to the generated one.
import { test, expect, EDITOR_URL, ADMIN_URL } from './fixtures'

const nodes = (n: any): any[] => [n, ...(n.blocks ?? []).flatMap(nodes)]

test('the classes of a generated element are in the Custom CSS box and a change of them takes effect on the canvas', async ({ api, authed, tag }) => {
  const brand = `Wz${tag}`
  const made = await api.post('/whoobe-one/websites/from-wizard', { answers: { name: `${brand} Ed`, sector: 'it', theme: { preset: 'blue-navy' }, font: 'sans', pages: [{ title: 'Home', blocks: [{ type: 'hero' }, { type: 'box-grid-3' }, { type: 'cta' }] }] } })
  expect(made.status, made.text.slice(0, 200)).toBe(201)
  const siteId = made.json.website.id
  try {
    const page = ((await api.get(`/whoobe-one/pages?websiteId=${siteId}`)).json.pages as any[])[0]
    const doc = page.content
    // every container keeps its structure in css.container and its classes in css.css; every element its classes in css.css
    for (const n of nodes(doc)) {
      if (n.type === 'container') expect(n.css.container, `container ${n.id}`).toMatch(/^flex( flex-(row|col))?$/)
      else expect(n.css.container, `element ${n.id}`).toBe('')
    }
    const section = doc.blocks[0]                                  // the hero: a section with the colours of the theme
    expect(section.css.css).toContain('bg-[#0B1F3A]')

    const p = await authed.newPage()
    await p.setViewportSize({ width: 1400, height: 900 })
    await p.goto(`${EDITOR_URL}/whoobe-one/editor?pageId=${page.id}&parentOrigin=${encodeURIComponent(ADMIN_URL)}`)
    const el = p.locator(`#${section.id}`)
    await el.waitFor({ timeout: 20_000 })
    expect(await el.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(11, 31, 58)')

    // select the container: the Custom CSS box shows its classes
    await el.click({ position: { x: 3, y: 3 } })
    const box = p.getByTestId('statusbar-custom-css')
    await expect(box).toHaveValue(/bg-\[#0B1F3A\]/)
    await expect(box).toHaveValue(/px-6/)

    // a change of the classes takes effect: the background becomes red
    const next = (await box.inputValue()).replace('bg-[#0B1F3A]', 'bg-[#FF0000]')
    await box.fill(next)
    await box.blur()
    await expect.poll(() => el.evaluate((e) => getComputedStyle(e).backgroundColor), { timeout: 10_000 }).toBe('rgb(255, 0, 0)')
    await expect(box).toHaveValue(/bg-\[#FF0000\]/)
    expect(await box.inputValue()).not.toContain('bg-[#0B1F3A]')

    // and a text element of the same page shows its own classes too
    const heading = nodes(doc).find((n) => n.element === 'h' && n.level === 1)
    await p.locator(`#${heading.id}`).click()
    await expect(box).toHaveValue(/text-4xl/)
  } finally {
    for (const t of ((await api.get(`/whoobe-one/websites/${siteId}/templates`)).json.templates ?? []) as any[]) await api.delete(`/whoobe-one/websites/${siteId}/templates/${t.id}`)
    for (const pg of ((await api.get(`/whoobe-one/pages?websiteId=${siteId}`)).json.pages ?? []) as any[]) await api.delete(`/whoobe-one/pages/${pg.id}`)
    await api.delete(`/whoobe-one/websites/${siteId}`)
    for (const s of ((await api.get('/whoobe-one/snippets')).json.snippets as any[]).filter((x) => x.name.startsWith(brand))) await api.delete(`/whoobe-one/snippets/${s.id}`)
    for (const t of ((await api.get('/whoobe-one/themes')).json.themes as any[]).filter((x) => x.name.startsWith(brand))) await api.delete(`/whoobe-one/themes/${t.id}`)
  }
})
