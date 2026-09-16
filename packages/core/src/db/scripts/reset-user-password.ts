import { eq } from 'drizzle-orm';
import { getDb, closeDb } from '../client.js';
import { users } from '../auth-schema.js';
import { hashPassword } from '../../auth/password.js';

/**
 * Manual account-recovery script for when the SMTP-based forgot-password
 * flow (auth/reset-password.ts) isn't available. Sets a new password hash
 * directly, bypassing the reset-token/email round trip. Also clears any
 * pending reset token and, optionally, TOTP MFA (RESET_USER_CLEAR_MFA=true)
 * so a lost authenticator app doesn't leave the account permanently locked.
 *
 * Run against whichever DB the environment's DB_* / DATABASE_URL vars point
 * at (local .env, or the remote's .env if run on the server):
 *   RESET_USER_EMAIL=admin@example.com RESET_USER_PASSWORD='new-strong-pass' \
 *     pnpm --filter @whoobe-cms/core exec tsx src/db/scripts/reset-user-password.ts
 */
export async function resetUserPassword(email: string, newPassword: string, clearMfa: boolean): Promise<{ email: string; found: boolean }> {
  const db = getDb();
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await hashPassword(newPassword);

  const result = await db.update(users)
    .set({
      passwordHash,
      resetToken: null,
      resetTokenExpiresAt: null,
      updatedAt: new Date(),
      ...(clearMfa ? { totpSecret: null, totpEnabledAt: null, mfaRecoveryCodes: null } : {}),
    })
    .where(eq(users.email, normalizedEmail))
    .returning({ id: users.id });

  return { email: normalizedEmail, found: result.length > 0 };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const email = process.env.RESET_USER_EMAIL;
  const newPassword = process.env.RESET_USER_PASSWORD;
  const clearMfa = process.env.RESET_USER_CLEAR_MFA === 'true';

  if (!email || !newPassword) {
    console.error('Usage: RESET_USER_EMAIL=<email> RESET_USER_PASSWORD=<new password> [RESET_USER_CLEAR_MFA=true] tsx src/db/scripts/reset-user-password.ts');
    process.exit(1);
  }
  if (newPassword.length < 8) {
    console.error('RESET_USER_PASSWORD must be at least 8 characters.');
    process.exit(1);
  }

  resetUserPassword(email, newPassword, clearMfa)
    .then(({ email: normalizedEmail, found }) => {
      if (!found) {
        console.error(`No user found with email ${normalizedEmail}.`);
        return closeDb().then(() => process.exit(1));
      }
      console.log(`Password reset for ${normalizedEmail}.${clearMfa ? ' MFA cleared.' : ''}`);
      return closeDb();
    })
    .catch((err) => {
      console.error('Password reset failed:', err);
      process.exit(1);
    });
}
