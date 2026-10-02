import { eq, isNotNull } from 'drizzle-orm';
import { getDb, closeDb } from '../client.js';
import { users } from '../auth-schema.js';
import { encryptTotpSecret, isEncryptedTotpSecret, totpEncryptionConfigured } from '../../auth/totp-crypto.js';

/**
 * Encrypts every `users.totp_secret` still stored in clear (see auth/totp-crypto.ts). Idempotent: already
 * encrypted rows are left alone; without TOTP_ENCRYPTION_KEY nothing is touched. Runs at database bootstrap
 * and can be run by hand: `tsx src/db/scripts/backfill-totp-encryption.ts`.
 */
export async function backfillTotpEncryption(): Promise<{ encrypted: number; alreadyEncrypted: number; skipped: boolean }> {
  if (!totpEncryptionConfigured()) return { encrypted: 0, alreadyEncrypted: 0, skipped: true };
  const db = getDb();
  const rows = await db.select({ id: users.id, totpSecret: users.totpSecret }).from(users).where(isNotNull(users.totpSecret));
  let encrypted = 0;
  let alreadyEncrypted = 0;
  for (const row of rows) {
    if (!row.totpSecret || isEncryptedTotpSecret(row.totpSecret)) { alreadyEncrypted++; continue; }
    await db.update(users).set({ totpSecret: encryptTotpSecret(row.totpSecret) }).where(eq(users.id, row.id));
    encrypted++;
  }
  return { encrypted, alreadyEncrypted, skipped: false };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  backfillTotpEncryption()
    .then((r) => {
      console.log(r.skipped ? 'TOTP_ENCRYPTION_KEY is not set: nothing done.' : `TOTP backfill: ${r.encrypted} encrypted, ${r.alreadyEncrypted} already encrypted.`);
      return closeDb();
    })
    .catch((err) => { console.error('TOTP backfill failed:', err); process.exit(1); });
}
