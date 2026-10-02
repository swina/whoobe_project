// Plan 3.2: routes.expected.json is the source of truth for who may call what.
// A route added/removed/changed in server.ts without updating that file fails here.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { extractRoutes } from '../extract-routes'
import { SECURITY_DIR } from '../lib/config'

interface Expected { access: string; permissions: string[]; note?: string }
const expected: Record<string, Expected> = JSON.parse(readFileSync(resolve(SECURITY_DIR, 'routes.expected.json'), 'utf8')).routes
const actual = extractRoutes()

describe('route table drift (core-api)', () => {
  it('has no route missing from routes.expected.json', () => {
    const missing = actual.filter((r) => !expected[r.key]).map((r) => `${r.key} (${r.access}, line ${r.line})`)
    expect(missing, 'new routes: add them to routes.expected.json after deciding their access').toEqual([])
  })

  it('has no stale entries in routes.expected.json', () => {
    const keys = new Set(actual.map((r) => r.key))
    expect(Object.keys(expected).filter((k) => !keys.has(k))).toEqual([])
  })

  it('keeps each route access level and permission as expected', () => {
    const diffs = actual
      .filter((r) => expected[r.key])
      .filter((r) => expected[r.key].access !== r.access || expected[r.key].permissions.join() !== r.permissions.join())
      .map((r) => `${r.key}: expected ${expected[r.key].access}[${expected[r.key].permissions}] got ${r.access}[${r.permissions}]`)
    expect(diffs).toEqual([])
  })

  it('has no duplicate route registrations', () => {
    const seen = new Map<string, number>()
    for (const r of actual) seen.set(r.key, (seen.get(r.key) ?? 0) + 1)
    expect([...seen].filter(([, n]) => n > 1).map(([k]) => k)).toEqual([])
  })
})
