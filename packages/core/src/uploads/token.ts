// The ticket that lets a browser send the bytes of ONE file: issued by the "intent" step after the limits were checked, signed
// (HMAC-SHA256) and short-lived, so the upload endpoint needs no session and trusts nothing the visitor says in the second step.
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface UploadTicket {
  /** upload id (the row of form_uploads) */
  u: string;
  /** website */
  w: string;
  /** the form the file is for (the id of the authored form element) */
  f: string;
  /** the extension that was approved, and that the content must match */
  x: string;
  /** the largest body accepted, in bytes */
  m: number;
  /** expiry, seconds since the epoch */
  e: number;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

function mac(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

export function signUploadTicket(ticket: UploadTicket, secret: string): string {
  if (!secret || secret.length < 16) throw new Error('The upload token secret is missing or too short');
  const payload = b64(JSON.stringify(ticket));
  return `${payload}.${b64(mac(payload, secret))}`;
}

/** Returns the ticket, or null for anything malformed, forged or expired. */
export function verifyUploadTicket(token: unknown, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): UploadTicket | null {
  if (typeof token !== 'string' || token.length > 2048 || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  let given: Buffer;
  try {
    given = Buffer.from(sig, 'base64url');
  } catch {
    return null;
  }
  const expected = mac(payload, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const t = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<UploadTicket>;
    if (typeof t.u !== 'string' || typeof t.w !== 'string' || typeof t.f !== 'string' || typeof t.x !== 'string') return null;
    if (typeof t.m !== 'number' || !(t.m > 0) || typeof t.e !== 'number' || t.e < nowSeconds) return null;
    return t as UploadTicket;
  } catch {
    return null;
  }
}
