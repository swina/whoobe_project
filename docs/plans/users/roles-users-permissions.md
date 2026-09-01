# ROLES, USERS, PERMISSIONS

The security rules for the app are based on:

- user > role > permission

## USERS

A user is identified by a valid email and has to be assigned a role.

## ROLES

Roles are a way to identify user groups that have specific permissions about using the app.

Default seeded roles: `admin`, `editor`, `viewer`.

## PERMISSIONS

Permissions are assigned at role level.

### PERMISSIONS RULES

- Only the admin group can create access rules.

**Access rules**

The access is based on the context > permission.

The contexts can be:

- Websites
- Pages
- Snippets
- Assets (folder)
- Data Objects (data object): a role can access limited data objects
- Themes
- Components
- Workflow

For each of the contexts the permissions can be:

- List, View, Edit, Create, Delete, Rename

## CURRENT IMPLEMENTATION STATUS

The auth DB schema (users, roles, permissions, role_permissions, user_roles, sessions) and login/session/MFA/auth guards are fully implemented. The seed creates 3 default roles with flat permission keys (`objects:read`, `objects:write`, etc.) assigned to them.

**What is missing:**

1. Backend CRUD routes for managing users and roles
2. Admin UI views for user/role management (currently a placeholder in Settings)
3. Granular per-context permissions (websites:list, pages:edit, etc.) to replace the current flat keys
4. Data-scoped access (e.g. a role can only access specific data objects)
5. Enforcement of the `users:manage` permission key

## IMPLEMENTATION PLAN

### Phase 1: Granular permission keys

Extend `packages/core/src/auth/permissions.ts` with new context-scoped keys
while keeping backward compatibility with existing `objects:*` / `assets:*`
keys until the old routes are migrated.

New permission key format: `<context>:<action>`

Contexts and their actions:

| Context | List | View | Edit | Create | Delete | Rename |
|---------|------|------|------|--------|--------|--------|
| websites | websites:list | websites:view | websites:edit | websites:create | websites:delete | — |
| pages | pages:list | pages:view | pages:edit | pages:create | pages:delete | — |
| snippets | snippets:list | snippets:view | snippets:edit | snippets:create | snippets:delete | — |
| assets | assets:list | assets:view | assets:edit | assets:upload | assets:delete | assets:rename |
| data_objects | data_objects:list | data_objects:view | data_objects:edit | data_objects:create | data_objects:delete | — |
| themes | themes:list | themes:view | themes:edit | themes:create | themes:delete | — |
| components | components:list | components:view | components:edit | components:create | components:delete | — |
| workflow | — | — | workflow:manage | — | — | — |

Plus system-level permissions:
- `users:manage` — manage users, roles, permissions
- `settings:manage` — manage system settings (mail, AI, etc.)

**Default role -> permission mapping (updated):**

| Role | Permissions |
|------|------------|
| admin | All |
| editor | websites:list, websites:view, websites:edit, pages:list, pages:view, pages:edit, pages:create, snippets:list, snippets:view, snippets:edit, snippets:create, assets:list, assets:view, assets:upload, assets:delete, data_objects:list, data_objects:view, data_objects:edit, data_objects:create, themes:list, themes:view, components:list, components:view, components:edit, workflow:manage |
| viewer | websites:list, websites:view, pages:list, pages:view, snippets:list, snippets:view, assets:list, assets:view, data_objects:list, data_objects:view, themes:list, themes:view, components:list, components:view |

### Phase 2: Backend CRUD routes

Add the following routes to `apps/core-api/src/server.ts`, all gated by `requirePermission(PERMISSIONS.USERS_MANAGE)`:

**Users:**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/auth/users` | List all users (id, email, displayName, isActive, roles, lastLoginAt) |
| `POST` | `/auth/users` | Create user (email, password, displayName, roleIds[]) — emails the initial password |
| `GET` | `/auth/users/:id` | Get single user with their roles |
| `PATCH` | `/auth/users/:id` | Update user (email, displayName, isActive, roleIds[]) |
| `DELETE` | `/auth/users/:id` | Deactivate or delete user |
| `POST` | `/auth/users/:id/reset-password` | Admin-forced password reset (generates token, logs/sends email) |

**Roles:**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/auth/roles` | List all roles with their permission keys |
| `POST` | `/auth/roles` | Create role (name, description, permissionKeys[]) |
| `GET` | `/auth/roles/:id` | Get single role with its permissions |
| `PATCH` | `/auth/roles/:id` | Update role (name, description, permissionKeys[]) — replaces all |
| `DELETE` | `/auth/roles/:id` | Delete role (fails if users are assigned to it) |
| `GET` | `/auth/permissions` | List all available permission keys with descriptions |

