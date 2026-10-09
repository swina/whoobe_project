// Function-level permissions (F-058): every content route that accepts a granular key (`pages:edit`, `snippets:delete` ...)
// is called by users that hold ONLY one granular key and nothing else. The user with the route's own key must get past the
// guard; users with a different action of the same area, and with a key of another area, must get 403. The routes that stay on
// the broad keys are covered by authz-matrix. Roles and users are created here and removed afterwards.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { Client, clientFor } from '../lib/client'
import { ROLE_USER_PASSWORD } from '../lib/config'
import { loadExpectedRoutes, concretePath } from '../lib/routes'

const tag = randomBytes(3).toString('hex')
const anyRoutes = loadExpectedRoutes().filter((r) => r.access === 'permission' && r.mode === 'any')
const granularOf = (r: { permissions: string[] }) => r.permissions[0] // the granular key is listed first, the broad key second
const keys = [...new Set(anyRoutes.map(granularOf))].sort()
const contextOf = (k: string) => k.split(':')[0]
const clients = new Map<string, Client>()
const cleanup: (() => Promise<unknown>)[] = []

async function call(c: Client, r: { method: string; path: string }) {
  const body = ['POST', 'PUT', 'PATCH'].includes(r.method) ? {} : undefined
  return c.request(r.method, concretePath(r.path), { body })
}

beforeAll(async () => {
  const admin = await clientFor('admin')
  for (const [i, key] of keys.entries()) {
    const role = await admin.post('/auth/roles', { name: `gran-${tag}-${i}`, description: `only ${key}`, permissionKeys: [key] })
    expect(role.status, `${key}: ${role.text.slice(0, 120)}`).toBe(201)
    cleanup.push(() => admin.delete(`/auth/roles/${role.json.role.id}`))
    const email = `gran-${tag}-${i}@sectest.local`
    const user = await admin.post('/auth/users', { email, password: ROLE_USER_PASSWORD, displayName: key, roleIds: [role.json.role.id] })
    expect(user.status, user.text.slice(0, 120)).toBe(201)
    cleanup.unshift(() => admin.delete(`/auth/users/${user.json.user.id}`))
    const c = new Client(undefined, email)
    await c.login(email, ROLE_USER_PASSWORD)
    clients.set(key, c)
  }
}, 120_000)
afterAll(async () => { for (const f of cleanup) { try { await f() } catch { /* best effort */ } } })

describe('the contract', () => {
  it('has granular routes for every area, and each granular key of those areas is used by at least one route', () => {
    expect(anyRoutes.length).toBeGreaterThan(80)
    expect(new Set(keys.map(contextOf))).toEqual(new Set(['websites', 'pages', 'snippets', 'themes', 'components', 'data_objects']))
    for (const k of keys) expect(anyRoutes.some((r) => granularOf(r) === k), k).toBe(true)
  })
  it('every such route also accepts the broad key that always covered it', () => {
    for (const r of anyRoutes) expect(['objects:read', 'objects:write'], r.key).toContain(r.permissions[1])
  })
})

describe('a user with only the route\'s own granular key', () => {
  it.each(anyRoutes.map((r) => [r.key, r] as const))('%s passes the guard', async (_k, r) => {
    const res = await call(clients.get(granularOf(r))!, r)
    expect([401, 403], res.text.slice(0, 120)).not.toContain(res.status)
  })
})

describe('users with another function', () => {
  it.each(anyRoutes.map((r) => [r.key, r] as const))('%s is refused to the other actions of the area and to another area', async (_k, r) => {
    const own = granularOf(r)
    const sameArea = keys.filter((k) => contextOf(k) === contextOf(own) && k !== own)
    const otherArea = keys.find((k) => contextOf(k) !== contextOf(own))!
    for (const k of [...sameArea, otherArea]) {
      const res = await call(clients.get(k)!, r)
      expect(res.status, `${k} must not reach ${r.key}: ${res.text.slice(0, 120)}`).toBe(403)
    }
  })
})
