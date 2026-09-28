import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

/**
 * Per-website static API key a published site presents to the Gateway
 * (X-Whoobe-Site-Key header, alongside X-Whoobe-Site-Id) - see docs/plans/
 * api-gateway/gateway-auth-authz.md. Unlike gateway-auth-crypto.ts's AES-GCM
 * (reversible, for credentials the gateway itself must send onward), this key
 * only ever needs a fast equality check on every public gateway request, so
 * it's a salted SHA-256 digest, not the slow argon2id used for user
 * passwords (packages/core/src/auth/password.ts) or a reversible cipher -
 * the plaintext itself is never stored anywhere after generation.
 */

const PEPPER_ENV_VAR = 'SITE_API_KEY_PEPPER';
const KEY_PREFIX = 'whb_site_';

function resolvePepper(): string {
  const pepper = process.env[PEPPER_ENV_VAR];
  if (!pepper) {
    throw new Error(`${PEPPER_ENV_VAR} is not set - required to generate or verify a site API key.`);
  }
  return pepper;
}

/** Generates a new plaintext site key. Callers must persist only its hash
 *  (hashSiteApiKey) and show this value to the admin exactly once. */
export function generateSiteApiKey(): string {
  return `${KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
}

/** First 12 chars of the plaintext (including the fixed prefix) - enough to
 *  recognize a rotated key in the admin UI without ever storing the rest. */
export function siteApiKeyDisplayPrefix(plaintext: string): string {
  return plaintext.slice(0, KEY_PREFIX.length + 4);
}

export function hashSiteApiKey(plaintext: string): string {
  return createHash('sha256').update(resolvePepper()).update(plaintext).digest('base64');
}

/** Constant-time compare against a stored hash - never a plain `===`, since
 *  this runs on every public gateway request and a timing difference would
 *  leak how many leading bytes of a guessed key were correct. */
export function verifySiteApiKeyHash(plaintext: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashSiteApiKey(plaintext));
  const stored = Buffer.from(storedHash);
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}
