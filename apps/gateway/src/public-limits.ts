import { createFixedWindowLimiter } from '@whoobe-cms/core/server';

// Public gateway routes (resolve / submit) are called by anonymous visitors of published sites and the
// bindingId is public (it sits in the page content). Two layers, so that neither one visitor nor the
// shared per-site bucket alone can lock everybody out:
//  - per client address, checked BEFORE any database lookup (a flood of random bindingIds costs nothing);
//  - per site, a much higher ceiling than the old 10-per-15-minutes total that one stranger could exhaust.
export const submitIpLimiter = createFixedWindowLimiter({ max: 10, windowMs: 15 * 60 * 1000 });
export const submitSiteLimiter = createFixedWindowLimiter({ max: 300, windowMs: 15 * 60 * 1000 });
export const resolveIpLimiter = createFixedWindowLimiter({ max: 120, windowMs: 60 * 1000 });
export const resolveSiteLimiter = createFixedWindowLimiter({ max: 1200, windowMs: 60 * 1000 });

const MAX_FIELDS = 100;
const MAX_KEY_LENGTH = 64;
const MAX_VALUE_LENGTH = 20_000;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Shape limits for what a visitor may send to an upstream API through a form: bounded field count,
 *  plain key names, bounded string length. Returns an error message, or null when acceptable. */
export function validateSubmittedAttributes(attributes: Record<string, unknown>): string | null {
  const entries = Object.entries(attributes);
  if (entries.length > MAX_FIELDS) return `Too many fields (max ${MAX_FIELDS})`;
  for (const [key, value] of entries) {
    if (key.length === 0 || key.length > MAX_KEY_LENGTH || !/^[\p{L}\p{N}_.\-[\] ]+$/u.test(key) || FORBIDDEN_KEYS.has(key)) return 'Invalid field name';
    if (typeof value === 'string' && value.length > MAX_VALUE_LENGTH) return `Field "${key}" is too long`;
  }
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);
