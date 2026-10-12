export const PERMISSIONS = {
  // Legacy flat keys (kept for backward compatibility with existing routes)
  OBJECTS_READ: 'objects:read',
  OBJECTS_WRITE: 'objects:write',
  OBJECTS_PUBLISH: 'objects:publish',
  OBJECTS_DELETE: 'objects:delete',
  ASSETS_UPLOAD: 'assets:upload',
  ASSETS_DELETE: 'assets:delete',
  WORKFLOWS_MANAGE: 'workflows:manage',
  USERS_MANAGE: 'users:manage',
  SETTINGS_MANAGE: 'settings:manage',

  // Granular context-scoped keys — <context>:<action>
  WEBSITES_LIST: 'websites:list',
  WEBSITES_VIEW: 'websites:view',
  WEBSITES_EDIT: 'websites:edit',
  WEBSITES_CREATE: 'websites:create',
  WEBSITES_DELETE: 'websites:delete',
  // Start a publication of a website from the dashboard (docs/plans/website/publish-from-dashboard.md)
  WEBSITES_PUBLISH: 'websites:publish',
  PAGES_LIST: 'pages:list',
  PAGES_VIEW: 'pages:view',
  PAGES_EDIT: 'pages:edit',
  PAGES_CREATE: 'pages:create',
  PAGES_DELETE: 'pages:delete',
  SNIPPETS_LIST: 'snippets:list',
  SNIPPETS_VIEW: 'snippets:view',
  SNIPPETS_EDIT: 'snippets:edit',
  SNIPPETS_CREATE: 'snippets:create',
  SNIPPETS_DELETE: 'snippets:delete',
  ASSETS_LIST: 'assets:list',
  ASSETS_VIEW: 'assets:view',
  ASSETS_EDIT: 'assets:edit',
  ASSETS_RENAME: 'assets:rename',
  DATA_OBJECTS_LIST: 'data_objects:list',
  DATA_OBJECTS_VIEW: 'data_objects:view',
  DATA_OBJECTS_EDIT: 'data_objects:edit',
  DATA_OBJECTS_CREATE: 'data_objects:create',
  DATA_OBJECTS_DELETE: 'data_objects:delete',
  THEMES_LIST: 'themes:list',
  THEMES_VIEW: 'themes:view',
  THEMES_EDIT: 'themes:edit',
  THEMES_CREATE: 'themes:create',
  THEMES_DELETE: 'themes:delete',
  COMPONENTS_LIST: 'components:list',
  COMPONENTS_VIEW: 'components:view',
  COMPONENTS_EDIT: 'components:edit',
  COMPONENTS_CREATE: 'components:create',
  COMPONENTS_DELETE: 'components:delete',

  // Gateway management
  GATEWAY_MANAGE: 'gateway:manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSION_KEYS: PermissionKey[] = Object.values(PERMISSIONS);

export const DEFAULT_ROLES = ['admin', 'editor', 'viewer', 'publisher'] as const;
export type DefaultRoleName = (typeof DEFAULT_ROLES)[number];

// Seed mapping: which default role gets which permissions out of the box.
export const DEFAULT_ROLE_PERMISSIONS: Record<DefaultRoleName, PermissionKey[]> = {
  admin: ALL_PERMISSION_KEYS,
  editor: [
    // The flat keys are what the routes actually check (F-058): without them the role could not read or save anything.
    // Publishing, deleting, settings and users stay with the administrator.
    PERMISSIONS.OBJECTS_READ,
    PERMISSIONS.OBJECTS_WRITE,
    PERMISSIONS.WEBSITES_LIST,
    PERMISSIONS.WEBSITES_VIEW,
    PERMISSIONS.WEBSITES_EDIT,
    PERMISSIONS.PAGES_LIST,
    PERMISSIONS.PAGES_VIEW,
    PERMISSIONS.PAGES_EDIT,
    PERMISSIONS.PAGES_CREATE,
    PERMISSIONS.SNIPPETS_LIST,
    PERMISSIONS.SNIPPETS_VIEW,
    PERMISSIONS.SNIPPETS_EDIT,
    PERMISSIONS.SNIPPETS_CREATE,
    PERMISSIONS.ASSETS_LIST,
    PERMISSIONS.ASSETS_VIEW,
    PERMISSIONS.ASSETS_UPLOAD,
    PERMISSIONS.ASSETS_DELETE,
    PERMISSIONS.DATA_OBJECTS_LIST,
    PERMISSIONS.DATA_OBJECTS_VIEW,
    PERMISSIONS.DATA_OBJECTS_EDIT,
    PERMISSIONS.DATA_OBJECTS_CREATE,
    PERMISSIONS.THEMES_LIST,
    PERMISSIONS.THEMES_VIEW,
    PERMISSIONS.COMPONENTS_LIST,
    PERMISSIONS.COMPONENTS_VIEW,
    PERMISSIONS.COMPONENTS_EDIT,
    PERMISSIONS.WORKFLOWS_MANAGE,
  ],
  viewer: [
    PERMISSIONS.OBJECTS_READ,
    PERMISSIONS.WEBSITES_LIST,
    PERMISSIONS.WEBSITES_VIEW,
    PERMISSIONS.PAGES_LIST,
    PERMISSIONS.PAGES_VIEW,
    PERMISSIONS.SNIPPETS_LIST,
    PERMISSIONS.SNIPPETS_VIEW,
    PERMISSIONS.ASSETS_LIST,
    PERMISSIONS.ASSETS_VIEW,
    PERMISSIONS.DATA_OBJECTS_LIST,
    PERMISSIONS.DATA_OBJECTS_VIEW,
    PERMISSIONS.THEMES_LIST,
    PERMISSIONS.THEMES_VIEW,
    PERMISSIONS.COMPONENTS_LIST,
    PERMISSIONS.COMPONENTS_VIEW,
  ],
  // Roles by function: the person who puts the site online. Reads websites and pages, starts publications; no editing, settings, users or deletion.
  publisher: [
    PERMISSIONS.OBJECTS_READ,
    PERMISSIONS.WEBSITES_LIST,
    PERMISSIONS.WEBSITES_VIEW,
    PERMISSIONS.WEBSITES_PUBLISH,
    PERMISSIONS.PAGES_LIST,
    PERMISSIONS.PAGES_VIEW,
    PERMISSIONS.THEMES_LIST,
    PERMISSIONS.THEMES_VIEW,
  ],
};
