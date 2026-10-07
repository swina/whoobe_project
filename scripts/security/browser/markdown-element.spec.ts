// Markdown element: the content is the Markdown source; the canvas shows it as HTML, "Edit content" opens a source
// editor with a live preview (paste Markdown there), and the published page carries the converted, sanitised HTML.
import { test, expect, EDITOR_URL, ADMIN_URL, pageContent, container } from './fixtures'

const SOURCE = '# Hello markdown\n\nSome **bold** and *italic* text.\n\n- item one\n- item two\n\n[a link](https://example.com)'
const md = (content: string) => ({
  ...container('md1', [], 'markdown'), type: 'element', editable: true, content, css: { css: 'space-y-3 [&_h1]:text-3xl', container: '' },
})

test('the Markdown element renders HTML on the canvas and is edited from its source', async ({ api, authed, tag }) => {
  const page = await api.post('/whoobe-one/pages', { slug: `md-${tag}`, title: `md ${tag}`, content: pageContent([md(SOURCE)]) })
  expect(page.status, page.text.slice(0, 150)).toBe(201)
  const id = page.json.page.id
  try {
    const p = await authed.newPage()
    await p.goto(`${EDITOR_URL}/whoobe-one/editor?pageId=${id}&parentOrigin=${encodeURIComponent(ADMIN_URL)}`)
    const el = p.locator('#md1')
    await el.locator('h1', { hasText: 'Hello markdown' }).waitFor({ timeout: 15_000 })
    await expect(el.locator('li')).toHaveCount(2)
    await expect(el.locator('strong')).toHaveText('bold')
    await expect(el.locator('a')).toHaveAttribute('href', 'https://example.com')
    expect(await el.getAttribute('contenteditable'), 'the rendered HTML is not editable in place').not.toBe('true')
    // the styling comes from the element's own Tailwind classes
    expect(await el.locator('h1').evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThan(24)

    // select it and open the source editor
    await el.click({ position: { x: 4, y: 4 } })
    await p.getByTitle('Edit content').click()
    const source = p.locator('textarea[placeholder^="# Title"]')
    await expect(source).toHaveValue(SOURCE)
    await source.fill('## Pasted heading\n\n1. first\n2. second\n\n`inline code`\n\n<script>window.__pwned=1</script>')
    const preview = p.locator('div.overflow-y-auto', { has: p.locator('h2') })
    await expect(preview.locator('h2')).toHaveText('Pasted heading')
    await expect(preview.locator('ol li')).toHaveCount(2)
    await expect(preview.locator('code')).toHaveText('inline code')
    expect(await p.evaluate(() => (window as any).__pwned), 'the source is sanitised, nothing runs').toBeUndefined()

    await p.getByRole('button', { name: 'Close' }).click()
    await expect(el.locator('h2')).toHaveText('Pasted heading')
    await expect(el.locator('h1')).toHaveCount(0)
  } finally {
    await api.delete(`/whoobe-one/pages/${id}`)
  }
})

test('the published page carries the converted HTML, the stored page keeps the source', async ({ api, tag }) => {
  const w = await api.post('/whoobe-one/websites', { name: `MD site ${tag}`, rootPath: `/md${tag}` })
  const websiteId = w.json.website.id
  const page = await api.post('/whoobe-one/pages', { slug: `/md-pub-${tag}`, title: 'md', content: pageContent([md(SOURCE + '\n\n<img src=x onerror=alert(1)>\n\n[bad](javascript:alert(2))')]), websiteId })
  await api.patch(`/whoobe-one/pages/${page.json.page.id}`, { published: true })
  try {
    const { Client } = await import('../lib/client')
    const r = await new Client().get(`/public/page/md-pub-${tag}?websiteId=${websiteId}`)
    expect(r.status).toBe(200)
    const node = JSON.stringify(r.json)
    expect(node).toContain('<h1>Hello markdown</h1>')
    expect(node).toContain('<li>item one</li>')
    expect(node).not.toContain('"tag":"markdown"')
    expect(node).not.toMatch(/onerror|javascript:/i)
    const stored = await api.get(`/whoobe-one/pages/${page.json.page.id}`)
    expect(JSON.stringify(stored.json)).toContain('# Hello markdown')
    expect(JSON.stringify(stored.json)).toContain('"tag":"markdown"')
  } finally {
    await api.delete(`/whoobe-one/pages/${page.json.page.id}`)
    await api.delete(`/whoobe-one/websites/${websiteId}`)
  }
})

test('the palette offers Markdown and inserts a working element', async ({ api, authed, tag }) => {
  const page = await api.post('/whoobe-one/pages', { slug: `md-pal-${tag}`, title: `md pal ${tag}`, content: pageContent([]) })
  expect(page.status, page.text.slice(0, 150)).toBe(201)
  const id = page.json.page.id
  try {
    const p = await authed.newPage()
    await p.goto(`${EDITOR_URL}/whoobe-one/editor?pageId=${id}&parentOrigin=${encodeURIComponent(ADMIN_URL)}`)
    await p.getByRole('button', { name: 'document' }).waitFor({ timeout: 15_000 })
    await p.getByRole('button', { name: 'Elements', exact: true }).click()
    await p.getByRole('button', { name: 'text', exact: true }).click()
    // the chips are dragged (dragula), not clicked: drop it on the page
    const chip = p.locator('[title="Markdown"]').first()
    await expect(chip).toBeVisible()
    const root = p.locator('[data-id="doc-root"]').first()
    const from = (await chip.boundingBox())!
    const to = (await root.boundingBox())!
    await p.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await p.mouse.down()
    await p.mouse.move(to.x + to.width / 2, to.y + 60, { steps: 12 })
    await p.mouse.up()
    // the starter text is rendered as HTML, styled by the element's own classes
    const h1 = p.locator('h1', { hasText: 'A title' })
    await h1.waitFor({ timeout: 10_000 })
    expect(await h1.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThan(24)
    await expect(p.locator('ul li').first()).toBeVisible()
  } finally {
    await api.delete(`/whoobe-one/pages/${id}`)
  }
})
