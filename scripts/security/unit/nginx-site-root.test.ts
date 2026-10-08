// The proxy template decides, for every request no location claims by name, between the dashboard and a website's
// preview (the editor renders the page): core-api's GET /site-root answers 204 (the first path segment is a website's
// root path) or 403 (it is not). This runs the REAL template in a real nginx (Docker, host network, like the TLS test)
// in front of four stub upstreams and looks at where each kind of request ends up.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import { createServer as createNet, type AddressInfo } from 'node:net'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ROOT_DIR } from '../lib/config'

const freePort = () => new Promise<number>((resolve) => { const s = createNet(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as AddressInfo).port; s.close(() => resolve(p)) }) })

interface Stub { server: Server; port: number; seen: string[] }
async function stub(name: string, handler?: (url: string, headers: Record<string, unknown>) => number | undefined): Promise<Stub> {
  const seen: string[] = []
  const server = createServer((req, res) => {
    seen.push(req.url ?? '')
    const status = handler?.(req.url ?? '', req.headers)
    res.statusCode = status ?? 200
    res.end(status === 204 || status === 403 ? undefined : `${name} ${req.url}`)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  return { server, port: (server.address() as AddressInfo).port, seen }
}

const NGINX = process.env.TEST_NGINX_IMAGE ?? 'nginx:alpine'
let dir = ''
let admin: Stub, editor: Stub, core: Stub, asset: Stub, gateway: Stub
let listenUp = 0
let listenDown = 0
const containers: string[] = []

function render(corePort: number): string {
  return readFileSync(join(ROOT_DIR, 'deploy/nginx/_locations.conf.template'), 'utf8')
    .replaceAll('__ADMIN_PORT__', String(admin.port)).replaceAll('__CORE_API_PORT__', String(corePort))
    .replaceAll('__ASSET_PROCESSOR_PORT__', String(asset.port)).replaceAll('__GATEWAY_PORT__', String(gateway.port))
    .replaceAll('__WHOOBE_ONE_PORT__', String(editor.port)).replaceAll('__MAX_BODY__', '100M').replaceAll('__EDGE_LIMITS__', '')
}

function startNginx(name: string, port: number, corePort: number) {
  const inc = join(dir, `${name}.inc`)
  writeFileSync(inc, render(corePort))
  const conf = join(dir, `${name}.conf`)
  writeFileSync(conf, `events {}\nhttp {\n  access_log off;\n  server {\n    listen 127.0.0.1:${port};\n    include /etc/nginx/${name}.inc;\n  }\n}\n`)
  for (const f of [inc, conf]) chmodSync(f, 0o644)
  const r = spawnSync('docker', ['run', '-d', '--rm', '--name', name, '--network', 'host', '-v', `${conf}:/etc/nginx/nginx.conf:ro`, '-v', `${inc}:/etc/nginx/${name}.inc:ro`, NGINX], { encoding: 'utf8' })
  expect(r.status, r.stderr).toBe(0)
  containers.push(name)
}

async function waitUp(port: number) {
  for (let i = 0; i < 40; i++) {
    try { await fetch(`http://127.0.0.1:${port}/_nope`); return } catch { await new Promise((r) => setTimeout(r, 250)) }
  }
  throw new Error('nginx did not come up')
}
const get = async (port: number, path: string) => { const r = await fetch(`http://127.0.0.1:${port}${path}`); return { status: r.status, text: await r.text() } }

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'site-root-'))
  admin = await stub('ADMIN')
  editor = await stub('EDITOR')
  asset = await stub('ASSET')
  gateway = await stub('GATEWAY')
  // core-api: /site-root answers from X-Original-URI, anything else is "CORE <url>"
  core = await stub('CORE', (url, headers) => {
    if (!url.startsWith('/site-root')) return undefined
    const first = String(headers['x-original-uri'] ?? '').split('?')[0].split('/').filter(Boolean)[0]
    return first === 'my-site' ? 204 : 403
  })
  listenUp = await freePort()
  listenDown = await freePort()
  const dead = await freePort()   // nothing listens: core-api cannot be asked
  startNginx('wsr-up', listenUp, core.port)
  startNginx('wsr-down', listenDown, dead)
  await Promise.all([waitUp(listenUp), waitUp(listenDown)])
}, 120_000)

afterAll(async () => {
  for (const c of containers) spawnSync('docker', ['rm', '-f', c])
  for (const s of [admin, editor, core, asset, gateway]) s?.server.close()
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('website preview at its own root path', () => {
  it('a path under a website\'s root goes to the editor, with the URI untouched', async () => {
    editor.seen.length = 0
    for (const path of ['/my-site', '/my-site/', '/my-site/blog/article/x?locale=en']) {
      const r = await get(listenUp, path)
      expect(r.text, path).toBe(`EDITOR ${path}`)
    }
    expect(editor.seen).toEqual(['/my-site', '/my-site/', '/my-site/blog/article/x?locale=en'])
  })

  it('everything else is the dashboard: its home, its routes, another name, a longer name', async () => {
    for (const path of ['/', '/login', '/forgot-password', '/other-site/x', '/my-site-2/x', '/favicon.ico']) {
      expect((await get(listenUp, path)).text, path).toBe(`ADMIN ${path}`)
    }
  })

  it('the dashboard\'s built files are served without asking core-api', async () => {
    core.seen.length = 0
    expect((await get(listenUp, '/assets/index-abc.js')).text).toBe('ADMIN /assets/index-abc.js')
    expect(core.seen).toEqual([])
  })

  it('the names the proxy routes itself keep working: the editor under /whoobe-one/ (prefix removed), the API', async () => {
    expect((await get(listenUp, '/whoobe-one/editor?pageId=1')).text).toBe('EDITOR /editor?pageId=1')
    expect((await get(listenUp, '/auth/me')).text).toBe('CORE /auth/me')
    expect((await get(listenUp, '/api/v1/dam/info')).text).toBe('ASSET /api/v1/dam/info')
    expect((await get(listenUp, '/dam-asset/x.png')).text).toBe('ASSET /dam-asset/x.png')
  })

  it('the check is not reachable from outside', async () => {
    core.seen.length = 0
    const r = await get(listenUp, '/_whoobe_site_root')
    expect(r.status).toBe(404)           // `internal`: only nginx's own subrequests reach it
    expect(r.text).not.toContain('CORE')
    expect(core.seen).toEqual([])
  })

  it('when core-api cannot be asked the request goes to the dashboard, as before', async () => {
    expect((await get(listenDown, '/my-site/x')).text).toBe('ADMIN /my-site/x')
    expect((await get(listenDown, '/')).text).toBe('ADMIN /')
    expect((await get(listenDown, '/assets/a.js')).text).toBe('ADMIN /assets/a.js')
  })
})
