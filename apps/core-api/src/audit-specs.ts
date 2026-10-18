import { getRole, getUserWithRoles, PERMISSIONS, pickAllowed, type RoleWithPermissions, type UserWithRoles } from '@whoobe-cms/core/server';
import type { AuditSpec } from './audit.js';

// What is audited, route by route, and exactly which fields (docs/plans/system/audit-log-plan.md, section 4). Add a route here AND put
// `audited(AUDIT.<name>)` in its middleware list; the route-drift test fails for a changing route that has neither this nor a written reason
// in scripts/security/routes.expected.json.

const userFields = ['email', 'displayName', 'isActive', 'roleNames'] as const;
const roleFields = ['name', 'description', 'permissionKeys'] as const;

const userSnapshot = (u: UserWithRoles) => pickAllowed(u as unknown as Record<string, unknown>, userFields);
const roleSnapshot = (r: RoleWithPermissions) => pickAllowed(r as unknown as Record<string, unknown>, roleFields);
const userLabel = (u?: UserWithRoles | null) => u?.email;
const roleLabel = (r?: RoleWithPermissions | null) => r?.name;
const loadUser = (req: { params: Record<string, string> }) => getUserWithRoles(req.params.id);
const loadRole = (req: { params: Record<string, string> }) => getRole(req.params.id);

export const AUDIT = {
  userCreate: { action: 'user.create', kind: 'create', targetType: 'user', snapshot: userSnapshot, fromResponse: (b) => b?.user, targetLabel: userLabel } satisfies AuditSpec<UserWithRoles>,
  userUpdate: { action: 'user.update', kind: 'update', targetType: 'user', snapshot: userSnapshot, loadBefore: loadUser, fromResponse: (b) => b?.user, targetLabel: userLabel } satisfies AuditSpec<UserWithRoles>,
  userDelete: { action: 'user.delete', kind: 'delete', targetType: 'user', snapshot: userSnapshot, loadBefore: loadUser, targetLabel: userLabel } satisfies AuditSpec<UserWithRoles>,
  // the reset token and URL are in the answer: they are never read here, only the fact and the user
  userResetPassword: { action: 'user.reset_password', kind: 'event', targetType: 'user', loadBefore: loadUser, targetLabel: userLabel } satisfies AuditSpec<UserWithRoles>,
  roleCreate: { action: 'role.create', kind: 'create', targetType: 'role', snapshot: roleSnapshot, fromResponse: (b) => b?.role, targetLabel: roleLabel } satisfies AuditSpec<RoleWithPermissions>,
  roleUpdate: { action: 'role.update', kind: 'update', targetType: 'role', snapshot: roleSnapshot, loadBefore: loadRole, fromResponse: (b) => b?.role, targetLabel: roleLabel } satisfies AuditSpec<RoleWithPermissions>,
  roleDelete: { action: 'role.delete', kind: 'delete', targetType: 'role', snapshot: roleSnapshot, loadBefore: loadRole, targetLabel: roleLabel } satisfies AuditSpec<RoleWithPermissions>,
} as const;

export type AuditName = keyof typeof AUDIT;
