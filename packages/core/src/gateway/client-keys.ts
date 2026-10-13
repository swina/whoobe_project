import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Keys of API clients (applications that call Whoobe: docs/plans/api-gateway/client-access-hub.md). A key is
// `wbk_<8 chars>_<secret>`: the first part is a lookup id, stored in clear, so a request finds its row without hashing
// every key; the whole key is never stored, only an HMAC-SHA-256 with the workspace pepper (SITE_API_KEY_PEPPER, already
// required for site keys). The secret is 32 random bytes, so a fast keyed hash is sound (nothing to brute-force);
// comparison is constant-time. Pure apart from reading the pepper.

const KEY_RE = /^wbk_([A-Za-z0-9]{8})_([A-Za-z0-9_-]{43})$/;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function pepper(): string {
  const p = process.env.SITE_API_KEY_PEPPER;
  if (!p) throw new Error('SITE_API_KEY_PEPPER is not set - required to create or verify API client keys.');
  return p;
}

export interface GeneratedClientKey {
  /** The only time the whole key exists outside the caller's hands. */
  plaintext: string;
  prefix: string;
  hash: string;
}

export function generateClientKey(): GeneratedClientKey {
  const bytes = randomBytes(8);
  let prefix = '';
  for (const b of bytes) prefix += ALPHABET[b % ALPHABET.length];
  const plaintext = `wbk_${prefix}_${randomBytes(32).toString('base64url')}`;
  return { plaintext, prefix, hash: hashClientKey(plaintext) };
}

/** `null` when the text is not shaped like a key (nothing to look up). */
export function parseClientKey(text: string | undefined | null): { prefix: string } | null {
  const m = typeof text === 'string' ? KEY_RE.exec(text) : null;
  return m ? { prefix: m[1] } : null;
}

export function hashClientKey(plaintext: string): string {
  return createHmac('sha256', pepper()).update('api-client-key:').update(plaintext).digest('base64');
}

export function verifyClientKey(plaintext: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashClientKey(plaintext));
  const stored = Buffer.from(storedHash);
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}
