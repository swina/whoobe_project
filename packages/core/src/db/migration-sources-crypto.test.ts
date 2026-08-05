import { describe, it, expect, beforeEach } from 'vitest';
import { encryptMigrationSourceSecret, decryptMigrationSourceSecret } from './migration-sources-crypto.js';

describe('migration-sources-crypto', () => {
  beforeEach(() => {
    process.env.MIGRATION_SOURCE_ENCRYPTION_KEY = 'test-only-key-do-not-use-in-prod';
  });

  it('round-trips a plaintext password through encrypt/decrypt', () => {
    const encrypted = encryptMigrationSourceSecret('s3cr3t-pimcore-db-password');
    expect(encrypted).not.toContain('s3cr3t');
    expect(decryptMigrationSourceSecret(encrypted)).toBe('s3cr3t-pimcore-db-password');
  });

  it('produces different ciphertext for the same plaintext each call (random IV)', () => {
    const a = encryptMigrationSourceSecret('same-password');
    const b = encryptMigrationSourceSecret('same-password');
    expect(a).not.toBe(b);
    expect(decryptMigrationSourceSecret(a)).toBe('same-password');
    expect(decryptMigrationSourceSecret(b)).toBe('same-password');
  });

  it('rejects a tampered ciphertext instead of returning garbage credentials', () => {
    const encrypted = encryptMigrationSourceSecret('s3cr3t-pimcore-db-password');
    const raw = Buffer.from(encrypted, 'base64');
    raw[raw.length - 1] ^= 0xff; // flip a byte in the ciphertext tail
    const tampered = raw.toString('base64');
    expect(() => decryptMigrationSourceSecret(tampered)).toThrow();
  });

  it('throws a clear error when the encryption key env var is unset', () => {
    delete process.env.MIGRATION_SOURCE_ENCRYPTION_KEY;
    expect(() => encryptMigrationSourceSecret('anything')).toThrow(/MIGRATION_SOURCE_ENCRYPTION_KEY/);
  });
});
