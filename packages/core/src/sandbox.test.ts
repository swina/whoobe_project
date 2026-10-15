import { describe, expect, it } from 'vitest';
import { assetMaxCount, assetMaxFileBytes, isSandbox, isSandboxBlockedPath, isSandboxHostAllowed, sandboxAllowedHosts, isSandboxReadOnlyPath, sandboxStatus } from './sandbox.js';

describe('sandbox mode', () => {
  it('is off unless SANDBOX_MODE is 1/true', () => {
    expect(isSandbox({})).toBe(false);
    expect(isSandbox({ SANDBOX_MODE: '0' })).toBe(false);
    expect(isSandbox({ SANDBOX_MODE: '1' })).toBe(true);
    expect(sandboxStatus({})).toBeNull();
  });
  it('reads the asset limits, with a 50 MB default and no count limit', () => {
    expect(assetMaxFileBytes({})).toBe(50 * 1024 * 1024);
    expect(assetMaxFileBytes({ ASSET_MAX_FILE_BYTES: '5242880' })).toBe(5242880);
    expect(assetMaxFileBytes({ ASSET_MAX_FILE_BYTES: 'abc' })).toBe(50 * 1024 * 1024);
    expect(assetMaxCount({})).toBeNull();
    expect(assetMaxCount({ ASSET_MAX_COUNT: '50' })).toBe(50);
    expect(sandboxStatus({ SANDBOX_MODE: '1', ASSET_MAX_COUNT: '50', SANDBOX_RESET_AT: '2026-10-06T15:00:00Z' }))
      .toEqual({ resetAt: '2026-10-06T15:00:00Z', maxFileBytes: 50 * 1024 * 1024, maxAssets: 50, demo: null });
  });
  it('shows the demo account only when both its e-mail and password are set', () => {
    const base = { SANDBOX_MODE: '1' };
    expect(sandboxStatus({ ...base, SANDBOX_DEMO_EMAIL: 'demo@x.test' })?.demo).toBeNull();
    expect(sandboxStatus({ ...base, SANDBOX_DEMO_PASSWORD: 'pw' })?.demo).toBeNull();
    expect(sandboxStatus({ ...base, SANDBOX_DEMO_EMAIL: 'demo@x.test', SANDBOX_DEMO_PASSWORD: 'pw' })?.demo).toEqual({ email: 'demo@x.test', password: 'pw' });
    expect(sandboxStatus({ SANDBOX_DEMO_EMAIL: 'demo@x.test', SANDBOX_DEMO_PASSWORD: 'pw' })).toBeNull();
  });
  it('blocks outbound/build features and nothing else', () => {
    for (const p of ['/ai/generate', '/mail-settings/test', '/mail-log', '/figma/import', '/migration-sources/x/import-objects',
      '/whoobe-one/websites/abc/generate-pwa', '/whoobe-one/websites/abc/gateway-api-key/regenerate']) expect(isSandboxBlockedPath(p)).toBe(true);
    for (const p of ['/health', '/auth/login', '/whoobe-one/websites', '/objects', '/whoobe-one/websites/abc/export']) expect(isSandboxBlockedPath(p)).toBe(false);
  });
  it('lets the demo account read users and roles but not change them', () => {
    expect(isSandboxReadOnlyPath('GET', '/auth/users')).toBe(false);
    expect(isSandboxReadOnlyPath('GET', '/auth/roles/abc')).toBe(false);
    for (const [m, p] of [['POST', '/auth/users'], ['PATCH', '/auth/users/1'], ['DELETE', '/auth/users/1'], ['POST', '/auth/users/1/reset-password'],
      ['POST', '/auth/roles'], ['PATCH', '/auth/roles/1'], ['DELETE', '/auth/roles/1'], ['POST', '/auth/mfa/setup'], ['POST', '/auth/mfa/disable']]) {
      expect(isSandboxReadOnlyPath(m, p), `${m} ${p}`).toBe(true);
    }
    expect(isSandboxReadOnlyPath('POST', '/auth/login')).toBe(false);
    expect(isSandboxReadOnlyPath('POST', '/auth/logout')).toBe(false);
  });
  it('allows outbound calls only to the listed hosts, by exact name', () => {
    expect(sandboxAllowedHosts({})).toEqual([]);
    const env = { SANDBOX_ALLOW_HOSTS: ' DummyJSON.com , api.example.org ' };
    expect(sandboxAllowedHosts(env)).toEqual(['dummyjson.com', 'api.example.org']);
    expect(isSandboxHostAllowed('dummyjson.com', env)).toBe(true);
    expect(isSandboxHostAllowed('DUMMYJSON.COM', env)).toBe(true);
    for (const h of ['evil.dummyjson.com', 'dummyjson.com.evil.io', 'localhost', '127.0.0.1', '169.254.169.254', '']) expect(isSandboxHostAllowed(h, env), h).toBe(false);
    expect(isSandboxHostAllowed('dummyjson.com', {})).toBe(false);
  });
});
