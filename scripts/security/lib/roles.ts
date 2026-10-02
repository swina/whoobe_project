// Roles/users the harness seeds (plan 3.2): from "no permissions" up to admin.
export type RoleName = 'anon' | 'none' | 'read' | 'write' | 'users' | 'admin'

export const SEEDED_ROLES: { name: Exclude<RoleName, 'anon' | 'admin'>; permissionKeys: string[] }[] = [
  { name: 'none', permissionKeys: [] },
  { name: 'read', permissionKeys: ['objects:read'] },
  { name: 'write', permissionKeys: ['objects:read', 'objects:write'] },
  { name: 'users', permissionKeys: ['users:manage'] },
]

export const roleEmail = (name: string) => `sec-${name}@sectest.local`
export const roleDbName = (name: string) => `sec-${name}`
