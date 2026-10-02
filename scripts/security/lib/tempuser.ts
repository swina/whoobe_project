// Throwaway users for session/lockout tests (so the seeded role users never get locked out).
import { randomBytes } from 'node:crypto'
import { Client, clientFor } from './client'
import { ROLE_USER_PASSWORD } from './config'
import { roleDbName } from './roles'

export interface TempUser { id: string; email: string; password: string }

export async function createTempUser(admin: Client, role: 'none' | 'read' | 'write' | 'users' = 'read'): Promise<TempUser> {
  const roles = (await admin.get('/auth/roles')).json.roles as { id: string; name: string }[]
  const roleId = roles.find((r) => r.name === roleDbName(role))!.id
  const email = `tmp-${randomBytes(4).toString('hex')}@sectest.local`
  const res = await admin.post('/auth/users', { email, password: ROLE_USER_PASSWORD, displayName: 'tmp', roleIds: [roleId] })
  if (res.status !== 201) throw new Error(`temp user: ${res.status} ${res.text.slice(0, 120)}`)
  return { id: res.json.user.id, email, password: ROLE_USER_PASSWORD }
}

export async function loginAs(u: TempUser): Promise<Client> {
  const c = new Client(undefined, u.email)
  await c.login(u.email, u.password)
  return c
}

export const adminClient = () => clientFor('admin')
