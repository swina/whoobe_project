import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getConnectionConfig, resolveDbPassword, resolveSslConfig } from './client.js';

describe('resolveSslConfig', () => {
  it('is off by default and for the "no TLS" spellings', () => {
    for (const v of [undefined, '', 'disable', 'false', 'off', 'prefer', 'allow']) expect(resolveSslConfig({ DB_SSL: v })).toBeUndefined();
  });
  it('require encrypts without checking the certificate', () => {
    expect(resolveSslConfig({ DB_SSL: 'require' })).toEqual({ rejectUnauthorized: false });
  });
  it('verify-full checks the chain, verify-ca is treated as the stricter verify-full', () => {
    expect(resolveSslConfig({ DB_SSL: 'verify-full' })).toEqual({ rejectUnauthorized: true });
    expect(resolveSslConfig({ DB_SSL: 'verify-ca' })).toEqual({ rejectUnauthorized: true });
  });
  it('reads the CA from a file or from the PEM text', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ca-'));
    try {
      const file = join(dir, 'ca.pem');
      writeFileSync(file, '-----BEGIN CERTIFICATE-----\nAAA\n-----END CERTIFICATE-----\n');
      expect(resolveSslConfig({ DB_SSL: 'verify-full', DB_SSL_CA: file })?.ca).toContain('BEGIN CERTIFICATE');
      expect(resolveSslConfig({ DB_SSL: 'verify-full', DB_SSL_CA: '-----BEGIN CERTIFICATE-----\nBBB\n-----END CERTIFICATE-----' })?.ca).toContain('BBB');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('an unreadable CA file or an unknown mode is an error, never a silent plain connection', () => {
    expect(() => resolveSslConfig({ DB_SSL: 'verify-full', DB_SSL_CA: '/nonexistent/ca.pem' })).toThrow();
    expect(() => resolveSslConfig({ DB_SSL: 'sometimes' })).toThrow(/not valid/);
  });
  it('DB_SSL wins over the sslmode of a connection string', () => {
    expect(resolveSslConfig({ DB_SSL: 'disable' }, 'require')).toBeUndefined();
    expect(resolveSslConfig({}, 'require')).toEqual({ rejectUnauthorized: false });
  });
});

describe('getConnectionConfig', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });
  it('takes sslmode from DATABASE_URL', () => {
    process.env.DATABASE_URL = 'postgres://u:p@db.example.com:5432/app?sslmode=require';
    delete process.env.DB_SSL;
    expect(getConnectionConfig().ssl).toEqual({ rejectUnauthorized: false });
  });
  it('has no ssl without any setting', () => {
    delete process.env.DATABASE_URL; delete process.env.DB_SSL;
    expect(getConnectionConfig().ssl).toBeUndefined();
  });
});

describe('resolveDbPassword (F-057)', () => {
  it('uses DB_PASSWORD when it is set, whatever the environment', () => {
    for (const NODE_ENV of ['production', 'development', 'test', undefined]) expect(resolveDbPassword({ DB_PASSWORD: 's3cret', NODE_ENV } as any)).toBe('s3cret');
  });
  it('has a default only for development and tests', () => {
    expect(resolveDbPassword({ NODE_ENV: 'development' } as any)).toBe('postgrespassword');
    expect(resolveDbPassword({ NODE_ENV: 'test' } as any)).toBe('postgrespassword');
  });
  it('refuses to start anywhere else without a password, naming the variable', () => {
    for (const NODE_ENV of ['production', 'staging', undefined, '']) {
      expect(() => resolveDbPassword({ NODE_ENV } as any), String(NODE_ENV)).toThrow(/DB_PASSWORD is not set/);
    }
    expect(() => resolveDbPassword({ NODE_ENV: 'production', DB_PASSWORD: '' } as any)).toThrow(/DB_PASSWORD/);
  });
});
