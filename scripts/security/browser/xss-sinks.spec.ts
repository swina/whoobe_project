// Plan 3.6: stored/reflected XSS in the browser sinks. Hostile markup is stored through the API (as an editor
// could) and then rendered by the real admin, editor and public page; nothing may execute (console canary and
// dialogs), while ordinary formatting must survive (positive control).
import { test, expect, EDITOR_URL, ADMIN_URL, payloads, clickJavascriptLinks, richText, pageContent } from './fixtures'

const richBlocks = (id: string) => [richText('ctl', '<b class="ctl">bold-ctl</b> <a href="https://example.com" class="ctl-a">ok</a>'), ...payloads(id).map((p, i) => richText(`t${i}`, p.html))]
const domControls = (p: import('@playwright/test').Page) => p.evaluate(() => ({
  bold: document.querySelectorAll('.ctl').length,
  link: document.querySelectorAll('a[href="https://example.com"]').length,
  imgX: document.querySelectorAll('img[src="x"]').length,
  jsLinks: document.querySelectorAll('a[href^="javascript:" i]').length,
  frames: document.querySelectorAll('iframe[srcdoc]').length,
  handlers: [...document.querySelectorAll('*')].filter((e) => [...e.attributes].some((a) => /^on/i.test(a.name))).length,
  scripts: document.querySelectorAll('script:not([src])').length,
}))

