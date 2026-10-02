import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { users, type MfaRecoveryCode } from '../db/auth-schema.js';
import { decryptTotpSecret, encryptTotpSecret } from './totp-crypto.js';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  isActive: boolean;
  totpSecret: string | null;
  totpEnabledAt: Date | null;
  mfaRecoveryCodes: MfaRecoveryCode[] | null;
  resetToken: string | null;
  resetTokenExpiresAt: Date | null;
}

// The TOTP secret is encrypted at rest (totp-crypto.ts); callers always see it in clear.
function withDecryptedTotp<T extends { totpSecret: string | null }>(row: T | undefined): T | null {
  if (!row) return null;
  return { ...row, totpSecret: decryptTotpSecret(row.totpSecret) };
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return withDecryptedTotp(user);
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return withDecryptedTotp(user);
}

export async function touchLastLogin(userId: string): Promise<void> {
  const db = getDb();
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
}

// Written as soon as MFA setup starts, before the user has proven they can
// actually generate a valid code with it - see auth-schema.ts's own comment
// on why an unconfirmed secret sitting here unused is fine.
export async function setPendingTotpSecret(userId: string, secret: string): Promise<void> {
  const db = getDb();
  await db.update(users).set({ totpSecret: encryptTotpSecret(secret) }).where(eq(users.id, userId));
}

// Flips MFA on for real (totpEnabledAt is the actual enforcement gate, see
// server.ts's /auth/login) and stores the one-time recovery codes generated
// alongside it.
export async function enableTotp(userId: string, recoveryCodes: MfaRecoveryCode[]): Promise<void> {
  const db = getDb();
  await db.update(users).set({ totpEnabledAt: new Date(), mfaRecoveryCodes: recoveryCodes }).where(eq(users.id, userId));
}

export async function disableTotp(userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(users)
    .set({ totpSecret: null, totpEnabledAt: null, mfaRecoveryCodes: null })
    .where(eq(users.id, userId));
}

export async function updateMfaRecoveryCodes(userId: string, recoveryCodes: MfaRecoveryCode[]): Promise<void> {
  const db = getDb();
  await db.update(users).set({ mfaRecoveryCodes: recoveryCodes }).where(eq(users.id, userId));
}
