// Documentation sites through the real UI: the dashboard's manager (documents, editor with live preview, index) and the
// docs layout the editor application shows at the website's root path - signed in (private documents too) and not.
import { test, expect, ADMIN_URL, EDITOR_URL, ASSET_TARGET } from './fixtures'
import { png } from '../lib/png'

test('write a documentation site in the dashboard and read it in the docs layout', async ({ api, authed, browser, tag }) => {
  const assets = api.forBase(ASSET_TARGET)
  const folder = `/docsui-${tag}`
  const root = `/docsui${tag}`
  const up = async (rel: string, text: string, isPublic = true) => {
    const r = await assets.upload('/api/v1/dam/upload', { pimcorePath: `${folder}/${rel}`, isPublic: String(isPublic) }, { file: { name: rel.split('/').pop() as string, type: 'text/markdown', data: text } })
    expect(r.status, `${rel}: ${r.text.slice(0, 100)}`).toBe(200)
  }
  const site = await api.post('/whoobe-one/websites', { name: `Docs UI ${tag}`, rootPath: root, settings: { kind: 'docs', docs: { sourceFolder: folder, title: `Docs ${tag}` } } })
  expect(site.status, site.text.slice(0, 120)).toBe(201)
  const siteId = site.json.website.id
  let libraryAsset = ''
  const uploaded = ['index.md', 'guide/01-install.md', 'guide/02-usage.md', 'secret.md']
  await up('index.md', `---\ntitle: Welcome ${tag}\n---\n# Welcome ${tag}\n\nGo to [install](guide/01-install.md).\n`)
  await up('guide/01-install.md', `# Install\n\n## Steps\n\nRun it.\n\n## Troubleshooting\n\nWait.\n`)
  await up('guide/02-usage.md', `# Usage\n\nSee [install](01-install.md#steps).\n`)
  await up('secret.md', `# Secret\n\nonly for editors ${tag}\n`, false)
  try {
    // ---- the dashboard -------------------------------------------------------------------------------------
    const p = await authed.newPage()
    // the tabs stay mounted: scope to the one on screen
    const docTab = p.locator('[data-testid="docs-doc-tab"]:visible')
    const siteTab = p.locator('[data-testid="docs-site-tab"]:visible')
    const goSite = () => p.locator(`[data-tab-id="item:docsSite:${siteId}"]`).click()
    let dismissNext = false
    let asked = ''
    p.on('dialog', (d) => {
      if (dismissNext) { dismissNext = false; asked = d.message(); void d.dismiss(); return }
      void d.accept(d.type() === 'prompt' ? `extra/${tag}.md` : undefined)
    })
    await p.goto(`${ADMIN_URL}/`)
    await p.getByText('Websites', { exact: true }).first().click()
    await p.getByTestId(`docs-open-${siteId}`).click()
    await expect(siteTab.getByTestId('docs-row-guide/01-install.md')).toBeVisible({ timeout: 15_000 })
    await expect(siteTab.getByTestId('docs-row-secret.md')).toContainText('private')
    await expect(siteTab.getByTestId('docs-row-index.md')).toContainText('public')

    // edit a document: the preview follows the text, saving makes a new version
    await siteTab.getByTestId('docs-row-guide/02-usage.md').getByRole('button', { name: 'Edit' }).click()
    const text = docTab.getByTestId('docs-edit-text')
    await expect(text).toHaveValue(/# Usage/)
    await text.fill(`# Usage\n\nEdited ${tag}.\n\n## Tips\n\nSee [install](01-install.md#steps) and [missing](nope.md).\n`)
    await expect(docTab.getByTestId('docs-edit-preview')).toContainText(`Edited ${tag}`, { timeout: 10_000 })
    await expect(docTab.getByTestId('docs-edit-preview').locator('h2#tips')).toBeVisible()
    await expect(docTab.getByText(/link to "nope\.md": no such document/)).toBeVisible()      // a broken link is reported while writing

    // an image: uploaded from the dialog into the folder, with a width and a position; the path is relative to this document
    await docTab.getByTestId('docs-insert-image').click()
    await docTab.getByTestId('docs-image-src-upload').click()
    await docTab.getByTestId('docs-image-file').setInputFiles({ name: `shot-${tag}.png`, mimeType: 'image/png', buffer: Buffer.from(png(24, 24, 0x55)) })
    await expect(docTab.getByTestId('docs-image-alt')).toHaveValue(/shot/)
    await docTab.getByTestId('docs-image-width').selectOption('50%')
    await docTab.getByTestId('docs-image-position').selectOption('align:center')
    await expect(docTab.getByTestId('docs-image-markdown')).toContainText(`](../images/shot-${tag}.png){width=50% align=center}`)
    await docTab.getByTestId('docs-image-insert').click()
    await expect(text).toHaveValue(new RegExp(`!\\[shot[^\\]]*\\]\\(\\.\\./images/shot-${tag}\\.png\\)\\{width=50% align=center\\}`), { timeout: 15_000 })
    uploaded.push(`images/shot-${tag}.png`)
    const shown = docTab.getByTestId('docs-edit-preview').locator('img.doc-img-center')
    await expect(shown).toBeVisible({ timeout: 10_000 })
    expect(await shown.evaluate((i: HTMLImageElement) => i.getAttribute('style'))).toBe('width:50%')
    expect(await shown.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), 'the uploaded image loads').toBe(true)
    // a library image elsewhere is copied into the folder; a float with a custom width; an address stays an address
    await assets.upload('/api/v1/dam/upload', { pimcorePath: `/lib-${tag}/lib-${tag}.png`, isPublic: 'true' }, { file: { name: `lib-${tag}.png`, type: 'image/png', data: png(16, 16, 0x99) } })
    libraryAsset = `/lib-${tag}/lib-${tag}.png`
    await docTab.getByTestId('docs-insert-image').click()
    await docTab.getByTestId('docs-image-src-library').click()
    await docTab.getByTestId(`docs-image-lib-lib-${tag}.png`).click()
    await docTab.getByTestId('docs-image-width').selectOption('custom')
    await docTab.getByTestId('docs-image-custom-width').fill('120')
    await docTab.getByTestId('docs-image-position').selectOption('float:right')
    await expect(docTab.getByTestId('docs-image-markdown')).toContainText(`](../images/lib-${tag}.png){width=120px float=right}`)
    await docTab.getByTestId('docs-image-insert').click()
    await expect(text).toHaveValue(new RegExp(`lib-${tag}\\.png\\)\\{width=120px float=right\\}`), { timeout: 15_000 })
    uploaded.push(`images/lib-${tag}.png`)
    await docTab.getByTestId('docs-insert-image').click()
    await docTab.getByTestId('docs-image-src-url').click()
    await docTab.getByTestId('docs-image-url').fill('https://example.org/remote.png')
    await expect(docTab.getByTestId('docs-image-markdown')).toContainText('](https://example.org/remote.png)')
    await docTab.getByRole('button', { name: 'Cancel' }).click()
    await docTab.getByTestId('docs-edit-save').click()
    await expect(docTab.getByText(/· Saved$/)).toBeVisible({ timeout: 10_000 })
    await goSite()
    const tree = await api.get(`/docs-sites/${siteId}/tree`)
    expect(tree.json.files).toEqual(expect.arrayContaining([`images/shot-${tag}.png`, `images/lib-${tag}.png`]))

    // a new document (the prompt is answered with extra/<tag>.md)
    await siteTab.getByTestId('docs-new').click()
    await expect(docTab.getByTestId('docs-edit-text')).toHaveValue(/# /, { timeout: 10_000 })
    await docTab.getByTestId('docs-edit-text').fill(`# Extra ${tag}\n\nbody\n`)
    await docTab.getByTestId('docs-edit-save').click()
    await expect(docTab.getByText(/· Saved$/)).toBeVisible({ timeout: 10_000 })
    uploaded.push(`extra/${tag}.md`)
    await goSite()
    await expect(siteTab.getByTestId(`docs-row-extra/${tag}.md`)).toBeVisible({ timeout: 10_000 })

    // find a document: by title or path, and by what is written in it (the same index of words the site searches)
    await siteTab.getByTestId('docs-filter').fill('usage')
    await expect(siteTab.getByTestId('docs-row-guide/02-usage.md')).toBeVisible()
    await expect(siteTab.getByTestId('docs-row-guide/01-install.md')).toHaveCount(0)
    await siteTab.getByTestId('docs-filter').fill('troubleshoting')                     // a typo, in the text of one document only
    await expect(siteTab.getByTestId('docs-text-match-guide/01-install.md').first()).toBeVisible({ timeout: 15_000 })
    await siteTab.getByTestId('docs-text-match-guide/01-install.md').first().click()
    await expect(docTab.getByTestId('docs-edit-text')).toHaveValue(/Troubleshooting/, { timeout: 15_000 })
    // a tab with unsaved changes asks before it closes
    await docTab.getByTestId('docs-edit-text').fill('# changed\n')
    const closeBtn = p.locator(`[data-tab-id="item:docsDoc:${siteId}:guide/01-install.md"] button[title="Close tab"]`)
    dismissNext = true
    await closeBtn.click()
    expect(asked).toMatch(/unsaved changes/)
    await expect(closeBtn).toHaveCount(1)                                                // still open
    await closeBtn.click()                                                               // confirmed this time
    await expect(closeBtn).toHaveCount(0)
    await goSite()
    await siteTab.getByTestId('docs-filter').fill('')

    // the index: start from the folders, check it, save it as a hand-written index
    await siteTab.getByTestId('docs-tab-index').click()
    await p.getByRole('button', { name: 'Start from the folders' }).click()
    await expect(siteTab.getByTestId('docs-nav-text')).toHaveValue(/doc: guide\/01-install\.md/)
    await p.getByRole('button', { name: 'Check' }).click()
    await expect(p.getByText('The text is valid.')).toBeVisible()
    await siteTab.getByTestId('docs-nav-text').fill('- title: Start here\n  items:\n    - doc: guide/01-install.md\n      title: First step\n    - doc: guide/02-usage.md\n')
    await siteTab.getByTestId('docs-nav-save').click()
    await expect(p.getByText('written by hand')).toBeVisible({ timeout: 10_000 })
    uploaded.push('_nav.yml')
    await siteTab.getByTestId('docs-nav-text').fill('- title: [broken')
    await p.getByRole('button', { name: 'Check' }).click()
    await expect(p.getByText(/not valid YAML/)).toBeVisible()          // a broken index is never saved

    // publishing: the command for the static generator, with the site's id
    await siteTab.getByTestId('docs-tab-publish').click()
    await expect(siteTab.getByTestId('docs-publish-command')).toContainText('--kind docs')
    await expect(siteTab.getByTestId('docs-publish-command')).toContainText(`--website-id ${siteId}`)

    // ---- the docs layout (signed in: private documents included) --------------------------------------------
    const v = await authed.newPage()
    await v.goto(`${EDITOR_URL}/whoobe-one${root}/guide/install`)
    const content = v.getByTestId('docs-content')
    await expect(content.locator('h1')).toHaveText(/Install/, { timeout: 20_000 })
    await expect(v.getByTestId('docs-nav')).toContainText('Start here')           // the hand-written index
    await expect(v.getByTestId('docs-nav')).toContainText('First step')
    await expect(v.getByTestId('docs-toc')).toContainText('Steps')
    await expect(v.getByTestId('docs-toc')).toContainText('Troubleshooting')
    // previous/next follow the index; a link inside a document stays in the site
    await v.getByRole('link', { name: /Usage →|→/ }).first().click()
    await expect(content).toContainText(`Edited ${tag}`, { timeout: 15_000 })
    expect(new URL(v.url()).pathname).toBe(`/whoobe-one${root}/guide/usage`)
    const img = content.locator(`img.doc-img-center`)
    await expect(img).toBeVisible()
    expect(await img.evaluate((i: HTMLImageElement) => i.getAttribute('style'))).toBe('width:50%')
    expect(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), 'the image loads in the docs layout').toBe(true)
    await expect(content.locator('img.doc-img-float-right')).toBeVisible()
    await content.getByRole('link', { name: 'install', exact: true }).first().click()
    await expect(content.locator('h1')).toHaveText(/Install/, { timeout: 15_000 })
    // search: as you type, in the browser; a section result opens the page at that heading
    await v.goto(`${EDITOR_URL}/whoobe-one${root}/`)
    const box = v.getByTestId('docs-search')
    await box.click()
    await box.fill('troubleshoting')                                    // a typo is tolerated
    await expect(v.getByTestId('docs-result').first()).toContainText('Troubleshooting', { timeout: 15_000 })
    await expect(v.getByTestId('docs-result').first()).toContainText('Install')       // "page › section"
    await box.press('Enter')
    await expect(v.getByTestId('docs-content').locator('h1')).toHaveText(/Install/, { timeout: 15_000 })
    expect(new URL(v.url()).hash).toBe('#troubleshooting')
    await box.fill('only for editors')                                  // the private page is searchable when signed in
    await expect(v.getByTestId('docs-result').first()).toContainText('Secret', { timeout: 10_000 })
    await box.fill('zzzzqqq')
    await expect(v.getByText('No results for')).toBeVisible()
    // an editor sees the private document
    await v.goto(`${EDITOR_URL}/whoobe-one${root}/secret`)
    await expect(content).toContainText(`only for editors ${tag}`, { timeout: 15_000 })

    // ---- the same address, not signed in: the public site -------------------------------------------------
    const anon = await browser.newContext()
    const a = await anon.newPage()
    await a.goto(`${EDITOR_URL}/whoobe-one${root}/secret`)
    await expect(a.getByText('Document not found')).toBeVisible({ timeout: 20_000 })
    expect(await a.content()).not.toContain(`only for editors ${tag}`)
    await a.goto(`${EDITOR_URL}/whoobe-one${root}/guide/install`)
    await expect(a.getByTestId('docs-content').locator('h1')).toHaveText(/Install/, { timeout: 20_000 })
    await a.getByTestId('docs-search').fill('only for editors')                     // not signed in: the public index has no such page
    await expect(a.getByText('No results for')).toBeVisible({ timeout: 10_000 })
    await anon.close()
  } finally {
    for (const rel of uploaded) await assets.request('DELETE', '/api/v1/dam/asset', { body: { pimcorePath: `${folder}/${rel}` } })
    if (libraryAsset) await assets.request('DELETE', '/api/v1/dam/asset', { body: { pimcorePath: libraryAsset } })
    await api.delete(`/whoobe-one/websites/${siteId}`)
  }
})
