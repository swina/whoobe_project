// A documentation website is exported and imported like any website (Settings > Websites > Export / Import), because part of its
// work is done in the dashboard (index, texts, images). Its content is the folder of the asset library: the zip carries every file
// of it - documents, images, the index - and the import puts them back, in a folder of their own when the original is taken.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, ADMIN_URL, ASSET_TARGET } from './fixtures'
import { png } from '../lib/png'

const py = (zip: string, code: string) => execFileSync('python3', ['-I', '-c', code, zip], { encoding: 'utf8', maxBuffer: 1 << 26 })

test('a documentation website is exported with its files and imported on a clean installation and as a copy', async ({ api, authed, tag }) => {
  const assets = api.forBase(ASSET_TARGET)
  const folder = `/docsexp-${tag}`
  const files = new Set<string>()
  const put = async (rel: string, type: string, data: Uint8Array | string, isPublic = true) => {
    const r = await assets.upload('/api/v1/dam/upload', { pimcorePath: `${folder}/${rel}`, isPublic: String(isPublic) }, { file: { name: rel.split('/').pop() as string, type, data } })
    expect(r.status, `${rel}: ${r.text.slice(0, 100)}`).toBe(200)
  }
  const wipe = async (dir: string) => {
    const all = (await assets.get('/api/v1/dam/assets')).json.assets as { pimcorePath: string }[]
    for (const a of all.filter((x) => x.pimcorePath.startsWith(`${dir}/`))) await assets.request('DELETE', '/api/v1/dam/asset', { body: { pimcorePath: a.pimcorePath } })
  }
  const site = await api.post('/whoobe-one/websites', { name: `Docs Export ${tag}`, rootPath: `/docsexp${tag}`, settings: { kind: 'docs', docs: { sourceFolder: folder, title: `Exp ${tag}` } } })
  expect(site.status, site.text.slice(0, 120)).toBe(201)
  const siteId = site.json.website.id
  const created: string[] = []
  await put('index.md', 'text/markdown', `# Home ${tag}\n\nSee ![logo](img/logo.png){width=40% align=center} and [install](guide/install.md).\n`)
  await put('guide/install.md', 'text/markdown', `# Install\n\nSteps for ${tag}.\n`)
  await put('secret.md', 'text/markdown', `# Secret\n\nprivate ${tag}\n`, false)
  await put('img/logo.png', 'image/png', png(14, 14, 0x42))
  await put('_nav.yml', 'application/yaml', `- title: Start\n  items:\n    - doc: guide/install.md\n      title: First step\n- doc: index.md\n`)
  const dir = mkdtempSync(join(tmpdir(), 'docs-export-'))
  const dialogs: string[] = []
  try {
    const p = await authed.newPage()
    p.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept() })
    await p.goto(`${ADMIN_URL}/`)
    await p.getByText('Websites', { exact: true }).first().click()

    // export: no question about the files (they are the content), and the zip holds every one of them with its visibility
    const [download] = await Promise.all([p.waitForEvent('download', { timeout: 60_000 }), p.getByTestId(`docs-export-${siteId}`).click()])
    const zip = join(dir, 'docs.zip')
    await download.saveAs(zip)
    expect(dialogs.some((m) => /Include the asset files/.test(m))).toBe(false)
    const manifest = JSON.parse(py(zip, "import sys,zipfile;print(zipfile.ZipFile(sys.argv[1]).read('bundle.json').decode())"))
    expect(manifest.website.settings).toMatchObject({ kind: 'docs', docs: { sourceFolder: folder } })
    expect(manifest.pages).toEqual([])
    const entries = manifest.assets.map((a: any) => [a.pimcorePath.slice(folder.length + 1), a.isPublic, !!a.file])
    expect(entries.sort()).toEqual([['_nav.yml', true, true], ['guide/install.md', true, true], ['img/logo.png', true, true], ['index.md', true, true], ['secret.md', false, true]])
    const logo = manifest.assets.find((a: any) => a.pimcorePath.endsWith('logo.png'))
    const bytes = Buffer.from(py(zip, `import sys,zipfile,base64;print(base64.b64encode(zipfile.ZipFile(sys.argv[1]).read(${JSON.stringify(logo.file)})).decode())`).trim(), 'base64')
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')

    // ---- another installation: nothing of it is here -> the files come back where they were
    await wipe(folder)
    await api.delete(`/whoobe-one/websites/${siteId}`)
    dialogs.length = 0
    await p.setInputFiles('input[type="file"][accept=".zip,.json"]', zip)
    await expect.poll(() => dialogs.length, { timeout: 90_000 }).toBeGreaterThanOrEqual(2)
    expect(dialogs[0]).toMatch(/Assets: 5 to store, 0 already here/)
    expect(dialogs[0]).toMatch(new RegExp(`Documentation: 5 file\\(s\\) go to ${folder}(\\n|$)`))   // the folder is free: the same one
    expect(dialogs[1]).toMatch(/Website imported as "Docs Export .* \(import [0-9a-f]+\)"\. Assets stored: 5\./)
    const sites = (await api.get('/whoobe-one/websites')).json.websites.filter((w: any) => w.name.startsWith(`Docs Export ${tag} (import`))
    expect(sites).toHaveLength(1)
    created.push(sites[0].id)
    expect(sites[0].settings.docs.sourceFolder).toBe(folder)
    const tree = (await api.get(`/docs-sites/${sites[0].id}/tree`)).json
    expect(tree.documents.map((d: any) => [d.path, d.isPublic]).sort()).toEqual([['guide/install.md', true], ['index.md', true], ['secret.md', false]])
    expect(tree.navSource).toBe('manual')
    expect(tree.nav.find((n: any) => n.title === 'Start').items[0].title).toBe('First step')
    const page = (await api.get(`/docs-sites/${sites[0].id}/preview/`)).json.page
    expect(page.html).toContain('class="doc-img doc-img-center" style="width:40%"')       // the relative image path and its attributes survived
    expect(page.warnings).toEqual([])

    // ---- a copy on the same installation: the folder is taken, so the copy gets a folder of its own
    dialogs.length = 0
    await p.setInputFiles('input[type="file"][accept=".zip,.json"]', zip)
    await expect.poll(() => dialogs.length, { timeout: 90_000 }).toBeGreaterThanOrEqual(2)
    expect(dialogs[0]).toContain(`Documentation: 5 file(s) go to ${folder}-import`)
    const all = (await api.get('/whoobe-one/websites')).json.websites.filter((w: any) => w.name.startsWith(`Docs Export ${tag} (import`))
    const copy = all.find((w: any) => w.id !== sites[0].id)
    expect(copy, 'a second website').toBeTruthy()
    created.push(copy.id)
    expect(copy.settings.docs.sourceFolder).toBe(`${folder}-import`)
    const copyTree = (await api.get(`/docs-sites/${copy.id}/tree`)).json
    expect(copyTree.documents.map((d: any) => d.path).sort()).toEqual(['guide/install.md', 'index.md', 'secret.md'])
    expect((await api.get(`/docs-sites/${copy.id}/preview/`)).json.page.warnings).toEqual([])    // images still resolve in the new folder

    // editing the copy leaves the original alone
    const edit = await assets.upload('/api/v1/dam/upload', { pimcorePath: `${folder}-import/guide/install.md`, isPublic: 'true' }, { file: { name: 'install.md', type: 'text/markdown', data: '# Install\n\nCHANGED in the copy\n' } })
    expect(edit.status).toBe(200)
    const original = (await api.get(`/docs-sites/${sites[0].id}/preview/guide/install`)).json.page.html as string
    expect(original).toContain(`Steps for ${tag}`)
    expect(original).not.toContain('CHANGED')
  } finally {
    rmSync(dir, { recursive: true, force: true })
    for (const id of [...created, siteId]) await api.delete(`/whoobe-one/websites/${id}`)
    await wipe(folder)
    await wipe(`${folder}-import`)
    files.clear()
  }
})
