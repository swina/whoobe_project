// The Download element: tied to a file (an asset of the library or a URL). Without one it says so and stays inert; with one the
// preview renders a link that saves the file, and the Download section of Advanced is the place to set it.
import { test, expect, EDITOR_URL, ADMIN_URL, pageContent } from './fixtures'

const node = (id: string, image?: unknown) => ({
  id, tag: 'file', type: 'file', label: 'File', icon: 'download', element: 'button', editable: false, content: 'Get the brochure',
  css: { css: 'px-4 py-2 bg-indigo-600 text-white rounded', container: '' }, blocks: [], ...(image ? { image } : {}),
})

test('a Download element has a file source in Advanced; the preview links to it', async ({ api, authed, tag }) => {
  const page = await api.post('/whoobe-one/pages', { slug: `dl-${tag}`, title: `dl ${tag}`, content: pageContent([node('dl1')]) })
  expect(page.status, page.text.slice(0, 150)).toBe(201)
  const id = page.json.page.id
  try {
    const p = await authed.newPage()
    await p.setViewportSize({ width: 1400, height: 900 })
    await p.goto(`${EDITOR_URL}/whoobe-one/editor?pageId=${id}&parentOrigin=${encodeURIComponent(ADMIN_URL)}`)
    await p.locator('#dl1').waitFor({ timeout: 20_000 })

    await p.locator('#dl1').click()
    await p.getByRole('button', { name: 'Advanced', exact: true }).click()
    const source = p.getByTestId('download-source')
    if (!(await source.isVisible())) await p.getByText('Download', { exact: true }).first().click()
    await expect(source).toBeVisible({ timeout: 10_000 })
    await expect(p.getByTestId('download-empty')).toBeVisible()

    await source.fill('https://example.com/files/brochure.pdf')
    await source.blur()
    await expect(p.getByTestId('download-empty')).toHaveCount(0)
    await source.fill('/private/forms/cv.pdf')
    await source.blur()
    await expect(p.getByTestId('download-private')).toBeVisible()
    await source.fill('https://example.com/files/brochure.pdf')
    await source.blur()
    await expect(p.getByTestId('download-private')).toHaveCount(0)

    await p.getByRole('button', { name: 'Preview', exact: true }).first().click()
    const link = p.locator('a[download]', { hasText: 'Get the brochure' })
    await expect(link).toBeVisible({ timeout: 10_000 })
    await expect(link).toHaveAttribute('href', 'https://example.com/files/brochure.pdf')
    expect(await link.getAttribute('class')).toContain('bg-indigo-600')
  } finally {
    await api.delete(`/whoobe-one/pages/${id}`)
  }
})
