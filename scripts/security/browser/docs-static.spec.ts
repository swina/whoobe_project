// The static documentation site (`whoobe-publish --kind docs`): generated from the PUBLIC API of the stack, served by a plain
// web server under a base path, and used in a browser - navigation, "on this page", search in the browser, code highlighting,
// copied files, 404. The private document must not be anywhere in the output.
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'
import type { AddressInfo } from 'node:net'
import { test, expect, ASSET_TARGET, TARGET } from './fixtures'
import { png } from '../lib/png'
import { ROOT_DIR } from '../lib/config'

const MIME: Record<string, string> = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain' }

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) { const p = join(dir, f); statSync(p).isDirectory() ? walk(p, out) : out.push(p) }
  return out
}

test('a documentation website is published as static HTML that works without the CMS', async ({ api, page, tag }) => {
  const build = spawnSync('pnpm', ['--filter', '@whoobe-cms/publish', 'build'], { cwd: ROOT_DIR, encoding: 'utf8' })
  expect(build.status, build.stderr.slice(0, 300)).toBe(0)

  const assets = api.forBase(ASSET_TARGET)
  const folder = `/docsstatic-${tag}`
  const uploaded: string[] = []
  const up = async (rel: string, type: string, data: Uint8Array | string, isPublic = true) => {
    const r = await assets.upload('/api/v1/dam/upload', { pimcorePath: `${folder}/${rel}`, isPublic: String(isPublic) }, { file: { name: rel.split('/').pop() as string, type, data } })
    expect(r.status, `${rel}: ${r.text.slice(0, 100)}`).toBe(200)
    uploaded.push(`${folder}/${rel}`)
  }
  const site = await api.post('/whoobe-one/websites', { name: `Static ${tag}`, rootPath: `/docsstatic${tag}`, settings: { kind: 'docs', docs: { sourceFolder: folder, title: `Static docs ${tag}` } } })
  expect(site.status, site.text.slice(0, 120)).toBe(201)
  const siteId = site.json.website.id
  await up('index.md', 'text/markdown', `---\ntitle: Home ${tag}\n---\n# Home ${tag}\n\nStart with [install](guide/01-install.md) and see ![logo](img/logo.png).\n`)
  await up('guide/01-install.md', 'text/markdown', '# Install\n\n## Steps\n\n```bash\nnpm install whoobe\n```\n\n## Troubleshooting\n\nCheck the docker logs.\n\nSee the [missing page](nope.md).\n')
  await up('guide/02-usage.md', 'text/markdown', '# Usage\n\n:::tip Remember\nUse the search.\n:::\n')
  await up('secret.md', 'text/markdown', '# Secret\n\nsectest-private-marker-static\n', false)
  await up('img/logo.png', 'image/png', png(16, 16, 0x80))

  const out = mkdtempSync(join(tmpdir(), 'docs-static-'))
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    let rel = decodeURIComponent(url.pathname)
    if (!rel.startsWith('/docs/')) { res.writeHead(404); res.end('outside the base path'); return }
    rel = normalize(rel.slice('/docs/'.length))
    let file = join(out, rel)
    if (!file.startsWith(out)) { res.writeHead(403); res.end(); return }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    if (!existsSync(file)) { res.writeHead(404, { 'content-type': 'text/html' }); res.end(readFileSync(join(out, '404.html'))); return }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(readFileSync(file))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  try {
    const gen = spawnSync('node', ['packages/publish/bin/whoobe-publish.js', '--kind', 'docs', '--api-url', TARGET, '--asset-base-url', ASSET_TARGET, '--website-id', siteId, '--out-dir', out, '--base-path', '/docs', '--site-url', 'https://docs.sectest.local'], { cwd: ROOT_DIR, encoding: 'utf8' })
    expect(gen.status, gen.stdout + gen.stderr).toBe(0)
    expect(gen.stdout).toMatch(/3 page\(s\)/)
    expect(gen.stdout).toMatch(/broken link/)                      // the dead link of the install page is reported

    // the output: pages, assets, sitemap, nothing private anywhere
    const all = walk(out).map((f) => f.slice(out.length + 1)).sort()
    expect(all).toEqual(expect.arrayContaining(['index.html', 'guide/install/index.html', 'guide/usage/index.html', '404.html', 'assets/docs.css', 'assets/docs.js', 'assets/minisearch.js', 'assets/search-index.json', 'assets/hljs/highlight.min.js', 'sitemap.xml', 'robots.txt']))
    expect(all.some((f) => f.startsWith('assets/files/') && f.endsWith('-logo.png'))).toBe(true)
    for (const f of walk(out)) {
      if (/\.(png)$/.test(f)) continue
      expect(readFileSync(f, 'utf8'), f).not.toContain('sectest-private-marker-static')
    }
    expect(readFileSync(join(out, 'sitemap.xml'), 'utf8')).toContain('<loc>https://docs.sectest.local/docs/guide/install/</loc>')
    expect(existsSync(join(out, 'secret'))).toBe(false)

    // in a browser, served under /docs/ by a plain web server (no CMS involved from here on)
    await page.goto(`${origin}/docs/`)
    await expect(page.locator('h1')).toContainText(`Home ${tag}`)
    await expect(page.locator('img[alt="logo"]')).toBeVisible()
    expect(await page.locator('img[alt="logo"]').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), 'the copied image loads').toBe(true)
    await expect(page.locator('#nav')).toContainText('Install')
    await page.locator('.doc-content a', { hasText: 'install' }).click()
    await expect(page).toHaveURL(`${origin}/docs/guide/install/`)
    await expect(page.locator('#toc')).toContainText('Troubleshooting')
    await expect(page.locator('#nav a[aria-current=page]')).toHaveText('Install')
    await expect(page.locator('pre code.hljs')).toBeVisible({ timeout: 10_000 })               // highlighted by the library loaded for this page
    await expect(page.locator('pre .copy')).toHaveCount(1)
    await page.locator('#toc a', { hasText: 'Troubleshooting' }).click()
    expect(new URL(page.url()).hash).toBe('#troubleshooting')

    // search, in the browser, from the index file
    await page.goto(`${origin}/docs/`)
    await page.locator('#q').click()
    await page.locator('#q').fill('troubleshoting')                                             // a typo
    await expect(page.locator('#results a').first()).toContainText('Troubleshooting', { timeout: 10_000 })
    await page.locator('#q').press('Enter')
    await expect(page).toHaveURL(`${origin}/docs/guide/install/#troubleshooting`)
    await page.locator('#q').fill('sectest-private-marker')
    await expect(page.locator('#results')).toContainText('No results')

    // next page and the 404
    await page.goto(`${origin}/docs/guide/install/`)
    await page.getByRole('link', { name: /Usage →/ }).click()
    await expect(page.locator('.doc-admonition-tip')).toContainText('Use the search')
    await page.goto(`${origin}/docs/secret/`)
    await expect(page.locator('h1')).toHaveText('Page not found')
  } finally {
    server.close()
    rmSync(out, { recursive: true, force: true })
    for (const p of uploaded) await assets.request('DELETE', '/api/v1/dam/asset', { body: { pimcorePath: p } })
    await api.delete(`/whoobe-one/websites/${siteId}`)
  }
})
