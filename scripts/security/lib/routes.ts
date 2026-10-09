import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SECURITY_DIR } from './config'
import { PERMISSION_KEYS } from './permissions'

export interface ExpectedRoute { key: string; method: string; path: string; access: 'public' | 'auth' | 'permission'; permissions: string[]; mode: 'all' | 'any'; note?: string }

export const ZERO_UUID = '00000000-0000-4000-8000-000000000000'

export function loadExpectedRoutes(): ExpectedRoute[] {
  const file = JSON.parse(readFileSync(resolve(SECURITY_DIR, 'routes.expected.json'), 'utf8'))
  return Object.entries<any>(file.routes).map(([key, v]) => {
    const [method, ...rest] = key.split(' ')
    return {
      key, method, path: rest.join(' '), access: v.access, note: v.note, mode: v.mode === 'any' ? 'any' : 'all',
      permissions: (v.permissions as string[]).map((n) => {
        const k = PERMISSION_KEYS[n]
        if (!k) throw new Error(`unknown permission ${n} in routes.expected.json`)
        return k
      }),
    }
  })
}

/** Replace `:param` and `*` with harmless values (a well-formed UUID that matches nothing). */
export function concretePath(path: string): string {
  return path.replace(/:[A-Za-z]+/g, ZERO_UUID).replace(/\*/g, 'x')
}
