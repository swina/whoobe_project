import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'node:crypto';

/**
 * Encryption at rest for `users.totp_secret`. A TOTP secret is the second factor itself: anyone who reads it
 * from the table or from a backup can generate valid codes for that user. Same AES-256-GCM/scrypt shape as
 * gateway-auth-crypto.ts, with its own key (TOTP_ENCRYPTION_KEY) so that leaking one class of secret does not
 * hand over the other.
 *
 * Stored form: `enc:v1:` + base64(iv | authTag | ciphertext). A value without that prefix is a legacy plaintext
 * secret (written before this existed, or while no key was configured): it is still accepted, and
 * backfillTotpEncryption() (run at database bootstrap and as a script) rewrites it once a key is set.
 * Losing or changing the key makes encrypted secrets unreadable - users would have to re-enrol MFA.
 */

const KEY_ENV_VAR = 'TOTP_ENCRYPTION_KEY';
const PREFIX = 'enc:v1:';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

let warnedNoKey = false;

function resolveKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const secret = env[KEY_ENV_VAR];
  if (!secret) return null;
  return scryptSync(secret, 'whoobe-totp-secret', 32);
}

export function totpEncryptionConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env[KEY_ENV_VAR];
}

export function isEncryptedTotpSecret(stored: string | null | undefined): boolean {
  return !!stored && stored.startsWith(PREFIX);
}

/** Encrypts when a key is configured; without one the secret is stored as before (with a one-time warning). */
export function encryptTotpSecret(secret: string, env: NodeJS.ProcessEnv = process.env): string {
  const key = resolveKey(env);
  if (!key) {
    if (!warnedNoKey) {
      warnedNoKey = true;
      console.warn(`${KEY_ENV_VAR} is not set: MFA secrets are stored in clear text. Set it to encrypt them at rest.`);
    }
    return secret;
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

/** Legacy plaintext passes through; an encrypted value needs the key (fails closed, never returns garbage). */
export function decryptTotpSecret(stored: string | null | undefined, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) return stored;
  const key = resolveKey(env);
  if (!key) throw new Error(`${KEY_ENV_VAR} is not set - cannot read the encrypted MFA secret.`);
  const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
