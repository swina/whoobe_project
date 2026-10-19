// A small CDN in front of the installation for the tests of the "cdn-origin" provider: it answers GET/HEAD /dam-asset/<key> the way a CDN that forwards to the
// asset service does, or the way a wrongly set-up one does (the dashboard's page for any path, a 404, a failure). It remembers what it was asked.
import { createServer, type Server } from 'node:http'
import { hostForContainers } from './mock-oidc'

export type CdnMode = 'ok' | 'html' | 'notfound' | 'error'

export async function startMockCdn(opts: { host?: string } = {}) {
  const host = opts.host ?? hostForContainers()
  const log: { method: string; path: string; query: string }[] = []
  const state = { mode: 'ok' as CdnMode }
  const server: Server = createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x')
    log.push({ method: req.method ?? '', path: u.pathname, query: u.search })
    if (state.mode === 'error') { res.writeHead(503); return res.end() }
    if (state.mode === 'notfound' || !u.pathname.startsWith('/dam-asset/')) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found') }
    if (state.mode === 'html') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end('<!doctype html><title>app</title>') }
    res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' })
    res.end(req.method === 'HEAD' ? undefined : Buffer.from('png'))
  })
  await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve))
  const base = `http://${host}:${(server.address() as { port: number }).port}`
  return { base, log, state, close: () => new Promise<void>((resolve) => server.close(() => resolve())) }
}
