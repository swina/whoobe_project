import { describe, expect, it } from 'vitest';
import { decryptTotpSecret, encryptTotpSecret, isEncryptedTotpSecret, totpEncryptionConfigured } from './totp-crypto.js';

const withKey = (k = 'k1-test-key-value') => ({ TOTP_ENCRYPTION_KEY: k }) as NodeJS.ProcessEnv;

describe('totp-crypto', () => {
  it('round-trips and never stores the secret in clear when a key is set', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const stored = encryptTotpSecret(secret, withKey());
    expect(isEncryptedTotpSecret(stored)).toBe(true);
    expect(stored).not.toContain(secret);
    expect(decryptTotpSecret(stored, withKey())).toBe(secret);
  });

  it('uses a fresh IV each time', () => {
    expect(encryptTotpSecret('ABC', withKey())).not.toBe(encryptTotpSecret('ABC', withKey()));
  });

  it('passes legacy plaintext through, and null stays null', () => {
    expect(decryptTotpSecret('JBSWY3DPEHPK3PXP', withKey())).toBe('JBSWY3DPEHPK3PXP');
    expect(decryptTotpSecret('JBSWY3DPEHPK3PXP', {} as any)).toBe('JBSWY3DPEHPK3PXP');
    expect(decryptTotpSecret(null, withKey())).toBeNull();
  });

  it('fails closed: wrong key, missing key and tampering never yield a value', () => {
    const stored = encryptTotpSecret('JBSWY3DPEHPK3PXP', withKey());
    expect(() => decryptTotpSecret(stored, withKey('another-key'))).toThrow();
    expect(() => decryptTotpSecret(stored, {} as any)).toThrow(/not set/);
    const bytes = Buffer.from(stored.slice('enc:v1:'.length), 'base64');
    bytes[bytes.length - 1] ^= 1;
    expect(() => decryptTotpSecret('enc:v1:' + bytes.toString('base64'), withKey())).toThrow();
  });

  it('without a key the secret is stored as before', () => {
    expect(totpEncryptionConfigured({} as any)).toBe(false);
    expect(encryptTotpSecret('ABC', {} as any)).toBe('ABC');
  });
});
