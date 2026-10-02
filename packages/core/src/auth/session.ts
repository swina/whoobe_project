import { randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { sessions, users, userRoles, rolePermissions, permissions as permissionsTable } from '../db/auth-schema.js';

export const SESSION_COOKIE_NAME = 'wcms_session';
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  permissions: string[];
}

export interface SessionMetadata {
  ip?: string;
  userAgent?: string;
}

function generateSessionToken(): string {
  // 32 random bytes -> unguessable; used directly as the session id/cookie
  // value (see auth-schema.ts). No JWT signing/verification needed since
  // validity is a plain row lookup, not a signature check.
  return randomBytes(32).toString('hex');
}

export async function createSession(
  userId: string,
  meta: SessionMetadata = {}
): Promise<{ token: string; expiresAt: Date }> {
  const db = getDb();
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    id: token,
    userId,
    expiresAt,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return { token, expiresAt };
}

export async function getEffectivePermissions(userId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ key: permissionsTable.key })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .innerJoin(permissionsTable, eq(permissionsTable.id, rolePermissions.permissionId))
    .where(eq(userRoles.userId, userId));

  return Array.from(new Set(rows.map((r) => r.key)));
}

export async function validateSessionToken(token: string | undefined | null): Promise<AuthenticatedUser | null> {
  if (!token) return null;
  const db = getDb();
  const now = new Date();

  const [row] = await db
    .select({
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      isActive: users.isActive,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, token))
    .limit(1);

  if (!row || row.revokedAt || row.expiresAt < now || !row.isActive) {
    return null;
  }

  await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, token));

  const perms = await getEffectivePermissions(row.userId);
  return { id: row.userId, email: row.email, displayName: row.displayName, permissions: perms };
}

export async function revokeSession(token: string): Promise<void> {
  const db = getDb();
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, token));
}

/** Ends every active session of a user (password change/reset, compromise response). */
export async function revokeUserSessions(userId: string): Promise<void> {
  const db = getDb();
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}
