import { randomBytes } from 'node:crypto';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { hashPassword, verifyPassword } from './password.js';
import type { MfaRecoveryCode } from '../db/auth-schema.js';

const ISSUER = 'Whoobe';

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function totpKeyUri(email: string, secret: string): string {
  return authenticator.keyuri(email, ISSUER, secret);
}

export async function totpQrCodeDataUrl(otpauthUri: string): Promise<string> {
  return QRCode.toDataURL(otpauthUri);
}

/** authenticator.check() itself already tolerates the standard +/-1 time
 * step clock drift window - no extra slop needed here. */
export function verifyTotpToken(secret: string, token: string): boolean {
  try {
    return authenticator.check(token, secret);
  } catch {
    // Malformed token (non-digit, wrong length) - treat as invalid, not a crash.
    return false;
  }
}

// 5 random bytes -> 10 hex chars, grouped as XXXXX-XXXXX for readability
// when a user has to type one back in by hand.
function formatRecoveryCode(): string {
  const raw = randomBytes(5).toString('hex');
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, formatRecoveryCode);
}

/** Recovery codes are hashed with the same argon2 helper passwords use -
 * they're one-time secrets with the same "never store in plaintext" need,
 * not a case that calls for a different primitive. */
export async function hashRecoveryCodes(codes: string[]): Promise<MfaRecoveryCode[]> {
  return Promise.all(codes.map(async (code) => ({ hash: await hashPassword(code), usedAt: null })));
}

/**
 * Finds the first unused code matching `candidate` and returns the full
 * array with that entry marked used - null if no unused code matches.
 * Checks every unused entry rather than short-circuiting on a stored
 * lookup key, same reasoning argon2 hashing itself implies: there's no
 * cheaper way to find "which hash does this match" than verifying against
 * each candidate.
 */
export async function consumeRecoveryCode(
  records: MfaRecoveryCode[],
  candidate: string
): Promise<MfaRecoveryCode[] | null> {
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record.usedAt) continue;
    if (await verifyPassword(record.hash, candidate)) {
      const updated = [...records];
      updated[i] = { ...record, usedAt: new Date().toISOString() };
      return updated;
    }
  }
  return null;
}
