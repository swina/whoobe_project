// The Generate Website Wizard (docs/plans/ai/template-wizard.md, phase 2): a person with only a browser answers a few questions, sees the structure as boxes,
// checks what will be created and gets a draft website. The test goes through all the steps, uses a snippet of the library in a position, meets the names that
// exist on a second run, and checks what was stored: drafts, links under the root path, a contact form that is not connected.
import { test, expect, ADMIN_URL } from './fixtures'
import { clientFor } from '../lib/client'

const nodes = (n: any): any[] => [n, ...(n.blocks ?? []).flatMap(nodes)]

test('a person with only a browser goes from a few choices to a draft website, with a library snippet, and meets the names that exist', async ({ api, authed, tag }) => {
  const brand = `Wz${tag}`
  const root = `/${brand.toLowerCase()}-hotel`
  const created: string[] = []
  // a snippet of the library that stands for a hero
  const snippet = await api.post('/whoobe-one/snippets', { name: `${brand} hero`, category: 'Hero', node: { id: 'lib-hero', type: 'container', tag: 'flex', element: 'div', blocks: [{ id: 'lib-h1', type: 'element', tag: 'element', element: 'h', level: 1, content: 'Mine', css: { css: '', container: '' }, blocks: [] }], css: { css: '', container: '' } } })
  expect(snippet.status, snippet.text.slice(0, 100)).toBe(201)
  const p = await authed.newPage()
  await p.goto(`${ADMIN_URL}/`)
  await p.getByText('Websites', { exact: true }).first().click()

  try {
    await p.getByTestId('site-wizard-open').click()
    await expect(p.getByTestId('site-wizard')).toBeVisible()

    // ---- 1 basics: the next step needs a name
    await expect(p.getByTestId('wizard-next')).toBeDisabled()
    await p.getByTestId('wizard-site-name').fill(`${brand} Hotel`)
    await p.getByTestId('wizard-sector-tourism').click()
    await p.getByTestId('wizard-context').fill('boutique hotel')
    await expect(p.getByTestId('wizard-next')).toBeEnabled()
    await p.getByTestId('wizard-next').click()

    // ---- 2 look: a company colour that is not a colour stops the step; a good one, an accent and a serif font
    await p.getByTestId('wizard-background').fill('#12')
    await expect(p.getByTestId('wizard-colour-error')).toBeVisible()
    await expect(p.getByTestId('wizard-next')).toBeDisabled()
    await p.getByTestId('wizard-background').fill('#323932')
    await expect(p.getByTestId('wizard-colour-error')).toHaveCount(0)
    await p.getByTestId('wizard-accent').fill('#F5B942')
    await p.getByTestId('wizard-font-serif').click()
    await p.getByTestId('wizard-next').click()

    // ---- 3 pages: the structure of the sector is proposed; change it
    await expect(p.getByTestId('wizard-page-3')).toBeVisible()
    await expect(p.getByTestId('wizard-page-title-0')).toHaveValue('Home')
    await expect(p.getByTestId('wizard-page-title-3')).toHaveValue('Contact')
    await expect(p.getByTestId('wizard-page-3')).toContainText('not connected')          // the contact form says it is not connected
    await expect(p.getByTestId('wizard-preview')).toContainText('Contact form (not connected)')
    // pages can be folded, moved and looked at one by one in the structure
    await p.getByTestId('wizard-page-collapse-1').click()
    await expect(p.getByTestId('wizard-add-block-1')).toHaveCount(0)
    await p.getByTestId('wizard-page-collapse-1').click()
    await expect(p.getByTestId('wizard-add-block-1')).toBeVisible()
    await p.getByTestId('wizard-page-down-1').click()
    await expect(p.getByTestId('wizard-page-title-2')).toHaveValue('Rooms')              // swapped with "The area", which was below
    await p.getByTestId('wizard-page-up-2').click()
    await expect(p.getByTestId('wizard-page-title-1')).toHaveValue('Rooms')
    await p.getByTestId('wizard-page-focus-3').click()
    await expect(p.getByTestId('wizard-preview')).toContainText('Contact form (not connected)')
    await expect(p.getByTestId('wizard-preview')).not.toContainText('Banner')            // only the Contact page is shown
    await p.getByTestId('wizard-view-all').click()
    await p.getByTestId('wizard-add-block-0').selectOption({ label: `${brand} hero (Hero)` })   // a snippet of the library
    await expect(p.getByTestId('wizard-page-0')).toContainText(`${brand} hero`)
    await expect(p.getByTestId('wizard-page-0')).toContainText('your snippet')
    await p.getByTestId('wizard-page-remove-2').click()                                    // "The area" goes
    await expect(p.getByTestId('wizard-page-3')).toHaveCount(0)
    await p.getByTestId('wizard-add-page').click()
    await expect(p.getByTestId('wizard-page-3')).toBeVisible()
    await p.getByTestId('wizard-page-title-3').fill('Prices')
    await p.getByTestId('wizard-header-button').check()
    await p.getByTestId('wizard-page-title-1').fill('')                                    // a page needs a title
    await expect(p.getByTestId('wizard-next')).toBeDisabled()
    await p.getByTestId('wizard-page-title-1').fill('Rooms')
    await p.getByTestId('wizard-next').click()

    // ---- 4 texts: the placeholders; the AI is not offered yet
    await expect(p.getByTestId('wizard-texts-placeholder')).toBeChecked()
    await expect(p.getByTestId('wizard-texts-ai')).toBeDisabled()
    await p.getByTestId('wizard-next').click()

    // ---- 5 check: a summary, nothing written yet
    await expect(p.getByTestId('wizard-summary')).toBeVisible()
    await expect(p.getByTestId('wizard-summary')).toContainText('4 pages')
    await expect(p.getByTestId('wizard-site-name')).toHaveCount(0)                           // (the field of step 1 is gone; the one of the summary is wizard-name)
    await expect(p.getByTestId('wizard-name')).toHaveValue(`${brand} Hotel`)
    await expect(p.getByTestId('wizard-form-note')).toBeVisible()
    await expect(p.getByTestId('wizard-rootpath')).toHaveValue(root)
    await expect(p.getByTestId('wizard-conflicts')).toHaveCount(0)
    expect(((await api.get('/whoobe-one/websites')).json.websites as any[]).some((w) => w.name === `${brand} Hotel`)).toBe(false)

    await p.getByTestId('wizard-create').click()
    // the window that offers Preview (the site with its draft pages) and Manage (its settings)
    await expect(p.getByTestId('website-created')).toBeVisible({ timeout: 30_000 })
    expect(await p.getByTestId('website-created-preview').getAttribute('href')).toContain('draft=true')
    await p.getByTestId('website-created-manage').click()
    await expect(p.getByTestId('site-wizard')).toBeHidden({ timeout: 30_000 })               // the new website opens in a tab of its own (the wizard tab stays, hidden)
    const site = ((await api.get('/whoobe-one/websites')).json.websites as any[]).find((w) => w.name === `${brand} Hotel`)
    expect(site, 'the website exists').toBeTruthy()
    created.push(site.id)
    expect(site.rootPath).toBe(root)

    // ---- what was stored
    const pages = (await api.get(`/whoobe-one/pages?websiteId=${site.id}`)).json.pages as any[]
    expect(pages.map((x) => x.slug).sort()).toEqual(['/', '/contact', '/prices', '/rooms'])
    expect(pages.every((x) => x.published === false)).toBe(true)
    const home = pages.find((x) => x.slug === '/')
    expect(nodes(home.content).filter((n) => n.sourceSnippetId).map((n) => n.sourceSnippetId)).toEqual([snippet.json.snippet.id])
    const form = nodes(pages.find((x) => x.slug === '/contact').content).find((n) => n.element === 'form')
    expect(form.formConfig).toMatchObject({ enabled: false, targetClassId: '', notify: { enabled: false, recipientEmail: '' } })
    expect(form.data.attributes.action).toBe('')
    const links = pages.flatMap((x) => nodes(x.content)).filter((n) => n.element === 'a' && n.link && !/^(https?:|mailto:|tel:)/.test(n.link))
    expect(links.length).toBeGreaterThan(3)
    expect(links.filter((n) => !(n.link === root || n.link.startsWith(`${root}/`)))).toEqual([])
    const theme = ((await api.get('/whoobe-one/themes')).json.themes as any[]).find((t) => t.name === `${brand} Hotel theme`)
    expect(theme.colors.map((c: any) => c.hex)).toContain('#323932')
    expect(site.themeId).toBe(theme.id)

    // ---- the same answers again: the root path is taken, the theme and the snippets exist
    await p.getByText('Websites', { exact: true }).first().click()
    await p.getByTestId('site-wizard-open').click()
    await p.getByTestId('wizard-site-name').fill(`${brand} Hotel`)                           // (the wizard starts over after a creation; the sector suggestion is back)
    await p.getByTestId('wizard-next').click()
    await p.getByTestId('wizard-next').click()
    await p.getByTestId('wizard-next').click()
    await p.getByTestId('wizard-next').click()
    await expect(p.getByTestId('wizard-taken')).toBeVisible()
    await expect(p.getByTestId('wizard-create')).toBeDisabled()
    await expect(p.getByTestId('wizard-conflict-theme')).toContainText(`"${brand} Hotel theme" exists`)
    await p.getByTestId('wizard-rootpath').fill(`${root}-two`)
    await p.getByTestId('wizard-rootpath').blur()
    await expect(p.getByTestId('wizard-taken')).toHaveCount(0)
    await p.getByTestId('wizard-conflict-theme').getByText('Use the existing one').click()
    await expect(p.getByTestId('wizard-create')).toBeEnabled()
    const themesBefore = ((await api.get('/whoobe-one/themes')).json.themes as any[]).length
    await p.getByTestId('wizard-create').click()
    await expect(p.getByTestId('website-created')).toBeVisible({ timeout: 30_000 })
    await p.getByTestId('website-created-manage').click()
    await expect(p.getByTestId('site-wizard')).toBeHidden({ timeout: 30_000 })
    const second = ((await api.get('/whoobe-one/websites')).json.websites as any[]).find((w) => w.rootPath === `${root}-two`)
    expect(second, 'the second website exists').toBeTruthy()
    created.push(second.id)
    expect(((await api.get('/whoobe-one/themes')).json.themes as any[]).length).toBe(themesBefore)   // the existing theme was used
    expect(second.themeId).toBe(theme.id)
    // the first website and the snippet of the library were not touched
    expect(((await api.get('/whoobe-one/snippets')).json.snippets as any[]).find((s) => s.name === `${brand} hero`).node.blocks[0].content).toBe('Mine')
  } finally {
    // (deleting a website leaves its templates and turns its pages into pages of no website: the test removes them itself first)
    // a website made by a step that then failed is found by its name
    for (const w of ((await api.get('/whoobe-one/websites')).json.websites as any[]).filter((x) => x.name.startsWith(brand) && !created.includes(x.id))) created.push(w.id)
    for (const id of created) {
      for (const t of ((await api.get(`/whoobe-one/websites/${id}/templates`)).json.templates ?? []) as any[]) await api.delete(`/whoobe-one/websites/${id}/templates/${t.id}`)
      for (const pg of ((await api.get(`/whoobe-one/pages?websiteId=${id}`)).json.pages ?? []) as any[]) await api.delete(`/whoobe-one/pages/${pg.id}`)
      await api.delete(`/whoobe-one/websites/${id}`)
    }
    for (const s of ((await api.get('/whoobe-one/snippets')).json.snippets as any[]).filter((x) => x.name.startsWith(brand))) await api.delete(`/whoobe-one/snippets/${s.id}`)
    for (const t of ((await api.get('/whoobe-one/themes')).json.themes as any[]).filter((x) => x.name.startsWith(brand))) await api.delete(`/whoobe-one/themes/${t.id}`)
  }
})

