import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { users } from '../db/auth-schema.js';
import { hashPassword } from './password.js';
import { revokeUserSessions } from './session.js';

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const RESET_TOKEN_BYTES = 32;

export async function generateResetToken(userId: string): Promise<string> {
  const token = randomBytes(RESET_TOKEN_BYTES).toString('hex');
  const db = getDb();
  await db
    .update(users)
    .set({
      resetToken: token,
      resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    })
    .where(eq(users.id, userId));
  return token;
}

export async function findUserByResetToken(token: string): Promise<{ id: string } | null> {
  const db = getDb();
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.resetToken, token))
    .limit(1);
  if (!user) return null;
  // Expiry check done in the route handler to keep this query simple.
  return user;
}

export async function clearResetToken(userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(users)
    .set({ resetToken: null, resetTokenExpiresAt: null })
    .where(eq(users.id, userId));
}

export async function updatePassword(userId: string, newPassword: string): Promise<void> {
  const db = getDb();
  const passwordHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  // A new password must end sessions opened with the old one (stolen cookie, shared machine).
  await revokeUserSessions(userId);
}