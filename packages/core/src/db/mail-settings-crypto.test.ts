import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decryptMailProviderConfig, decryptMailSecret, encryptMailProviderConfig, encryptMailSecret, mailEncryptionConfigured } from './mail-settings-crypto.js';

const saved = process.env.MAIL_SETTINGS_ENCRYPTION_KEY;
beforeEach(() => { process.env.MAIL_SETTINGS_ENCRYPTION_KEY = 'a-test-key-for-mail-settings'; });
afterEach(() => { if (saved === undefined) delete process.env.MAIL_SETTINGS_ENCRYPTION_KEY; else process.env.MAIL_SETTINGS_ENCRYPTION_KEY = saved; });

describe('mail settings encryption', () => {
  it('round-trips a secret and a provider configuration, and the ciphertext hides them', () => {
    const c = encryptMailSecret('smtp-p@ss')!;
    expect(c).not.toContain('smtp-p@ss');
    expect(decryptMailSecret(c)).toBe('smtp-p@ss');
    const cfg = { appId: 'abc', apiKey: 'os_v2_secret' };
    const e = encryptMailProviderConfig(cfg)!;
    expect(e).not.toContain('os_v2_secret');
    expect(decryptMailProviderConfig(e)).toEqual(cfg);
  });
  it('uses a fresh IV every time', () => {
    expect(encryptMailSecret('same')).not.toBe(encryptMailSecret('same'));
  });
  it('encodes nothing for nothing', () => {
    expect(encryptMailSecret('')).toBeNull();
    expect(encryptMailSecret(null)).toBeNull();
    expect(encryptMailProviderConfig({})).toBeNull();
    expect(decryptMailSecret(null)).toBeNull();
    expect(decryptMailProviderConfig(null)).toEqual({});
  });
  it('refuses a tampered ciphertext and another key', () => {
    const c = encryptMailSecret('x')!;
    const raw = Buffer.from(c, 'base64'); raw[raw.length - 1] ^= 1;
    expect(() => decryptMailSecret(raw.toString('base64'))).toThrow();
    process.env.MAIL_SETTINGS_ENCRYPTION_KEY = 'another-key';
    expect(() => decryptMailSecret(c)).toThrow();
  });
  it('fails clearly without the key, and says whether it is configured', () => {
    expect(mailEncryptionConfigured()).toBe(true);
    delete process.env.MAIL_SETTINGS_ENCRYPTION_KEY;
    expect(mailEncryptionConfigured()).toBe(false);
    expect(() => encryptMailSecret('x')).toThrow(/MAIL_SETTINGS_ENCRYPTION_KEY is not set/);
  });
});