### Phase 3: Backend service layer

Create `packages/core/src/auth/admin-users.ts` with:

```typescript
listUsers(): Promise<UserWithRoles[]>
createUser(input): Promise<UserRecord>
getUser(id): Promise<UserWithRoles | null>
updateUser(id, input): Promise<UserRecord | null>
deleteUser(id): Promise<void>
setUserRoles(userId, roleIds: string[]): Promise<void>

listRoles(): Promise<RoleWithPermissions[]>
createRole(input): Promise<RoleRecord>
getRole(id): Promise<RoleWithPermissions | null>
updateRole(id, input): Promise<RoleRecord | null>
deleteRole(id): Promise<void>
setRolePermissions(roleId, permissionKeys: string[]): Promise<void>

listAllPermissions(): Promise<PermissionRecord[]>
```

### Phase 4: Admin UI — Users view

Create `apps/admin-dashboard/src/views/UsersView.vue`:

- **List** — table of all users with columns: email, display name, roles, active status, last login
- **Create** — modal or inline form: email, display name, password (auto-generated option), role picker (checkboxes for multi-role)
- **Edit** — inline or modal: change email, display name, active toggle, role picker
- **Delete** — confirm dialog, marks user inactive
- **Reset password** — button per user, triggers admin-forced reset email
- **Column** — pill badges showing role names (color-coded: admin=red, editor=blue, viewer=green)

### Phase 5: Admin UI — Roles view

Create `apps/admin-dashboard/src/views/RolesView.vue`:

- **List** — table of all roles with permission count and user count
- **Create** — name, description, permission grid (checkboxes grouped by context)
- **Edit** — same as create but prefilled; showing which users have this role
- **Delete** — confirm dialog, blocked if users are assigned
- **Permission grid** — a matrix layout: rows = contexts (Websites, Pages, ...), columns = actions (List, View, Edit, Create, Delete, Rename), checkboxes to toggle. System permissions (users:manage, settings:manage) shown in their own section.

### Phase 6: Replace Settings placeholder

Replace the placeholder in `SettingsView.vue` with sub-tab navigation:

```
Users | Roles
```

- **Users tab** — renders `UsersView.vue`
- **Roles tab** — renders `RolesView.vue`

Both gated by `can('users:manage')` — non-admin users see nothing (or a "no access" message).

### Phase 7: Frontend API client & store

Extend `apps/admin-dashboard/src/utils/auth-api.ts` with:
```
listUsers(baseUrl): UserWithRoles[]
createUser(baseUrl, input): UserRecord
getUser(baseUrl, id): UserWithRoles
updateUser(baseUrl, id, input): UserRecord
deleteUser(baseUrl, id): void
adminResetPassword(baseUrl, id): void

listRoles(baseUrl): RoleWithPermissions[]
createRole(baseUrl, input): RoleRecord
getRole(baseUrl, id): RoleWithPermissions
updateRole(baseUrl, id, input): RoleRecord
deleteRole(baseUrl, id): void

listAllPermissions(baseUrl): PermissionRecord[]
```

Optionally create a `useUsersStore` Pinia store for caching user/role lists if needed for performance (e.g. role picker dropdowns in other views).

### Phase 8: Migration (zero-downtime)

1. Add new permission keys to the seed and `ALL_PERMISSION_KEYS`
2. Run a data migration to assign new keys to existing roles:
   - `admin` gets all new keys
   - `editor` gets the editor mapping from Phase 1
   - `viewer` gets the viewer mapping
3. The old `objects:*` / `assets:*` keys are kept for backward compatibility — old routes still check them. They can be removed in a cleanup phase once all routes are migrated to the new context keys.

### Phase 9: Migrate existing routes (optional/future)

Replace `requirePermission(PERMISSIONS.OBJECTS_READ)` on individual routes with the matching context-scoped key (e.g. `pages:list`, `data_objects:view`). This is pure refactoring — no functional change, but it makes the permission model self-documenting.

## FUTURE: Data-scoped access

The plan mentions "a role can access limited data objects." This requires a new junction table:

```
role_data_object_scopes
  role_id uuid FK -> roles.id
  data_object_id uuid FK -> data_objects.id
  permission text ('view' | 'edit' | 'delete')
```

And a check in the data-object query routes: if the user is not admin, filter results to only data objects where a role they hold has a matching scope entry. This is deferred — Phase 1-7 above target the basic infrastructure first.

## FUTURE: Workspaces

Workspaces are not a concept in the schema today. The placeholder card mentions them but they are out of scope for this plan. If needed later, they would build on role_data_object_scopes and add per-website/page role scoping.