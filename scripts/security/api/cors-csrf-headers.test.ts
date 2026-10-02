// Plan 3.5: CORS, CSRF and security headers of core-api (also 3.14 error disclosure sweep).
import { describe, it, expect, beforeAll } from 'vitest'
import { Client, clientFor } from '../lib/client'
import { known } from '../lib/known'
import { loadExpectedRoutes, concretePath } from '../lib/routes'

const EVIL = 'https://evil.example'
let admin: Client

beforeAll(async () => { admin = await clientFor('admin') })

describe('CORS', () => {
  // F-011: `cors({ origin: true, credentials: true })` reflects any Origin with credentials allowed.
  known('F-011', 'an unknown origin does not get credentialed access (authenticated route)', async () => {
    const r = await admin.get('/auth/me', { origin: EVIL })
    const acao = r.headers.get('access-control-allow-origin')
    const cred = r.headers.get('access-control-allow-credentials')
    expect(acao === EVIL && cred === 'true', `ACAO=${acao} ACAC=${cred}`).toBe(false)
  })

  known('F-011', 'an unknown origin does not get credentialed access (preflight)', async () => {
    const r = await new Client().request('OPTIONS', '/whoobe-one/websites', {
      headers: { origin: EVIL, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
    })
    const acao = r.headers.get('access-control-allow-origin')
    const cred = r.headers.get('access-control-allow-credentials')
    expect(acao === EVIL && cred === 'true', `ACAO=${acao} ACAC=${cred}`).toBe(false)
  })

  it('never answers Access-Control-Allow-Origin: * together with credentials', async () => {
    const r = await new Client().get('/health', { origin: EVIL })
    expect(!(r.headers.get('access-control-allow-origin') === '*' && r.headers.get('access-control-allow-credentials') === 'true')).toBe(true)
  })

  known('F-011', 'the null origin is not trusted with credentials', async () => {
    const r = await admin.get('/auth/me', { origin: 'null' })
    expect(r.headers.get('access-control-allow-origin') === 'null' && r.headers.get('access-control-allow-credentials') === 'true').toBe(false)
  })
})

describe('CSRF (cookie auth, SameSite=Lax)', () => {
  it('state-changing requests with a non-JSON content type do not succeed', async () => {
    const body = JSON.stringify({ name: 'csrf-probe-site' })
    for (const ct of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x']) {
      const r = await admin.request('POST', '/whoobe-one/websites', { rawBody: body, headers: { 'content-type': ct, origin: EVIL } })
      expect(r.status, ct).toBeGreaterThanOrEqual(400)
    }
  })

  it('no GET route has a state-changing name', () => {
    const risky = loadExpectedRoutes().filter((r) => r.method === 'GET' && /\/(delete|remove|logout|publish|unpublish|regenerate|reindex|clear|reset|revoke)\b/.test(r.path))
    expect(risky.map((r) => r.key)).toEqual([])
  })
})

describe('security headers', () => {
  const needed: [string, RegExp][] = [
    ['x-content-type-options', /nosniff/i],
    ['x-frame-options', /deny|sameorigin/i],
    ['referrer-policy', /.+/],
  ]

  known('F-014', 'does not advertise the framework (X-Powered-By)', async () => {
    const r = await new Client().get('/health')
    expect(r.headers.get('x-powered-by')).toBeNull()
  })

  // F-014: no helmet-style headers on core-api responses.
  known('F-014', 'API responses carry baseline security headers (nosniff, frame protection, referrer policy)', async () => {
    const r = await new Client().get('/health')
    const missing = needed.filter(([h, re]) => !re.test(r.headers.get(h) ?? '')).map(([h]) => h)
    expect(missing).toEqual([])
  })

  it('JSON responses declare a JSON content type (no sniffable text/html)', async () => {
    for (const p of ['/health', '/public/websites', '/auth/me']) {
      const r = await new Client().get(p)
      expect(r.headers.get('content-type') ?? '', p).toMatch(/application\/json/)
    }
  })
})

describe('error disclosure (GET routes with a malformed id, plan 3.14)', () => {
  const DB_TEXT = /Failed query|invalid input syntax|select ".*" from|params:|pg_|relation ".*" does not exist|at .*\(.*:\d+:\d+\)|node_modules/i

  known('F-018', 'no GET route answers 5xx / database text for a malformed id (admin session)', async () => {
    const leaks: string[] = []
    for (const r of loadExpectedRoutes().filter((x) => x.method === 'GET' && x.access !== 'public' && /:/.test(x.path))) {
      const res = await admin.get(concretePath(r.path).replace(/00000000-0000-4000-8000-000000000000/g, 'not-a-uuid'))
      if (res.status >= 500 || DB_TEXT.test(res.text)) leaks.push(`${r.key} -> ${res.status}`)
    }
    expect(leaks).toEqual([])
  })

  it('unknown routes and wrong methods give a clean 404/405 without internals', async () => {
    for (const [m, p] of [['GET', '/nope'], ['DELETE', '/health'], ['GET', '/..%2f..%2fetc/passwd'], ['GET', '/.env'], ['GET', '/.git/config']] as const) {
      const r = await new Client().request(m, p)
      expect([400, 401, 404, 405], `${m} ${p}`).toContain(r.status)
      expect(r.text).not.toMatch(DB_TEXT)
    }
  })
})
