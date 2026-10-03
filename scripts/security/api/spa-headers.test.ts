// Plan 3.5 / 3.12: response headers of the two SPAs served by nginx (admin dashboard, editor). A Content-Security-Policy
// proper is not asserted: it is planned for the SaaS mode (see status-summary.md).
import { describe, it, expect } from 'vitest'
import { Client } from '../lib/client'

const ADMIN = process.env.SECURITY_TEST_ADMIN ?? 'http://localhost:3100'
const EDITOR = process.env.SECURITY_TEST_EDITOR ?? 'http://localhost:3106'

const get = (base: string, path: string) => new Client(base).get(path)

describe('admin dashboard (nginx)', () => {
  it('cannot be framed', async () => {
    const r = await get(ADMIN, '/')
    expect(r.status).toBe(200)
    expect(r.headers.get('x-frame-options')).toBe('DENY')
    expect(r.headers.get('content-security-policy')).toMatch(/frame-ancestors 'none'/)
  })

  it('sends the baseline headers and does not announce the nginx version', async () => {
    const r = await get(ADMIN, '/')
    expect(r.headers.get('x-content-type-options')).toBe('nosniff')
    expect(r.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(r.headers.get('permissions-policy')).toBeTruthy()
    expect(r.headers.get('server') ?? '').not.toMatch(/\d+\.\d+/)
  })

  it('keeps the headers on SPA fallbacks, assets and the /assets route', async () => {
    for (const p of ['/pages', '/does/not/exist', '/assets']) {
      const r = await get(ADMIN, p)
      expect(r.status, p).toBe(200)
      expect(r.headers.get('x-frame-options'), p).toBe('DENY')
      expect(r.text, p).toContain('<div id="app"')
    }
  })
})

describe('editor (nginx)', () => {
  it('may be embedded only by this host (and itself), never by "any"', async () => {
    const r = await get(EDITOR, '/whoobe-one/')
    expect(r.status).toBe(200)
    const csp = r.headers.get('content-security-policy') ?? ''
    expect(csp).toMatch(/^frame-ancestors /)
    expect(csp).toContain("'self'")
    expect(csp).toContain('localhost')
    // no bare wildcard and no scheme-only source: "http://host:*" (any port of this host) is fine, "*" or "https:" is not
    const sources = csp.replace(/^frame-ancestors\s+/, '').split(/\s+/)
    for (const src of sources) {
      expect(src, `source "${src}"`).not.toBe('*')
      expect(src, `source "${src}"`).not.toMatch(/^[a-z]+:$/)
    }
  })

  it('sends the baseline headers and keeps them on the /whoobe-one/ rewrite and its assets', async () => {
    for (const p of ['/', '/whoobe-one/', '/whoobe-one/editor']) {
      const r = await get(EDITOR, p)
      expect(r.headers.get('x-content-type-options'), p).toBe('nosniff')
      expect(r.headers.get('content-security-policy'), p).toMatch(/frame-ancestors/)
      expect(r.headers.get('server') ?? '', p).not.toMatch(/\d+\.\d+/)
    }
  })
})
