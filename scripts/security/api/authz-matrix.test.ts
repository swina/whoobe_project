// Plan 3.2: every route against anon / no-permission / read / write / users-manager users.
// Expected from routes.expected.json: anon -> 401 on guarded routes; a user lacking the
// permission -> 403; a user holding it must get past the guard (anything but 401/403).
// Admin is not swept (it holds every permission and some routes are destructive); requests use a
// zero UUID and empty bodies, so a request that gets past the guard fails validation or 404s.
import { describe, it, expect, beforeAll } from 'vitest'
import { clientFor, type Client } from '../lib/client'
import { SEEDED_ROLES, type RoleName } from '../lib/roles'
import { loadExpectedRoutes, concretePath } from '../lib/routes'

const routes = loadExpectedRoutes()
// Session-affecting or MFA routes are exercised in auth.test.ts, not swept.
const SKIP = /^\/auth\/(login|logout|mfa\/)/
// /health and /site-root are questions the infrastructure asks (a probe, the reverse proxy: /site-root answers 403 on purpose
// for "not a website"), not resources: they are in the route contract (route-drift) but not in this sweep
const sweep = routes.filter((r) => !SKIP.test(r.path) && r.path !== '/health' && r.path !== '/health/live' && r.path !== '/metrics' && r.path !== '/site-root')

const permsOf = (role: string) => SEEDED_ROLES.find((r) => r.name === role)?.permissionKeys ?? []
const clients = new Map<RoleName, Client>()

async function call(c: Client, r: { method: string; path: string }) {
  const body = ['POST', 'PUT', 'PATCH'].includes(r.method) ? {} : undefined
  return c.request(r.method, concretePath(r.path), { body })
}

beforeAll(async () => {
  for (const role of ['anon', 'none', 'read', 'write', 'users'] as RoleName[]) clients.set(role, await clientFor(role))
})

describe('anonymous access', () => {
  const guarded = sweep.filter((r) => r.access !== 'public')
  it.each(guarded.map((r) => [r.key, r] as const))('%s -> 401', async (_k, r) => {
    const res = await call(clients.get('anon')!, r)
    expect(res.status, res.text.slice(0, 120)).toBe(401)
  })
})

describe.each(['none', 'read', 'write', 'users'] as const)('role %s', (role) => {
  const have = permsOf(role)
  it.each(sweep.filter((r) => r.access !== 'public').map((r) => [r.key, r] as const))('%s', async (_k, r) => {
    const res = await call(clients.get(role)!, r)
    const allowed = r.access === 'auth' || (r.mode === 'any' ? r.permissions.some((p) => have.includes(p)) : r.permissions.every((p) => have.includes(p)))
    if (allowed) expect([401, 403], `${role} should pass the guard: ${res.text.slice(0, 120)}`).not.toContain(res.status)
    else expect(res.status, `${role} lacks ${r.permissions}: ${res.text.slice(0, 120)}`).toBe(403)
  })
})

describe('public routes stay reachable without credentials', () => {
  const pub = sweep.filter((r) => r.access === 'public' && r.method === 'GET' && !r.path.includes('*'))
  it.each(pub.map((r) => [r.key, r] as const))('%s is not 401/403', async (_k, r) => {
    const res = await call(clients.get('anon')!, r)
    expect([401, 403]).not.toContain(res.status)
  })
})
