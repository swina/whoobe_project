/**
 * Canonical permission keys. Permissions are opaque "resource:action"
 * strings checked at runtime (`can('objects:publish')`), never role names -
 * see docs/plans/backend/auth-permissions-plan.md §3.3.
 */
export const PERMISSIONS = {
  OBJECTS_READ: 'objects:read',
  OBJECTS_WRITE: 'objects:write',
  OBJECTS_PUBLISH: 'objects:publish',
  OBJECTS_DELETE: 'objects:delete',
  ASSETS_UPLOAD: 'assets:upload',
  ASSETS_DELETE: 'assets:delete',
  WORKFLOWS_MANAGE: 'workflows:manage',
  USERS_MANAGE: 'users:manage',
  SETTINGS_MANAGE: 'settings:manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSION_KEYS: PermissionKey[] = Object.values(PERMISSIONS);

export const DEFAULT_ROLES = ['admin', 'editor', 'viewer'] as const;
export type DefaultRoleName = (typeof DEFAULT_ROLES)[number];

// Seed mapping: which default role gets which permissions out of the box.
// Purely a starting point - admins can reassign via role_permissions afterwards.
export const DEFAULT_ROLE_PERMISSIONS: Record<DefaultRoleName, PermissionKey[]> = {
  admin: ALL_PERMISSION_KEYS,
  editor: [
    PERMISSIONS.OBJECTS_READ,
    PERMISSIONS.OBJECTS_WRITE,
    PERMISSIONS.OBJECTS_PUBLISH,
    PERMISSIONS.ASSETS_UPLOAD,
    PERMISSIONS.ASSETS_DELETE,
  ],
  viewer: [PERMISSIONS.OBJECTS_READ],
};
