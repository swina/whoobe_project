// Custom fonts in the site generator (docs/plans/system/release-0.3-plan.md, A7): what is asked of the server, what is copied, what is written.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { fetchPublishedFonts, installCustomFonts, customFontsCss, isCustomFamily, type ScaffoldOptions } from '../../../packages/publish/src/cli'

const woff2 = Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(32)])
let server: Server
let base = ''
let listing: unknown = { fonts: [] }

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/public/fonts') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(listing)); return }
    if (req.url === '/dam-asset/good.woff2') { res.end(woff2); return }
    if (req.url === '/dam-asset/html.woff2') { res.end('<html>not a font</html>'); return }
    res.statusCode = 404; res.end()
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => { server.close() })

describe('fetchPublishedFonts', () => {
  it('keeps faces of the expected shape and drops the rest', async () => {
    listing = { fonts: [
      { family: 'Acme Sans', weight: 400, style: 'normal', url: '/dam-asset/good.woff2' },
      { family: 'Acme Sans', weight: 700, style: 'italic', url: '/dam-asset/good.woff2' },
      { family: 'Evil', weight: 400, style: 'normal', url: 'https://evil.example/x.woff2' },
      { family: 'Evil', weight: 400, style: 'normal', url: '@evil.example/x' },
      { family: 'Evil', weight: 400, style: 'normal', url: '/dam-asset/../../etc/passwd' },
      { family: 'A"};body{x:y', weight: 400, style: 'normal', url: '/dam-asset/good.woff2' },
      { family: 'Heavy', weight: 1e21, style: 'normal', url: '/dam-asset/good.woff2' },
      { family: 'Odd', weight: 450, style: 'normal', url: '/dam-asset/good.woff2' },
      null, 'x',
    ] }
    const faces = await fetchPublishedFonts(base)
    expect(faces.map((f) => `${f.family} ${f.weight}`)).toEqual(['Acme Sans 400', 'Acme Sans 700'])
  })
  it('gives none when the server has no such route or is not there', async () => {
    expect(await fetchPublishedFonts(`${base}/nope`)).toEqual([])
    expect(await fetchPublishedFonts('http://127.0.0.1:1')).toEqual([])
  })
})

describe('installCustomFonts', () => {
  it('copies woff2 files under public/fonts, leaves out what is not one, and the CSS names only the copied files', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'fonts-'))
    try {
      const opts = {
        outDir, apiUrl: base, assetBaseUrl: base,
        fontFaces: [
          { family: 'Acme Sans', weight: 400, style: 'normal', url: '/dam-asset/good.woff2' },
          { family: 'Acme Sans', weight: 700, style: 'italic', url: '/dam-asset/good.woff2' },
          { family: 'Acme Sans', weight: 300, style: 'normal', url: '/dam-asset/html.woff2' },
          { family: 'Acme Sans', weight: 200, style: 'normal', url: '/dam-asset/missing.woff2' },
        ],
      } as unknown as ScaffoldOptions
      const done = await installCustomFonts(opts)
      expect(done.map((d) => d.file)).toEqual(['acme-sans-400.woff2', 'acme-sans-700-italic.woff2'])
      expect((await readdir(join(outDir, 'public/fonts'))).sort()).toEqual(['acme-sans-400.woff2', 'acme-sans-700-italic.woff2'])
      expect((await readFile(join(outDir, 'public/fonts/acme-sans-400.woff2'))).equals(woff2)).toBe(true)
      const css = customFontsCss({ ...opts, customFonts: done } as ScaffoldOptions, '/blog')
      expect(css.split('\n')).toHaveLength(2)
      expect(css).toContain('src:url("/blog/fonts/acme-sans-400.woff2") format("woff2")')
      expect(css).not.toContain('300')
    } finally { await rm(outDir, { recursive: true, force: true }) }
  })
  it('does nothing without custom fonts', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'fonts-'))
    try {
      expect(await installCustomFonts({ outDir, apiUrl: base } as unknown as ScaffoldOptions)).toEqual([])
      expect(await readdir(outDir)).toEqual([])
      expect(customFontsCss({ outDir } as unknown as ScaffoldOptions, '')).toBe('')
    } finally { await rm(outDir, { recursive: true, force: true }) }
  })
})

describe('isCustomFamily', () => {
  it('matches a theme font written in the Google form, whatever its case', () => {
    const opts = { fontFaces: [{ family: 'Acme Sans', weight: 400, style: 'normal', url: '/dam-asset/x' }] } as unknown as ScaffoldOptions
    expect(isCustomFamily(opts, 'Acme+Sans')).toBe(true)
    expect(isCustomFamily(opts, 'acme sans')).toBe(true)
    expect(isCustomFamily(opts, 'Roboto')).toBe(false)
  })
})
