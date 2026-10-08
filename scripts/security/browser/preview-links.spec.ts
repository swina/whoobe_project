// A page previewed by the editor mounted under /whoobe-one/ (the Docker stacks): the links stored in the page are
// the site's own absolute paths, root path included. They used to be followed as they are, which left the editor and
// landed on the dashboard (an empty page). Both kinds of link - an element's link and one inside the text.
import { test, expect, EDITOR_URL, ADMIN_URL, pageContent, richText } from './fixtures'

test('opened under the editor\'s mount point, the links of a previewed page stay inside it', async ({ api, authed, tag }) => {
  const root = `/linkroot${tag}`
  const site = await api.post('/whoobe-one/websites', { name: `Links ${tag}`, rootPath: root })
  expect(site.status, site.text.slice(0, 120)).toBe(201)
  const websiteId = site.json.website.id
  const second = `${root}/second-${tag}`
  const first = await api.post('/whoobe-one/pages', {
    slug: `/first-${tag}`, title: 'first', websiteId,
    content: pageContent([
      { ...richText('lnk', 'element link to the second page'), link: second },
      richText('inl', `inline <a href="${second}">link in the text</a>`),
    ]),
  })
  const other = await api.post('/whoobe-one/pages', { slug: `/second-${tag}`, title: 'second', websiteId, content: pageContent([richText('body', `second page body ${tag}`)]) })
  expect([first.status, other.status]).toEqual([201, 201])
  for (const r of [first, other]) await api.patch(`/whoobe-one/pages/${r.json.page.id}`, { published: true })
  try {
    const p = await authed.newPage()
    for (const label of ['element link to the second page', 'link in the text']) {
      await p.goto(`${EDITOR_URL}/whoobe-one${root}/first-${tag}`)
      const link = p.getByText(label).first()
      await link.waitFor({ timeout: 15_000 })
      // hovering shows the real address (the browser's status bar, and "copy link address")
      const anchor = p.locator('a', { hasText: label }).or(p.locator('a', { has: link })).first()
      await anchor.hover()
      expect(await anchor.getAttribute('href'), 'the address is prefixed before it is followed').toBe(`/whoobe-one${second}`)
      await Promise.all([p.waitForURL((u) => u.pathname === `/whoobe-one${second}`, { timeout: 15_000 }), link.click()])
      await expect(p.getByText(`second page body ${tag}`)).toBeVisible({ timeout: 15_000 })
    }
    // the dashboard has nothing at the unprefixed path: that is where the old behaviour ended up
    expect(new URL(p.url()).pathname.startsWith('/whoobe-one/')).toBe(true)
  } finally {
    for (const r of [first, other]) await api.delete(`/whoobe-one/pages/${r.json.page.id}`)
    await api.delete(`/whoobe-one/websites/${websiteId}`)
  }
})

// The preview address of a website is its root path on the host (the proxy sends it to the editor): the links stored in
// the page are already right and must be left alone - a prefix would take the visitor out of the website's address.
test('opened at the website\'s own address, the links are followed as they are', async ({ api, authed, tag }) => {
  const root = `/ownroot${tag}`
  const site = await api.post('/whoobe-one/websites', { name: `Own ${tag}`, rootPath: root })
  expect(site.status, site.text.slice(0, 120)).toBe(201)
  const websiteId = site.json.website.id
  const second = `${root}/second-${tag}`
  const first = await api.post('/whoobe-one/pages', {
    slug: `/first-${tag}`, title: 'first', websiteId,
    content: pageContent([{ ...richText('lnk', 'element link to the second page'), link: second }, richText('inl', `inline <a href="${second}">link in the text</a>`)]),
  })
  const other = await api.post('/whoobe-one/pages', { slug: `/second-${tag}`, title: 'second', websiteId, content: pageContent([richText('body', `second page body ${tag}`)]) })
  expect([first.status, other.status]).toEqual([201, 201])
  for (const r of [first, other]) await api.patch(`/whoobe-one/pages/${r.json.page.id}`, { published: true })
  try {
    const p = await authed.newPage()
    for (const label of ['element link to the second page', 'link in the text']) {
      await p.goto(`${EDITOR_URL}${root}/first-${tag}`)
      const link = p.getByText(label).first()
      await link.waitFor({ timeout: 15_000 })
      const anchor = p.locator('a', { hasText: label }).or(p.locator('a', { has: link })).first()
      await anchor.hover()
      expect(await anchor.getAttribute('href'), 'left as it is').toBe(second)
      await Promise.all([p.waitForURL((u) => u.pathname === second, { timeout: 15_000 }), link.click()])
      await expect(p.getByText(`second page body ${tag}`)).toBeVisible({ timeout: 15_000 })
    }
  } finally {
    for (const r of [first, other]) await api.delete(`/whoobe-one/pages/${r.json.page.id}`)
    await api.delete(`/whoobe-one/websites/${websiteId}`)
  }
})

