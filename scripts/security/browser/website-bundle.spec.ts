// Website bundle in the admin dashboard: Export builds a .zip with bundle.json and the asset files, Import reads it,
// stores the files that are missing here and links the new website to them. Driven through the real UI (the file
// handling is in the browser: apps/admin-dashboard/src/utils/website-bundle.ts).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, ADMIN_URL, ASSET_TARGET, pageContent } from './fixtures'
import { png } from '../lib/png'

const py = (zip: string, code: string) => execFileSync('python3', ['-I', '-c', code, zip], { encoding: 'utf8', maxBuffer: 1 << 26 })

test('export zips the asset file, import stores it again and rewrites the links', async ({ api, authed, tag }) => {
  const assets = api.forBase(ASSET_TARGET)
  const path = `/bundle-${tag}/logo.png`
  const bytes = png(12, 12, 0x40)
  const up = await assets.upload('/api/v1/dam/upload', { pimcorePath: path, isPublic: 'true' }, { file: { name: 'logo.png', type: 'image/png', data: bytes } })
  expect(up.status, up.text.slice(0, 150)).toBe(200)
  const oldAssetId = up.json.asset.id

  const site = await api.post('/whoobe-one/websites', { name: `Zip ${tag}`, rootPath: `/zip${tag}` })
  const siteId = site.json.website.id
  const page = await api.post('/whoobe-one/pages', { slug: `zip-${tag}`, title: `Zip ${tag}`, websiteId: siteId, content: pageContent([{ id: 'img1', element: 'img', blocks: [], image: { url: path, assetId: oldAssetId } }]) })
  expect(page.status, page.text.slice(0, 150)).toBe(201)

  const dir = mkdtempSync(join(tmpdir(), 'bundle-'))
  const dialogs: string[] = []
  const created: string[] = []
  try {
    const p = await authed.newPage()
    p.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept() })
    await p.goto(`${ADMIN_URL}/`)
    await p.getByText('Websites', { exact: true }).first().click()
    const row = p.locator('div', { hasText: `Zip ${tag}` }).filter({ has: p.getByRole('button', { name: 'Export' }) }).last()

    const [download] = await Promise.all([p.waitForEvent('download', { timeout: 30_000 }), row.getByRole('button', { name: 'Export' }).click()])
    const zip = join(dir, 'export.zip')
    await download.saveAs(zip)
    expect(dialogs[0]).toMatch(/Include the asset files/)

    const manifest = JSON.parse(py(zip, "import sys,zipfile;print(zipfile.ZipFile(sys.argv[1]).read('bundle.json').decode())"))
    expect(manifest.version).toBe(2)
    const entry = manifest.assets.find((a: any) => a.pimcorePath === path)
    expect(entry?.file, 'the asset entry names its file in the archive').toMatch(/^assets\//)
    const stored = py(zip, `import sys,zipfile,base64;print(base64.b64encode(zipfile.ZipFile(sys.argv[1]).read(${JSON.stringify(entry.file)})).decode())`).trim()
    expect(Buffer.from(stored, 'base64').equals(Buffer.from(bytes)), 'the file in the zip is the uploaded one, byte for byte').toBe(true)

    // another installation: the asset is not there
    await assets.request('DELETE', '/api/v1/dam/asset', { body: { pimcorePath: path } })
    expect((await assets.get('/api/v1/dam/assets')).json.assets.some((a: any) => a.pimcorePath === path)).toBe(false)

    dialogs.length = 0
    await p.setInputFiles('input[type="file"][accept=".zip,.json"]', zip)
    await expect.poll(() => dialogs.length, { timeout: 60_000 }).toBeGreaterThanOrEqual(2)
    expect(dialogs[0]).toMatch(/Assets: 1 to store, 0 already here/)
    expect(dialogs[1]).toMatch(/Website imported as "Zip .* \(import [0-9a-f]+\)"\. Assets stored: 1\./)

    const back = (await assets.get('/api/v1/dam/assets')).json.assets.find((a: any) => a.pimcorePath === path)
    expect(back, 'the asset is back').toBeTruthy()
    expect(back.id, 'with a new id').not.toBe(oldAssetId)
    // the DAM tree is built from folder records: the folder of an imported file has to exist, or the file is invisible
    const folders = (await assets.get('/api/v1/dam/folders')).json.folders.map((f: any) => f.path)
    expect(folders, 'the imported file\'s folder is in the DAM tree').toContain(`/bundle-${tag}`)
    const sites = (await api.get('/whoobe-one/websites')).json.websites.filter((w: any) => w.name.startsWith(`Zip ${tag} (import`))
    expect(sites).toHaveLength(1)
    created.push(sites[0].id)
    const imported = (await api.get(`/whoobe-one/websites/${sites[0].id}/export`)).json
    const img = imported.pages[0].content.blocks[0]
    expect(img.image.url).toBe(path)
    expect(img.image.assetId).toBe(back.id)
  } finally {
    rmSync(dir, { recursive: true, force: true })
    for (const id of [...created, siteId]) {
      const b = (await api.get(`/whoobe-one/websites/${id}/export`)).json
      for (const pg of b?.pages ?? []) await api.delete(`/whoobe-one/pages/${pg.id}`)
      await api.delete(`/whoobe-one/websites/${id}`)
    }
    await assets.request('DELETE', '/api/v1/dam/asset', { body: { pimcorePath: path } })
  }
})
