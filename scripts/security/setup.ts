// vitest globalSetup: safety checks, wait for the stack, and (idempotently) seed the
// role users the suites log in as. Everything runs against the disposable stack only.
import { assertSafeTarget, TARGET } from './lib/config'
import { Client, clientFor } from './lib/client'
import { SEEDED_ROLES, roleEmail, roleDbName } from './lib/roles'
import { ROLE_USER_PASSWORD } from './lib/config'

async function waitForHealth(timeoutMs = 90_000) {
  const start = Date.now()
  let last = ''
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${TARGET}/health`)
      if (res.ok) return
      last = `status ${res.status}`
    } catch (e: any) {
      last = e?.cause?.code ?? e?.message ?? String(e)
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error(`core-api at ${TARGET} not healthy (${last}) - start it with scripts/security/stack.sh up`)
}

export default async function setup() {
  assertSafeTarget()
  await waitForHealth()

  const admin = await clientFor('admin')
  const existingRoles = (await admin.get('/auth/roles')).json?.roles ?? []
  const existingUsers = (await admin.get('/auth/users')).json?.users ?? []

  for (const r of SEEDED_ROLES) {
    let role = existingRoles.find((x: any) => x.name === roleDbName(r.name))
    if (!role) {
      const res = await admin.post('/auth/roles', { name: roleDbName(r.name), description: `security harness: ${r.name}`, permissionKeys: r.permissionKeys })
      if (res.status !== 201) throw new Error(`creating role ${r.name}: ${res.status} ${res.text.slice(0, 150)}`)
      role = res.json.role
    }
    if (!existingUsers.find((u: any) => u.email === roleEmail(r.name))) {
      const res = await admin.post('/auth/users', { email: roleEmail(r.name), password: ROLE_USER_PASSWORD, displayName: `sec ${r.name}`, roleIds: [role.id] })
      if (res.status !== 201) throw new Error(`creating user ${r.name}: ${res.status} ${res.text.slice(0, 150)}`)
    }
  }
}
