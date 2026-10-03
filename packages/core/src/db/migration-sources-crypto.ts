import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'node:crypto';

/**
 * Encryption at rest for `migration_sources.dbPasswordEncrypted` - docs/
 * plans/datamodel/native-class-authoring-plan.md §3.4/Phase 4. Deliberately
 * NOT following this codebase's own existing precedent for a similar-looking
 * secret (`users.totpSecret`, stored as plain `text` - auth-schema.ts) - a
 * stored Pimcore DB password grants read access to an entire external
 * database if this table is ever exposed (a backup leak, an SQL injection
 * elsewhere, a misconfigured export), a materially larger blast radius than
 * one user's TOTP secret. AES-256-GCM via Node's built-in `crypto` - no new
 * dependency, authenticated (a tampered/corrupted ciphertext fails to
 * decrypt rather than silently returning garbage credentials).
 */

const KEY_ENV_VAR = 'MIGRATION_SOURCE_ENCRYPTION_KEY';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function resolveKey(): Buffer {
  const secret = process.env[KEY_ENV_VAR];
  if (!secret) {
    throw new Error(`${KEY_ENV_VAR} is not set - required to store or read migration source credentials.`);
  }
  // scrypt derives a real 32-byte AES-256 key from whatever-length secret
  // is configured, rather than requiring the operator to hand-generate
  // exactly-32-byte key material themselves.
  return scryptSync(secret, 'whoobe-migration-source', 32);
}

export function encryptMigrationSourceSecret(plaintext: string): string {
  const key = resolveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

export function decryptMigrationSourceSecret(encoded: string): string {
  const key = resolveKey();
  const raw = Buffer.from(encoded, 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
