import { eq, isNotNull } from 'drizzle-orm';
import { getDb, closeDb } from '../client.js';
import { aiSettings } from '../ai-settings-schema.js';
import { aiImageSettings } from '../ai-image-settings-schema.js';
import { aiTranslateSettings } from '../ai-translate-settings-schema.js';
import { figmaSettings } from '../figma-settings-schema.js';
import { websites } from '../websites-schema.js';
import { encryptIntegrationSecret, isEncryptedIntegrationSecret, integrationSecretsEncryptionConfigured } from '../integration-secrets-crypto.js';

/**
 * Encrypts the third-party credentials still stored in clear (see integration-secrets-crypto.ts, finding F-055): AI provider keys
 * (text, image, translation), the Figma token and the push provider key of each website. Idempotent: encrypted values are left
 * alone; without INTEGRATION_SECRETS_ENCRYPTION_KEY nothing is touched. Runs at database bootstrap and by hand:
 * `tsx src/db/scripts/backfill-integration-secrets-encryption.ts`.
 */
export async function backfillIntegrationSecretsEncryption(): Promise<{ encrypted: number; alreadyEncrypted: number; skipped: boolean }> {
  if (!integrationSecretsEncryptionConfigured()) return { encrypted: 0, alreadyEncrypted: 0, skipped: true };
  const db = getDb();
  let encrypted = 0;
  let alreadyEncrypted = 0;
  const handle = async (value: string | null, write: (sealed: string) => Promise<unknown>) => {
    if (!value) return;
    if (isEncryptedIntegrationSecret(value)) { alreadyEncrypted++; return; }
    await write(encryptIntegrationSecret(value)!);
    encrypted++;
  };

  for (const r of await db.select({ id: aiSettings.userId, v: aiSettings.apiKey }).from(aiSettings).where(isNotNull(aiSettings.apiKey))) {
    await handle(r.v, (sealed) => db.update(aiSettings).set({ apiKey: sealed }).where(eq(aiSettings.userId, r.id)));
  }
  for (const r of await db.select({ id: aiImageSettings.userId, v: aiImageSettings.apiKey }).from(aiImageSettings).where(isNotNull(aiImageSettings.apiKey))) {
    await handle(r.v, (sealed) => db.update(aiImageSettings).set({ apiKey: sealed }).where(eq(aiImageSettings.userId, r.id)));
  }
  for (const r of await db.select({ id: aiTranslateSettings.userId, v: aiTranslateSettings.apiKey }).from(aiTranslateSettings).where(isNotNull(aiTranslateSettings.apiKey))) {
    await handle(r.v, (sealed) => db.update(aiTranslateSettings).set({ apiKey: sealed }).where(eq(aiTranslateSettings.userId, r.id)));
  }
  for (const r of await db.select({ id: figmaSettings.id, v: figmaSettings.accessToken }).from(figmaSettings).where(isNotNull(figmaSettings.accessToken))) {
    await handle(r.v, (sealed) => db.update(figmaSettings).set({ accessToken: sealed }).where(eq(figmaSettings.id, r.id)));
  }
  for (const r of await db.select({ id: websites.id, cfg: websites.pwaConfig }).from(websites)) {
    const push = r.cfg && typeof r.cfg === 'object' ? (r.cfg as Record<string, unknown>).push : null;
    const key = push && typeof push === 'object' ? (push as Record<string, unknown>).onesignalApiKey : null;
    if (typeof key !== 'string' || !key) continue;
    await handle(key, (sealed) =>
      db.update(websites).set({ pwaConfig: { ...(r.cfg as Record<string, unknown>), push: { ...(push as Record<string, unknown>), onesignalApiKey: sealed } } }).where(eq(websites.id, r.id)));
  }
  return { encrypted, alreadyEncrypted, skipped: false };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  backfillIntegrationSecretsEncryption()
    .then((r) => {
      console.log(r.skipped ? 'INTEGRATION_SECRETS_ENCRYPTION_KEY is not set: nothing done.' : `Integration secrets backfill: ${r.encrypted} encrypted, ${r.alreadyEncrypted} already encrypted.`);
      return closeDb();
    })
    .catch((err) => { console.error('Integration secrets backfill failed:', err); process.exit(1); });
}
