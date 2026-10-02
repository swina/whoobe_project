// Target selection and safety rules (plan section 6): the suite only ever runs
// against a local/throwaway stack whose DB name contains `_sec_test`.
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const SECURITY_DIR = resolve(here, '..')
export const ROOT_DIR = resolve(SECURITY_DIR, '../..')

export const ENV_FILE = process.env.SEC_ENV_FILE ?? resolve(SECURITY_DIR, '.env.sectest')

export function readEnvFile(path = ENV_FILE): Record<string, string> {
  if (!existsSync(path)) {
    throw new Error(`Env file ${path} not found - run scripts/security/stack.sh up first (or set SEC_ENV_FILE)`)
  }
  const out: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line)
    if (m) out[m[1]] = m[2]
  }
  return out
}

const env = (() => { try { return readEnvFile() } catch { return {} as Record<string, string> } })()

export const TARGET = (process.env.SECURITY_TEST_TARGET ?? `http://localhost:${env.WS_CORE_API_PORT ?? '3103'}`).replace(/\/+$/, '')
export const GATEWAY_TARGET = (process.env.SECURITY_TEST_GATEWAY ?? `http://localhost:${env.WS_GATEWAY_PORT ?? '3101'}`).replace(/\/+$/, '')
export const ASSET_TARGET = (process.env.SECURITY_TEST_ASSET_PROCESSOR ?? `http://localhost:${env.WS_ASSET_PROCESSOR_PORT ?? '3102'}`).replace(/\/+$/, '')

export function assertSafeTarget(): void {
  for (const url of [TARGET, GATEWAY_TARGET, ASSET_TARGET]) {
    const host = new URL(url).hostname
    const allowed = (process.env.SECURITY_TEST_ALLOW_HOSTS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    const ok = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.local') || allowed.includes(host)
    if (!ok) {
      throw new Error(`Refusing to run against ${url}: host must be localhost, *.local or listed in SECURITY_TEST_ALLOW_HOSTS`)
    }
  }
  const db = env.DB_NAME ?? process.env.SECURITY_TEST_DB_NAME ?? ''
  if (!db.includes('_sec_test')) {
    throw new Error(`Refusing to run: DB_NAME "${db}" in ${ENV_FILE} must contain "_sec_test" (never point this suite at a real database)`)
  }
}

export const ADMIN_EMAIL = env.SEED_ADMIN_EMAIL ?? 'admin@sectest.local'
export const ADMIN_PASSWORD = env.SEED_ADMIN_PASSWORD ?? ''
// Deterministic password for the seeded role users (derived, so no extra secret to manage).
export const ROLE_USER_PASSWORD = `Sec-${ADMIN_PASSWORD}-1!`
