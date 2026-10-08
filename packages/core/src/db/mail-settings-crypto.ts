import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'node:crypto';

/**
 * Encryption at rest for the outgoing-mail credentials: the SMTP password (`mail_settings.password_encrypted`) and the
 * configuration of an HTTP mail provider such as OneSignal (`provider_config_encrypted`, which holds the API key).
 * Same AES-256-GCM/scrypt shape as gateway-auth-crypto.ts and for the same reason (a leaked table hands over a live
 * credential - the SMTP password used to sit in the clear in `mail_settings.password`), with its own environment
 * variable so a leak of one secret class does not give away another.
 */

const KEY_ENV_VAR = 'MAIL_SETTINGS_ENCRYPTION_KEY';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/** Is the key configured? Without it nothing secret can be stored or read; the settings screens say so. */
export function mailEncryptionConfigured(): boolean {
  return !!process.env[KEY_ENV_VAR];
}

function resolveKey(): Buffer {
  const secret = process.env[KEY_ENV_VAR];
  if (!secret) {
    throw new Error(`${KEY_ENV_VAR} is not set - required to store or read outgoing-mail credentials.`);
  }
  return scryptSync(secret, 'whoobe-mail-settings', 32);
}

function encryptText(plain: string): string {
  const key = resolveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

function decryptText(encoded: string): string {
  const key = resolveKey();
  const raw = Buffer.from(encoded, 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Empty or missing -> `null` (nothing to protect). */
export function encryptMailSecret(value: string | null | undefined): string | null {
  return value ? encryptText(value) : null;
}

export function decryptMailSecret(encoded: string | null | undefined): string | null {
  return encoded ? decryptText(encoded) : null;
}

export function encryptMailProviderConfig(config: Record<string, unknown> | null | undefined): string | null {
  if (!config || Object.keys(config).length === 0) return null;
  return encryptText(JSON.stringify(config));
}

export function decryptMailProviderConfig(encoded: string | null | undefined): Record<string, unknown> {
  if (!encoded) return {};
  return JSON.parse(decryptText(encoded));
}
