import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'node:crypto';

/**
 * Encryption at rest for the credentials of third-party services that are saved through the dashboard: the AI provider
 * keys (text, image, translation - one row per user), the Figma access token and the push-notification provider key
 * (OneSignal REST API key, kept in a website's PWA configuration). A leaked table or backup used to hand over live
 * credentials (finding F-055). Same AES-256-GCM/scrypt shape as totp-crypto.ts and the same compatibility rules, with its own
 * variable so that leaking one class of secret does not give away another.
 *
 * Stored form: `enc:v1:` + base64(iv | authTag | ciphertext). A value without that prefix is a legacy clear-text secret
 * (saved before this existed, or while no key was configured): it is still accepted, and the startup backfill rewrites it
 * once a key is set. Without a key new values are stored as before, with a one-time warning (an existing installation keeps
 * working). Losing or changing the key makes encrypted values unreadable: the credentials have to be entered again.
 */

const KEY_ENV_VAR = 'INTEGRATION_SECRETS_ENCRYPTION_KEY';
export const INTEGRATION_SECRET_PREFIX = 'enc:v1:';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

let warnedNoKey = false;

function resolveKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const secret = env[KEY_ENV_VAR];
  if (!secret) return null;
  return scryptSync(secret, 'whoobe-integration-secrets', 32);
}

export function integrationSecretsEncryptionConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env[KEY_ENV_VAR];
}

export function isEncryptedIntegrationSecret(stored: string | null | undefined): boolean {
  return !!stored && stored.startsWith(INTEGRATION_SECRET_PREFIX);
}

/** Encrypts when a key is configured; without one the value is stored as before (one warning per process). Empty -> null. */
export function encryptIntegrationSecret(value: string | null | undefined, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!value) return null;
  if (isEncryptedIntegrationSecret(value)) return value; // never encrypt twice
  const key = resolveKey(env);
  if (!key) {
    if (!warnedNoKey) {
      warnedNoKey = true;
      console.warn(`${KEY_ENV_VAR} is not set: AI provider keys, the Figma token and the push provider key are stored in clear text. Set it to encrypt them at rest.`);
    }
    return value;
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return INTEGRATION_SECRET_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

/** Legacy clear text passes through; an encrypted value needs the key (fails closed, never returns garbage). */
export function decryptIntegrationSecret(stored: string | null | undefined, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!stored) return null;
  if (!stored.startsWith(INTEGRATION_SECRET_PREFIX)) return stored;
  const key = resolveKey(env);
  if (!key) throw new Error(`${KEY_ENV_VAR} is not set - cannot read the encrypted credential.`);
  const raw = Buffer.from(stored.slice(INTEGRATION_SECRET_PREFIX.length), 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
