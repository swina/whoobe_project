// The encryption of third-party credentials at rest (F-055): packages/core/src/db/integration-secrets-crypto.ts
import { describe, it, expect } from 'vitest'
import { encryptIntegrationSecret, decryptIntegrationSecret, isEncryptedIntegrationSecret, integrationSecretsEncryptionConfigured, redactPwaConfig } from '../../../packages/core/src/server'
import { DEFAULT_ROLE_PERMISSIONS } from '../../../packages/core/src/auth/permissions'

const env = (k?: string) => ({ ...(k ? { INTEGRATION_SECRETS_ENCRYPTION_KEY: k } : {}) }) as NodeJS.ProcessEnv

describe('integration secrets crypto', () => {
  it('round-trips, with a random IV each time and nothing readable in the stored form', () => {
    const a = encryptIntegrationSecret('sk-live-abc', env('k1'))!
    const b = encryptIntegrationSecret('sk-live-abc', env('k1'))!
    expect(a).toMatch(/^enc:v1:/)
    expect(a).not.toEqual(b)
    expect(a).not.toContain('abc')
    expect(decryptIntegrationSecret(a, env('k1'))).toBe('sk-live-abc')
    expect(isEncryptedIntegrationSecret(a)).toBe(true)
  })
  it('a wrong key or a damaged value fails closed instead of returning garbage', () => {
    const a = encryptIntegrationSecret('secret', env('k1'))!
    expect(() => decryptIntegrationSecret(a, env('k2'))).toThrow()
    expect(() => decryptIntegrationSecret(a, env())).toThrow(/INTEGRATION_SECRETS_ENCRYPTION_KEY/)
    expect(() => decryptIntegrationSecret(a.slice(0, -4) + 'AAAA', env('k1'))).toThrow()
  })
  it('legacy clear text passes through; empty is nothing; an encrypted value is not encrypted twice', () => {
    expect(decryptIntegrationSecret('plain-old-key', env('k1'))).toBe('plain-old-key')
    expect(decryptIntegrationSecret(null, env('k1'))).toBeNull()
    expect(encryptIntegrationSecret('', env('k1'))).toBeNull()
    expect(encryptIntegrationSecret(null, env('k1'))).toBeNull()
    const a = encryptIntegrationSecret('x', env('k1'))!
    expect(encryptIntegrationSecret(a, env('k1'))).toBe(a)
  })
  it('without a key a new value is stored as before (an existing install keeps working)', () => {
    expect(integrationSecretsEncryptionConfigured(env())).toBe(false)
    expect(encryptIntegrationSecret('sk', env())).toBe('sk')
  })
})

describe('redactPwaConfig', () => {
  it('removes the push key and says whether one is set', () => {
    expect(redactPwaConfig({ name: 'a', push: { provider: 'onesignal', onesignalAppId: 'x', onesignalApiKey: 'enc:v1:zzz' } }))
      .toEqual({ name: 'a', push: { provider: 'onesignal', onesignalAppId: 'x', onesignalApiKeySet: true } })
    expect(redactPwaConfig({ push: { provider: 'self' } })).toEqual({ push: { provider: 'self' } })
    expect(redactPwaConfig({ push: { onesignalApiKey: '', onesignalApiKeySet: true } })).toEqual({ push: {} })
    expect(redactPwaConfig({ name: 'no push' })).toEqual({ name: 'no push' })
    expect(redactPwaConfig(null)).toBeNull()
  })
})

describe('default roles (F-058)', () => {
  it('the editor can read and write content but not publish, delete, manage settings or users', () => {
    const e = DEFAULT_ROLE_PERMISSIONS.editor
    expect(e).toEqual(expect.arrayContaining(['objects:read', 'objects:write', 'assets:upload']))
    for (const k of ['objects:publish', 'objects:delete', 'settings:manage', 'users:manage', 'gateway:manage']) expect(e, k).not.toContain(k)
  })
  it('the viewer can read and nothing else that writes', () => {
    const v = DEFAULT_ROLE_PERMISSIONS.viewer
    expect(v).toContain('objects:read')
    for (const k of ['objects:write', 'objects:publish', 'objects:delete', 'assets:upload', 'assets:delete', 'settings:manage', 'users:manage']) expect(v, k).not.toContain(k)
  })
})
