// Websites > Paths: a path linked to a page has an edit button that opens that page in its own tab, on the editor.
import { test, expect, ADMIN_URL, pageContent } from './fixtures'

test('Websites > Paths: the pencil of a linked path opens the page in the editor; an unlinked path has none', async ({ api, authed, tag }) => {
  const site = await api.post('/whoobe-one/websites', { name: `PathEdit ${tag}`, rootPath: `/pathedit${tag}` })
  expect(site.status, site.text.slice(0, 120)).toBe(201)
  const websiteId = site.json.website.id
  try {
    const page = await api.post('/whoobe-one/pages', { slug: `about-${tag}`, title: `About ${tag}`, websiteId, content: pageContent([]) })
    expect(page.status, page.text.slice(0, 200)).toBe(201)
    const pageId = page.json.page.id
    const group = await api.post('/whoobe-one/website-paths', {
      websiteId, name: `Main ${tag}`,
      items: [{ label: `Linked ${tag}`, path: `about-${tag}`, pageId }, { label: `Free ${tag}`, path: `free-${tag}` }],
    })
    expect(group.status, group.text.slice(0, 200)).toBe(201)

    const p = await authed.newPage()
    await p.goto(`${ADMIN_URL}/`)
    await p.getByTestId('nav-item-websites').click()
    // the list has a Paths button per website: the one of the row that names this website
    const row = p.getByText(`PathEdit ${tag}`).first().locator('xpath=ancestor::*[.//button[normalize-space()="Paths"]][1]')
    await row.getByRole('button', { name: 'Paths', exact: true }).click()

    const linked = p.locator('div.group', { hasText: `Linked ${tag}` }).first()
    const free = p.locator('div.group', { hasText: `Free ${tag}` }).first()
    await expect(linked).toBeVisible({ timeout: 15_000 })
    await expect(free.getByTestId('path-edit-page')).toHaveCount(0)

    await linked.getByTestId('path-edit-page').click()
    // the page is open in its own tab: the title of the tab and of the header name it
    await expect(p.getByRole('heading', { name: `About ${tag}` })).toBeVisible({ timeout: 15_000 })
  } finally {
    await api.delete(`/whoobe-one/websites/${websiteId}`)
  }
})
