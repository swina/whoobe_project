import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'node:crypto';

/**
 * Encryption at rest for `gateway_endpoints.auth_config_encrypted` - the API
 * Gateway's stored per-endpoint credentials (API keys, bearer tokens,
 * basic-auth username/password) used to authenticate outbound calls to
 * third-party APIs (apps/gateway/src/{resolve-handler,remote-router,
 * admin-routes}.ts). Same AES-256-GCM/scrypt shape as migration-sources-
 * crypto.ts's dbPasswordEncrypted, and for the same reason: a leaked table
 * hands over live third-party credentials, a materially larger blast
 * radius than plaintext-at-rest usually gets credit for. A separate env
 * var (rather than reusing MIGRATION_SOURCE_ENCRYPTION_KEY) means a leak of
 * one secret class doesn't compromise the other.
 */

const KEY_ENV_VAR = 'GATEWAY_AUTH_ENCRYPTION_KEY';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function resolveKey(): Buffer {
  const secret = process.env[KEY_ENV_VAR];
  if (!secret) {
    throw new Error(`${KEY_ENV_VAR} is not set - required to store or read gateway endpoint credentials.`);
  }
  return scryptSync(secret, 'whoobe-gateway-auth-config', 32);
}

/** `null`/`undefined`/`{}` all encode to `null` (nothing to encrypt) so an
 *  endpoint with authType 'none' doesn't pay for a ciphertext of "{}". */
export function encryptGatewayAuthConfig(config: Record<string, unknown> | null | undefined): string | null {
  if (!config || Object.keys(config).length === 0) return null;
  const key = resolveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(config), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

export function decryptGatewayAuthConfig(encoded: string | null | undefined): Record<string, unknown> {
  if (!encoded) return {};
  const key = resolveKey();
  const raw = Buffer.from(encoded, 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'));
}

/** Same AES-256-GCM/key as encryptGatewayAuthConfig - this is still "gateway
 *  credentials," just a different sub-field (the OAuth2 access token cache,
 *  see 0040_gateway_oauth_tokens.sql), not a separate secret class, so it
 *  reuses GATEWAY_AUTH_ENCRYPTION_KEY rather than a new env var. */
export function encryptGatewayOAuthToken(token: string): string {
  const key = resolveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

export function decryptGatewayOAuthToken(encoded: string | null | undefined): string | null {
  if (!encoded) return null;
  const key = resolveKey();
  const raw = Buffer.from(encoded, 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
