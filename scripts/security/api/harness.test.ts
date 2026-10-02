// Phase 1 exit check: the harness itself works (target reachable, role users seeded,
// each role authenticates, the permission model answers as expected).
import { describe, it, expect } from 'vitest'
import { clientFor } from '../lib/client'
import { SEEDED_ROLES } from '../lib/roles'

describe('harness', () => {
  it('health is reachable without credentials', async () => {
    const res = await (await clientFor('anon')).get('/health')
    expect(res.status).toBe(200)
  })

  it('anonymous users are rejected on a protected route', async () => {
    const res = await (await clientFor('anon')).get('/auth/users')
    expect(res.status).toBe(401)
  })

  it.each(['admin', ...SEEDED_ROLES.map((r) => r.name)] as const)('role %s can log in', async (role) => {
    const c = await clientFor(role)
    const me = await c.get('/auth/me')
    expect(me.status).toBe(200)
  })

  it('role without users:manage is forbidden on /auth/users, admin is allowed', async () => {
    expect((await (await clientFor('none')).get('/auth/users')).status).toBe(403)
    expect((await (await clientFor('write')).get('/auth/users')).status).toBe(403)
    expect((await (await clientFor('admin')).get('/auth/users')).status).toBe(200)
  })
})
