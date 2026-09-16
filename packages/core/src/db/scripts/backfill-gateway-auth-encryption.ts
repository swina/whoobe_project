import { eq } from 'drizzle-orm';
import { getDb, closeDb } from '../client.js';
import { gatewayEndpoints } from '../gateway-schema.js';
import { encryptGatewayAuthConfig } from '../gateway-auth-crypto.js';

/**
 * One-time backfill for 0039_gateway_auth_encrypted.sql - encrypts any
 * gateway_endpoints row still holding a plaintext `auth_config` into the
 * new `auth_config_encrypted` column, then clears the plaintext column.
 * Idempotent: a row with no plaintext config (already backfilled, or never
 * had one) is left untouched.
 *
 * Run once per environment after applying the migration and setting
 * GATEWAY_AUTH_ENCRYPTION_KEY, before a future migration drops the
 * plaintext `auth_config` column: `tsx src/db/scripts/backfill-gateway-
 * auth-encryption.ts`.
 */
export async function backfillGatewayAuthEncryption(): Promise<{ migrated: number; skipped: number }> {
  const db = getDb();
  const rows = await db.select().from(gatewayEndpoints);

  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    const plaintext = row.authConfig as Record<string, unknown> | null;
    if (!plaintext || Object.keys(plaintext).length === 0) {
      skipped++;
      continue;
    }
    const encrypted = encryptGatewayAuthConfig(plaintext);
    await db.update(gatewayEndpoints)
      .set({ authConfigEncrypted: encrypted, authConfig: {} })
      .where(eq(gatewayEndpoints.id, row.id));
    migrated++;
  }

  return { migrated, skipped };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  backfillGatewayAuthEncryption()
    .then(({ migrated, skipped }) => {
      console.log(`Gateway auth backfill complete: ${migrated} encrypted, ${skipped} already clear.`);
      return closeDb();
    })
    .catch((err) => {
      console.error('Gateway auth backfill failed:', err);
      process.exit(1);
    });
}
