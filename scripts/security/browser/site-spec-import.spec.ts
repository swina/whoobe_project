// A site specification is imported from the dashboard by a person with only a browser (docs/plans/ai/ai-site-spec.md, phase 2):
// get the material for the model, paste an answer that has a mistake, read the problem with its place, correct it, check, see what will be
// created, import it as a draft; then import it again to meet the names that exist (the person decides, nothing existing is touched).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect, ADMIN_URL } from './fixtures'
import { clientFor } from '../lib/client'
import { ROOT_DIR } from '../lib/config'

const example = (name: string): string => readFileSync(join(ROOT_DIR, 'docs/release/content/ai-site-spec/examples', `${name}.json`), 'utf8')

test('a person with only a browser goes from the answer of a model to a draft website, and meets the names that exist', async ({ api, authed, tag }) => {
  const brand = `Hb${tag}`
  // every name of the file gets the tag, so a run never meets what another left (the snippet "Visit call to action" has no brand in it)
  const text = example('cafe').replaceAll('Harbour', brand).replaceAll('Visit call to action', `${brand} call to action`)
  const created = { websites: [] as string[] }
  const p = await authed.newPage()
  await p.goto(`${ADMIN_URL}/`)
  await p.getByText('Websites', { exact: true }).first().click()

  try {
    // ---- the material: the instructions are offered to copy and to download
    await p.getByTestId('site-spec-open').click()
    await expect(p.getByTestId('site-spec-modal')).toBeVisible()
    await expect(p.getByTestId('site-spec-copy-instructions')).toBeVisible({ timeout: 15_000 })
    const [download] = await Promise.all([p.waitForEvent('download'), p.getByTestId('site-spec-download-instructions').click()])
    const fs = await import('node:fs')
    const body = fs.readFileSync((await download.path()) as string, 'utf8')
    expect(body).toContain('Instructions: write a Whoobe site specification')
    expect(body).toContain('"version": 1')
    await p.getByTestId('site-spec-copy-instructions').click()
    // the Clipboard API needs https or localhost; where it is refused the text is shown to select: one of the two must happen
    await expect(p.getByTestId('site-spec-copied').or(p.locator('textarea[readonly]'))).toBeVisible()
    await expect(p.getByTestId('site-spec-example-cafe')).toBeVisible()
    await expect(p.getByTestId('site-spec-example-cafe-bilingual')).toBeVisible()

    // ---- an answer that is not JSON, then one with a mistake: the place of each problem is in words
    await p.getByTestId('site-spec-text').fill('Sure! Here is your site: {')
    await p.getByTestId('site-spec-check').click()
    await expect(p.getByTestId('site-spec-problem')).toContainText('not valid JSON')

    const broken = JSON.parse(text)
    broken.pages[0].sections[0].children[0].children[2].text = ''          // a button with no text
    broken.pages[1].sections[0].children[0].children.push({ kind: 'link', text: 'Contact', href: '/contact' }) // a link to a page that is not in the file
    broken.layout.footer = 'nope'
    await p.getByTestId('site-spec-text').fill('```json\n' + JSON.stringify(broken, null, 2) + '\n```')   // a model often fences its answer
    await p.getByTestId('site-spec-check').click()
    const issues = p.getByTestId('site-spec-issue')
    await expect(issues).toHaveCount(3)
    await expect(p.getByTestId('site-spec-issues')).toContainText('a link needs visible text')
    await expect(p.getByTestId('site-spec-issues')).toContainText('page "Home", section 1')
    await expect(p.getByTestId('site-spec-issues')).toContainText('page "Menu"')
    await expect(p.getByTestId('site-spec-issues')).toContainText('"/contact", which is not a page of this file')
    await expect(p.getByTestId('site-spec-issues')).toContainText('no snippet has the key "nope"')
    await expect(p.getByTestId('site-spec-import')).toBeDisabled()
    expect((await api.get('/whoobe-one/websites')).json.websites.some((w: any) => w.name === `${brand} Coffee`)).toBe(false)

    // ---- the corrected answer: valid, and a summary of what will be created. Nothing is written by a check.
    await p.getByTestId('site-spec-text').fill(text)
    await p.getByTestId('site-spec-check').click()
    await expect(p.getByTestId('site-spec-summary')).toBeVisible()
    await expect(p.getByTestId('site-spec-summary')).toContainText('3 pages')
    await expect(p.getByTestId('site-spec-name')).toHaveValue(`${brand} Coffee`)
    await expect(p.getByTestId('site-spec-rootpath')).toHaveValue(`/${brand.toLowerCase()}-coffee`)
    await expect(p.getByTestId('site-spec-conflicts')).toHaveCount(0)
    expect((await api.get('/whoobe-one/websites')).json.websites.some((w: any) => w.name === `${brand} Coffee`)).toBe(false)

    // ---- import: a draft website, its pages unpublished, links under its root path
    await p.getByTestId('site-spec-import').click()
    await expect(p.getByTestId('website-created')).toBeVisible({ timeout: 30_000 })
    await p.getByTestId('website-created-close').click()
    await expect(p.getByTestId('site-spec-modal')).toHaveCount(0, { timeout: 30_000 })
    const sites = (await api.get('/whoobe-one/websites')).json.websites as any[]
    const site = sites.find((w) => w.name === `${brand} Coffee`)
    expect(site, 'the website exists').toBeTruthy()
    created.websites.push(site.id)
    expect(site.rootPath).toBe(`/${brand.toLowerCase()}-coffee`)
    const pages = (await api.get(`/whoobe-one/pages?websiteId=${site.id}`)).json.pages as any[]
    expect(pages.map((x) => x.slug).sort()).toEqual(['/', '/menu', '/visit'])
    expect(pages.every((x) => x.published === false)).toBe(true)

    // ---- the same file again: the root path is taken, the theme and the snippets exist (the import opened the new website: back to the list)
    await p.getByText('Websites', { exact: true }).first().click()
    await p.getByTestId('site-spec-open').click()
    await p.getByTestId('site-spec-text').fill(text)
    await p.getByTestId('site-spec-check').click()
    await expect(p.getByTestId('site-spec-taken')).toBeVisible()
    await expect(p.getByTestId('site-spec-import')).toBeDisabled()
    await expect(p.getByTestId('site-spec-conflict-theme')).toContainText(`"${brand}" exists`)
    await expect(p.getByTestId('site-spec-conflict-theme')).toContainText(`named "${brand} (2)"`)
    await expect(p.getByTestId('site-spec-conflict-snippet')).toHaveCount(3)

    // a different root path, the existing theme, new snippets under free names (the default)
    await p.getByTestId('site-spec-rootpath').fill(`/${brand.toLowerCase()}-two`)
    await p.getByTestId('site-spec-rootpath').blur()
    await expect(p.getByTestId('site-spec-taken')).toHaveCount(0)
    await p.getByTestId('site-spec-conflict-theme').getByText('Use the existing one').click()
    await expect(p.getByTestId('site-spec-summary')).toContainText(`${brand}`)
    await expect(p.getByTestId('site-spec-import')).toBeEnabled()
    const themesBefore = (await api.get('/whoobe-one/themes')).json.themes.length
    const snippetsBefore = (await api.get('/whoobe-one/snippets')).json.snippets.length
    await p.getByTestId('site-spec-import').click()
    await expect(p.getByTestId('website-created')).toBeVisible({ timeout: 30_000 })
    await p.getByTestId('website-created-close').click()
    await expect(p.getByTestId('site-spec-modal')).toHaveCount(0, { timeout: 30_000 })

    const second = ((await api.get('/whoobe-one/websites')).json.websites as any[]).find((w) => w.rootPath === `/${brand.toLowerCase()}-two`)
    expect(second, 'the second website exists').toBeTruthy()
    created.websites.push(second.id)
    const themes = (await api.get('/whoobe-one/themes')).json.themes as any[]
    expect(themes.length).toBe(themesBefore)                                 // the existing theme was used, none was added
    expect(second.themeId).toBe(themes.find((t) => t.name === brand).id)
    const snippets = (await api.get('/whoobe-one/snippets')).json.snippets as any[]
    expect(snippets.length).toBe(snippetsBefore + 3)                         // new snippets, under free names
    expect(snippets.filter((s) => s.name.startsWith(`${brand} header`)).map((s) => s.name).sort()).toEqual([`${brand} header`, `${brand} header (2)`])
    // the links of the second website carry its own root path
    const secondPages = (await api.get(`/whoobe-one/pages?websiteId=${second.id}`)).json.pages as any[]
    const links = JSON.stringify(secondPages.map((x) => x.content)).match(/"link":"[^"]*"/g) ?? []
    expect(links.filter((l) => l.startsWith('"link":"/')).every((l) => l.startsWith(`"link":"/${brand.toLowerCase()}-two`))).toBe(true)
  } finally {
    // clean up what the test made: both websites, the snippets and the theme of this tag
    // (deleting a website leaves its templates behind, and turns its pages into pages of no website, where a second '/' collides with the first: the
    //  website delete answers 500. Neither is this feature's to change; the test removes pages and templates itself first)
    for (const id of created.websites) {
      for (const t of ((await api.get(`/whoobe-one/websites/${id}/templates`)).json.templates ?? []) as any[]) await api.delete(`/whoobe-one/websites/${id}/templates/${t.id}`)
      for (const pg of ((await api.get(`/whoobe-one/pages?websiteId=${id}`)).json.pages ?? []) as any[]) await api.delete(`/whoobe-one/pages/${pg.id}`)
      await api.delete(`/whoobe-one/websites/${id}`)
    }
    for (const s of ((await api.get('/whoobe-one/snippets')).json.snippets as any[]).filter((x) => x.name.startsWith(brand))) await api.delete(`/whoobe-one/snippets/${s.id}`)
    for (const t of ((await api.get('/whoobe-one/themes')).json.themes as any[]).filter((x) => x.name.startsWith(brand))) await api.delete(`/whoobe-one/themes/${t.id}`)
  }
})

test('the routes are closed to anyone without the permission and the check writes nothing', async ({ api }) => {
  const anon = await clientFor('anon')
  expect((await anon.get('/whoobe-one/site-spec/material')).status).toBe(401)
  expect((await anon.post('/whoobe-one/websites/from-spec?dryRun=1', { spec: JSON.parse(example('cafe')) })).status).toBe(401)
  expect((await api.post('/whoobe-one/websites/from-spec', {})).status).toBe(400)
  expect((await api.post('/whoobe-one/websites/from-spec', { spec: [] })).status).toBe(400)
  // a body that is not a specification at all is refused before it is read
  const huge = { version: 1, filler: 'x'.repeat(4_100_000) }
  expect((await api.post('/whoobe-one/websites/from-spec?dryRun=1', { spec: huge })).status).toBe(413)
})
