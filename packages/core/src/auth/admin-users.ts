import { eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { users, roles, permissions, rolePermissions, userRoles } from '../db/auth-schema.js';
import { hashPassword } from './password.js';
import { RESET_TOKEN_TTL_MS, generateResetToken } from './reset-password.js';
import { getEffectivePermissions } from './session.js';

export interface UserWithRoles {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  roleIds: string[];
  roleNames: string[];
}

export interface RoleWithPermissions {
  id: string;
  name: string;
  description: string | null;
  permissionKeys: string[];
  userCount: number;
}

export interface PermissionRecord {
  id: string;
  key: string;
  description: string | null;
}

// --- Users ---

export async function listUsers(): Promise<UserWithRoles[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      isActive: users.isActive,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      roleId: userRoles.roleId,
      roleName: roles.name,
    })
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .leftJoin(roles, eq(roles.id, userRoles.roleId))
    .orderBy(users.createdAt);

  const map = new Map<string, UserWithRoles>();
  for (const row of rows) {
    let entry = map.get(row.id);
    if (!entry) {
      entry = {
        id: row.id,
        email: row.email,
        displayName: row.displayName,
        isActive: row.isActive,
        createdAt: row.createdAt,
        lastLoginAt: row.lastLoginAt,
        roleIds: [],
        roleNames: [],
      };
      map.set(row.id, entry);
    }
    if (row.roleId) {
      entry.roleIds.push(row.roleId);
      entry.roleNames.push(row.roleName!);
    }
  }
  return Array.from(map.values());
}

export async function createUser(input: {
  email: string;
  password: string;
  displayName: string;
  roleIds: string[];
}): Promise<UserWithRoles> {
  const db = getDb();
  const passwordHash = await hashPassword(input.password);
  const [created] = await db
    .insert(users)
    .values({ email: input.email.toLowerCase(), passwordHash, displayName: input.displayName })
    .returning();

  await setUserRoles(created.id, input.roleIds);
  return (await getUserWithRoles(created.id))!;
}

export async function getUserWithRoles(id: string): Promise<UserWithRoles | null> {
  const usersList = await listUsers();
  return usersList.find((u) => u.id === id) ?? null;
}

export async function updateUser(
  id: string,
  input: { email?: string; displayName?: string; isActive?: boolean; roleIds?: string[] }
): Promise<UserWithRoles | null> {
  const db = getDb();
  const values: Record<string, unknown> = {};
  if (input.email !== undefined) values.email = input.email.toLowerCase();
  if (input.displayName !== undefined) values.displayName = input.displayName;
  if (input.isActive !== undefined) values.isActive = input.isActive;
  if (Object.keys(values).length > 0) {
    values.updatedAt = new Date();
    await db.update(users).set(values).where(eq(users.id, id));
  }
  if (input.roleIds !== undefined) {
    await setUserRoles(id, input.roleIds);
  }
  return getUserWithRoles(id);
}

export async function deleteUser(id: string): Promise<void> {
  const db = getDb();
  await db.delete(users).where(eq(users.id, id));
}

export async function setUserRoles(userId: string, roleIds: string[]): Promise<void> {
  const db = getDb();
  await db.delete(userRoles).where(eq(userRoles.userId, userId));
  if (roleIds.length > 0) {
    await db.insert(userRoles).values(roleIds.map((roleId) => ({ userId, roleId })));
  }
}

export async function adminResetPassword(userId: string): Promise<string> {
  const user = await getUserWithRoles(userId);
  if (!user) throw new Error('User not found');
  const token = await generateResetToken(userId);
  return token;
}

// --- Roles ---

export async function listRoles(): Promise<RoleWithPermissions[]> {
  const db = getDb();
  const roleRows = await db.select().from(roles).orderBy(roles.name);
  const allLinks = await db.select().from(rolePermissions);
  const allPerms = await db.select().from(permissions);
  const permKeyById = new Map(allPerms.map((p) => [p.id, p.key]));
  const userCounts = new Map<string, number>();
  const userRoleRows = await db.select().from(userRoles);
  for (const ur of userRoleRows) {
    userCounts.set(ur.roleId, (userCounts.get(ur.roleId) ?? 0) + 1);
  }

  return roleRows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    permissionKeys: allLinks
      .filter((l) => l.roleId === r.id)
      .map((l) => permKeyById.get(l.permissionId)!)
      .filter((k): k is string => !!k),
    userCount: userCounts.get(r.id) ?? 0,
  }));
}

export async function createRole(input: { name: string; description?: string; permissionKeys: string[] }): Promise<RoleWithPermissions> {
  const db = getDb();
  const [created] = await db
    .insert(roles)
    .values({ name: input.name, description: input.description ?? null })
    .returning();
  await setRolePermissions(created.id, input.permissionKeys);
  return (await listRoles()).find((r) => r.id === created.id)!;
}

export async function getRole(id: string): Promise<RoleWithPermissions | null> {
  const rolesList = await listRoles();
  return rolesList.find((r) => r.id === id) ?? null;
}

export async function updateRole(
  id: string,
  input: { name?: string; description?: string | null; permissionKeys?: string[] }
): Promise<RoleWithPermissions | null> {
  const db = getDb();
  const values: Record<string, unknown> = {};
  if (input.name !== undefined) values.name = input.name;
  if (input.description !== undefined) values.description = input.description;
  if (Object.keys(values).length > 0) {
    await db.update(roles).set(values).where(eq(roles.id, id));
  }
  if (input.permissionKeys !== undefined) {
    await setRolePermissions(id, input.permissionKeys);
  }
  return getRole(id);
}

export async function deleteRole(id: string): Promise<{ blocked: boolean; userCount: number }> {
  const db = getDb();
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(userRoles)
    .where(eq(userRoles.roleId, id));
  const userCount = Number(count);
  if (userCount > 0) {
    return { blocked: true, userCount };
  }
  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
  await db.delete(roles).where(eq(roles.id, id));
  return { blocked: false, userCount: 0 };
}

export async function setRolePermissions(roleId: string, permissionKeys: string[]): Promise<void> {
  const db = getDb();
  const allPerms = await db.select().from(permissions);
  const permIdByKey = new Map(allPerms.map((p) => [p.key, p.id]));

  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
  if (permissionKeys.length > 0) {
    const validKeys = permissionKeys.filter((k) => permIdByKey.has(k));
    if (validKeys.length > 0) {
      await db.insert(rolePermissions).values(
        validKeys.map((key) => ({ roleId, permissionId: permIdByKey.get(key)! }))
      );
    }
  }
}

// --- Permissions ---

export async function listAllPermissions(): Promise<PermissionRecord[]> {
  const db = getDb();
  return db.select().from(permissions).orderBy(permissions.key);
}