test('the wizard routes: the options, the answers that are refused, the access, and a check that writes nothing', async ({ api, tag }) => {
  const anon = await clientFor('anon')
  expect((await anon.get('/whoobe-one/site-wizard/options')).status).toBe(401)
  expect((await anon.post('/whoobe-one/websites/from-wizard?dryRun=1', { answers: {} })).status).toBe(401)

  const opts = await api.get('/whoobe-one/site-wizard/options')
  expect(opts.status).toBe(200)
  expect(opts.json.sectors.map((s: any) => s.id)).toEqual(['it', 'food', 'consultant', 'insurance', 'tourism'])
  expect(opts.json.blocks.map((b: any) => b.type)).toEqual(['hero', 'banner', 'cta', 'box-grid-3', 'box-grid-6', 'form'])
  expect(opts.json.themes.map((t: any) => t.id)).toEqual(['dark', 'light', 'light-colors', 'blue-navy'])
  expect(opts.json.limits).toMatchObject({ maxPages: 4, maxBlocksPerPage: 10 })
  expect(opts.json.texts.ai.available).toBe(false)
  // the snippets are listed by name, category and block, never with their content
  for (const s of opts.json.snippets) expect(Object.keys(s).sort()).toEqual(['block', 'category', 'name'])

  const good = (over: Record<string, unknown> = {}) => ({ name: `Wz${tag} Api`, sector: 'food', theme: { preset: 'light' }, font: 'serif', pages: [{ title: 'Home', blocks: [{ type: 'hero' }, { type: 'form' }] }], ...over })
  const dry = await api.post('/whoobe-one/websites/from-wizard?dryRun=1', { answers: good() })
  expect(dry.status, dry.text.slice(0, 200)).toBe(200)
  expect(dry.json.dryRun).toBe(true)
  expect(dry.json.summary.pages).toHaveLength(1)
  expect(dry.json.website).toBeUndefined()
  expect(((await api.get('/whoobe-one/websites')).json.websites as any[]).some((w) => w.name.includes(`Wz${tag}`))).toBe(false)

  // answers that are refused say where
  for (const [bad, where] of [
    [good({ extra: 1 }), 'Unrecognized key'], [good({ sector: 'mining' }), 'sector'], [good({ theme: { background: 'red' } }), 'theme'],
    [good({ pages: [] }), 'pages'], [good({ pages: [1, 2, 3, 4, 5].map((i) => ({ title: `P${i}`, blocks: [] })) }), 'pages'],
    [good({ name: '<b>x</b>' }), 'name'], [good({ pages: [{ title: 'Home', blocks: [{ type: 'carousel' }] }] }), 'blocks'],
  ] as const) {
    const r = await api.post('/whoobe-one/websites/from-wizard?dryRun=1', { answers: bad })
    expect(r.status, JSON.stringify(bad).slice(0, 80)).toBe(400)
    expect(JSON.stringify(r.json.issues)).toContain(where)
  }
  expect((await api.post('/whoobe-one/websites/from-wizard', {})).status).toBe(400)
  expect((await api.post('/whoobe-one/websites/from-wizard', { answers: [] })).status).toBe(400)
  // a name the host answers to itself is refused with a reason
  const reserved = await api.post('/whoobe-one/websites/from-wizard?dryRun=1', { answers: good({ name: 'Settings' }) })
  expect(reserved.status).toBe(400)
  expect(JSON.stringify(reserved.json.issues)).toContain('answers to itself')
  // a snippet that is not in the library is refused, with its name
  const missing = await api.post('/whoobe-one/websites/from-wizard?dryRun=1', { answers: good({ pages: [{ title: 'Home', blocks: [{ snippet: `No such ${tag}`, category: 'hero' }] }] }) })
  expect(missing.status).toBe(400)
  expect(JSON.stringify(missing.json.issues)).toContain(`No such ${tag}`)
  // a body that is far too large is refused before it is read
  expect((await api.post('/whoobe-one/websites/from-wizard?dryRun=1', { answers: good({ filler: 'x'.repeat(210_000) }) })).status).toBe(413)
})
