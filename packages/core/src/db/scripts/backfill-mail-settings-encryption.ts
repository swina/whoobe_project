import { eq, isNotNull } from 'drizzle-orm';
import { getDb } from '../client.js';
import { mailSettings } from '../mail-settings-schema.js';
import { encryptMailSecret, mailEncryptionConfigured } from '../mail-settings-crypto.js';

/** Encrypts the SMTP passwords that predate encryption (the old plaintext `mail_settings.password`) and empties the old
 *  column. Idempotent; a no-op without MAIL_SETTINGS_ENCRYPTION_KEY (the passwords then stay readable as they were). */
export async function backfillMailSettingsEncryption(): Promise<{ encrypted: number; skipped: boolean }> {
  if (!mailEncryptionConfigured()) return { encrypted: 0, skipped: true };
  const db = getDb();
  const rows = await db.select().from(mailSettings).where(isNotNull(mailSettings.password));
  let encrypted = 0;
  for (const row of rows) {
    if (!row.password) continue;
    await db.update(mailSettings).set({ passwordEncrypted: row.passwordEncrypted ?? encryptMailSecret(row.password), password: null }).where(eq(mailSettings.id, row.id));
    encrypted++;
  }
  return { encrypted, skipped: false };
}
