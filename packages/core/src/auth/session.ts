import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull, lt, or } from 'drizzle-orm';
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

/** What is stored in `sessions.id`: the SHA-256 of the cookie value. The cookie (the token) is never written to the database, so a
 *  copy of the table or of a backup does not hand out live sessions (finding F-056). The token has 256 bits of entropy, so a fast
 *  hash is enough. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
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
    id: hashSessionToken(token),
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
    .where(eq(sessions.id, hashSessionToken(token)))
    .limit(1);

  if (!row || row.revokedAt || row.expiresAt < now || !row.isActive) {
    return null;
  }

  await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, hashSessionToken(token)));

  const perms = await getEffectivePermissions(row.userId);
  return { id: row.userId, email: row.email, displayName: row.displayName, permissions: perms };
}

export async function revokeSession(token: string): Promise<void> {
  const db = getDb();
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, hashSessionToken(token)));
}

/** Ends every active session of a user (password change/reset, compromise response). */
export async function revokeUserSessions(userId: string): Promise<void> {
  const db = getDb();
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

/** How long an expired or revoked session row is kept before it is deleted (a week of evidence for an incident review). */
export const SESSION_PURGE_GRACE_MS = 1000 * 60 * 60 * 24 * 7;

/** Deletes sessions that expired, or were revoked, more than `graceMs` ago. Returns how many rows went. Called at start and
 *  periodically by core-api; before this, the table only ever grew (finding F-056). */
export async function purgeStaleSessions(graceMs: number = SESSION_PURGE_GRACE_MS, now: Date = new Date()): Promise<number> {
  const db = getDb();
  const cutoff = new Date(now.getTime() - graceMs);
  const rows = await db.delete(sessions).where(or(lt(sessions.expiresAt, cutoff), lt(sessions.revokedAt, cutoff))).returning({ id: sessions.id });
  return rows.length;
}
