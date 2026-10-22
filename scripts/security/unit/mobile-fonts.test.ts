// Custom fonts in the mobile app generator: the same listing and copy rules as the site generator (see publish-fonts.test.ts).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { fetchPublishedFonts, installCustomFonts, type ScaffoldOptions } from '../../../packages/mobile-app/src/cli'

const woff2 = Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(16)])
let server: Server
let base = ''

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/public/fonts') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ fonts: [
        { family: 'Acme Sans', weight: 400, style: 'normal', url: '/dam-asset/good.woff2' },
        { family: 'Acme Sans', weight: 700, style: 'normal', url: '/dam-asset/html.woff2' },
        { family: 'Evil', weight: 400, style: 'normal', url: 'https://evil.example/x' },
      ] }))
      return
    }
    if (req.url === '/dam-asset/good.woff2') { res.end(woff2); return }
    if (req.url === '/dam-asset/html.woff2') { res.end('<html>'); return }
    res.statusCode = 404; res.end()
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => { server.close() })

describe('mobile app custom fonts', () => {
  it('lists, copies the woff2 files only, and gives none when the server has no route', async () => {
    const faces = await fetchPublishedFonts(base)
    expect(faces.map((f) => f.weight)).toEqual([400, 700]) // the address that leaves /dam-asset/ was dropped
    expect(await fetchPublishedFonts(`${base}/nope`)).toEqual([])
    const outDir = await mkdtemp(join(tmpdir(), 'mfonts-'))
    try {
      const done = await installCustomFonts({ outDir, apiUrl: base, assetBaseUrl: base, fontFaces: faces } as unknown as ScaffoldOptions)
      expect(done.map((d) => d.file)).toEqual(['acme-sans-400.woff2'])
      expect(await readdir(join(outDir, 'public/fonts'))).toEqual(['acme-sans-400.woff2'])
    } finally { await rm(outDir, { recursive: true, force: true }) }
  })
})
