// Snippets list: the search input is usable (it used to collapse to a few pixels beside the category select) and a
// snippet can be locked/unlocked from the list.
import { test, expect, ADMIN_URL } from './fixtures'

test('search inputs of Snippets and Pages are wide enough; a snippet is locked from the list', async ({ api, authed, tag }) => {
  const made = await api.post('/whoobe-one/snippets', { name: `Lockable ${tag}`, category: 'sec', node: { id: 'n', blocks: [] } })
  const id = made.json.snippet.id
  try {
    const p = await authed.newPage()
    await p.setViewportSize({ width: 1300, height: 800 })
    await p.goto(`${ADMIN_URL}/`)

    await p.getByTestId('nav-item-snippets').click()
    const search = p.getByPlaceholder('Search by name...')
    await expect(search).toBeVisible()
    expect((await search.boundingBox())!.width, 'snippet search width').toBeGreaterThan(200)
    await search.fill(`Lockable ${tag}`)
    await expect(p.getByText(`Lockable ${tag}`).first()).toBeVisible()

    const lock = p.getByTestId(`snippet-lock-${id}`)
    await expect(lock).toHaveAttribute('aria-pressed', 'false')
    await lock.click()
    await expect(lock).toHaveAttribute('aria-pressed', 'true')
    expect((await api.get(`/whoobe-one/snippets/${id}`)).json.snippet.locked).toBe(true)
    await lock.click()
    await expect(lock).toHaveAttribute('aria-pressed', 'false')

    await p.getByTestId('nav-item-pages').click()
    const pages = p.getByPlaceholder('Search by title or slug...')
    await expect(pages).toBeVisible()
    expect((await pages.boundingBox())!.width, 'pages search width').toBeGreaterThan(200)
  } finally {
    await api.delete(`/whoobe-one/snippets/${id}`)
  }
})
