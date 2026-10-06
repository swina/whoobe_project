import { describe, expect, it } from 'vitest';
import { assetMaxCount, assetMaxFileBytes, isSandbox, isSandboxBlockedPath, isSandboxReadOnlyPath, sandboxStatus } from './sandbox.js';

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
      .toEqual({ resetAt: '2026-10-06T15:00:00Z', maxFileBytes: 50 * 1024 * 1024, maxAssets: 50 });
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
});