test.describe('rich text in authoring and public renderers', () => {
  test('the editor canvas does not execute stored rich text', async ({ api, authed, canary, tag }) => {
    const page = await api.post('/whoobe-one/pages', { slug: `xss-ed-${tag}`, title: `xss ed ${tag}`, content: pageContent(richBlocks(`editor-${tag}`)) })
    expect(page.status, page.text.slice(0, 150)).toBe(201)
    try {
      const p = await authed.newPage(); canary.attach(p)
      await p.goto(`${EDITOR_URL}/whoobe-one/editor?pageId=${page.json.page.id}&parentOrigin=${encodeURIComponent(ADMIN_URL)}`)
      await p.waitForSelector('.ctl', { timeout: 15_000 })         // the content did render
      await clickJavascriptLinks(p)
      await p.waitForTimeout(800)
      const dom = await domControls(p)
      expect(dom.bold, 'formatting survives').toBeGreaterThan(0)
      expect(dom.link, 'ordinary link survives').toBeGreaterThan(0)
      expect(dom.handlers + dom.jsLinks + dom.frames + dom.scripts, 'no handler attribute, javascript: link, srcdoc frame or inline script in the DOM').toBe(0)
      expect(canary.fired).toEqual([])
    } finally { await api.delete(`/whoobe-one/pages/${page.json.page.id}`) }
  })

  test('a published page rendered by the public route does not execute stored rich text', async ({ api, authed, canary, tag }) => {
    const w = await api.post('/whoobe-one/websites', { name: `XSS site ${tag}`, rootPath: `/xss${tag}` })
    const websiteId = w.json.website.id
    const page = await api.post('/whoobe-one/pages', { slug: `/pub-${tag}`, title: `pub ${tag}`, content: pageContent(richBlocks(`public-${tag}`)), websiteId })
    expect(page.status, page.text.slice(0, 150)).toBe(201)
    await api.patch(`/whoobe-one/pages/${page.json.page.id}`, { published: true })
    try {
      for (const url of [`${EDITOR_URL}/whoobe-one/xss${tag}/pub-${tag}`, `${EDITOR_URL}/whoobe-one/pub-${tag}?websiteId=${websiteId}`]) {
        const p = await authed.newPage(); canary.attach(p)
        await p.goto(url)
        await p.waitForSelector('.ctl', { timeout: 15_000 })
        await clickJavascriptLinks(p)
        await p.waitForTimeout(800)
        const dom = await domControls(p)
        expect(dom.handlers + dom.jsLinks + dom.frames + dom.scripts, url).toBe(0)
        await p.close()
      }
      expect(canary.fired).toEqual([])
    } finally {
      await api.delete(`/whoobe-one/pages/${page.json.page.id}`)
      await api.delete(`/whoobe-one/websites/${websiteId}`)
    }
  })

  test('the public API itself returns sanitised rich text', async ({ api, tag }) => {
    const w = await api.post('/whoobe-one/websites', { name: `API site ${tag}`, rootPath: `/api${tag}` })
    const websiteId = w.json.website.id
    const page = await api.post('/whoobe-one/pages', { slug: `/api-${tag}`, title: 'api', content: pageContent(richBlocks(`api-${tag}`)), websiteId })
    await api.patch(`/whoobe-one/pages/${page.json.page.id}`, { published: true })
    try {
      const { Client } = await import('../lib/client')
      const r = await new Client().get(`/public/page/api-${tag}?websiteId=${websiteId}`)
      expect(r.status).toBe(200)
      // every rich-text string of the page: no executable construct (an escaped copy inside an attribute value is inert)
      const strings: string[] = []
      const walk = (n: any): void => { if (n && typeof n === 'object') { if (typeof n.content === 'string') strings.push(n.content); Object.values(n).forEach(walk) } }
      walk(r.json)
      expect(strings.length).toBeGreaterThan(5)
      for (const html of strings) {
        expect(html).not.toMatch(/<(script|iframe|object|embed|form|input|style|link|meta|base|math|template|textarea)\b/i)
        expect(html.replace(/="[^"]*"/g, '=""')).not.toMatch(/\son[a-z]+\s*=/i)
        expect(html).not.toMatch(/javascript:/i)
      }
      expect(r.text).toContain('bold-ctl')
    } finally {
      await api.delete(`/whoobe-one/pages/${page.json.page.id}`)
      await api.delete(`/whoobe-one/websites/${websiteId}`)
    }
  })
})

test.describe('admin lists and previews render hostile names as text', () => {
  test('pages, snippets, data classes/objects, websites and users', async ({ api, authed, canary, tag }) => {
    test.setTimeout(300_000)
    const id = `admin-${tag}`
    const hostile = (n: string) => `${n} <img src=x onerror="console.log('__XSS__:${id}-${n}')"> <svg onload="console.log('__XSS__:${id}-${n}')">`
    const created: (() => Promise<unknown>)[] = []
    try {
      const pg = await api.post('/whoobe-one/pages', { slug: `xss-list-${tag}`, title: hostile('page'), content: pageContent([richText('a', 'x')]) })
      created.push(() => api.delete(`/whoobe-one/pages/${pg.json.page.id}`))
      const sn = await api.post('/whoobe-one/snippets', { name: hostile('snippet'), category: hostile('cat'), node: richText('s1', hostile('snipcontent')) })
      created.push(() => api.delete(`/whoobe-one/snippets/${sn.json.snippet.id}`))
      const cls = await api.post('/data-classes', { name: `XssCls${tag}`, label: hostile('class'), fields: [{ name: 'title', title: hostile('field'), fieldType: 'text' }] })
      created.push(() => api.delete(`/data-classes/${cls.json.class.id}`))
      const obj = await api.post('/data-objects', { classId: cls.json.class.id, key: hostile('key').slice(0, 120), attributes: { title: hostile('value') } })
      created.push(() => api.delete(`/data-objects/${obj.json.object.id}`))
      const w = await api.post('/whoobe-one/websites', { name: hostile('site'), rootPath: `/xl${tag}` })
      expect(w.status, w.text.slice(0, 120)).toBe(201)
      created.push(() => api.delete(`/whoobe-one/websites/${w.json.website.id}`))

      const p = await authed.newPage(); canary.attach(p)
      await p.goto(`${ADMIN_URL}/`); await p.waitForTimeout(2000)
      const open = async (name: string | RegExp) => {
        await p.locator('aside').getByText(name, { exact: typeof name === 'string' }).first().click({ timeout: 5000 })
        await p.waitForTimeout(1800)
        return (await p.locator('body').innerText())
      }
      // each list/preview is opened, and the hostile text must be on screen as text (positive control)
      expect(await open('Pages'), 'page title').toContain('page <img src=x')
      expect(await open('Snippets'), 'snippet name').toContain('snippet <img src=x')
      expect(await open('Websites'), 'website name').toContain('site <img src=x')
      expect(await open(/^class <img src=x/), 'class entry (sidebar) and its objects table').toContain('value <img src=x')
      for (const other of ['Themes', 'Components', 'Assets', 'Documents', 'Outgoing Mail', 'Roles/Users/Workspaces']) await open(other)
      await p.waitForTimeout(1000)

      expect(canary.fired).toEqual([])
    } finally { for (const f of created.reverse()) await f().catch(() => {}) }
  })
})

test.describe('data object fields', () => {
  test('markdown preview, wysiwyg and textarea fields do not execute stored markup (admin form and list)', async ({ api, authed, canary, tag }) => {
    const id = `fields-${tag}`
    const pl = payloads(id).map((p) => p.html).join('\n\n')
    const cls = await api.post('/data-classes', { name: `FldCls${tag}`, label: `FldCls${tag}`, fields: [
      { name: 'md', title: 'Markdown', fieldType: 'markdown' }, { name: 'wy', title: 'Wysiwyg', fieldType: 'wysiwyg' }, { name: 'ta', title: 'Text', fieldType: 'textarea' }] })
    const obj = await api.post('/data-objects', { classId: cls.json.class.id, key: `fldobj-${tag}`, attributes: { md: `# Title ctlmd\n\n${pl}`, wy: `<p>hello</p>${pl}`, ta: pl } })
    expect(obj.status, obj.text.slice(0, 120)).toBe(201)
    try {
      const p = await authed.newPage(); canary.attach(p)
      await p.goto(`${ADMIN_URL}/`); await p.waitForTimeout(2000)
      await p.locator('aside').getByText(`FldCls${tag}`, { exact: true }).first().click(); await p.waitForTimeout(2000)
      await p.getByText(`fldobj-${tag}`).first().click(); await p.waitForTimeout(2500)
      await p.getByRole('button', { name: 'Preview', exact: true }).first().click(); await p.waitForTimeout(1500)
      expect(await p.locator('body').innerText(), 'the markdown preview rendered').toContain('Title ctlmd')
      await clickJavascriptLinks(p)
      await p.waitForTimeout(800)
      const dom = await domControls(p)
      expect(dom.handlers + dom.jsLinks + dom.frames, 'no handler attribute, javascript: link or srcdoc frame').toBe(0)
      expect(canary.fired).toEqual([])
    } finally {
      await api.delete(`/data-objects/${obj.json.object.id}`)
      await api.delete(`/data-classes/${cls.json.class.id}`)
    }
  })
})
