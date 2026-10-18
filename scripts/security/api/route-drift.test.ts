// Plan 3.2: routes.expected.json is the source of truth for who may call what.
// A route added/removed/changed in server.ts without updating that file fails here.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { extractRoutes } from '../extract-routes'
import { SECURITY_DIR, ROOT_DIR } from '../lib/config'

interface Expected { access: string; permissions: string[]; mode?: string; note?: string; audit?: string }
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
      .filter((r) => expected[r.key].access !== r.access || expected[r.key].permissions.join() !== r.permissions.join() || (expected[r.key].mode ?? 'all') !== r.mode)
      .map((r) => `${r.key}: expected ${expected[r.key].access}[${expected[r.key].permissions}] ${expected[r.key].mode ?? 'all'} got ${r.access}[${r.permissions}] ${r.mode}`)
    expect(diffs).toEqual([])
  })

  it('has no duplicate route registrations', () => {
    const seen = new Map<string, number>()
    for (const r of actual) seen.set(r.key, (seen.get(r.key) ?? 0) + 1)
    expect([...seen].filter(([, n]) => n > 1).map(([k]) => k)).toEqual([])
  })

  // Audit log (docs/plans/system/audit-log-plan.md, section 6): a route that changes something must say whether it is audited
  const changing = (key: string) => /^(POST|PUT|PATCH|DELETE) /.test(key)

  it('has an audit decision for every route that changes something', () => {
    const missing = actual.filter((r) => changing(r.key) && expected[r.key] && !expected[r.key].audit).map((r) => r.key)
    expect(missing, 'add "audit": "<AuditName>" (and audited(AUDIT.<name>) on the route) or "audit": "exempt: <reason>" to routes.expected.json').toEqual([])
  })

  it('wraps exactly the routes that are decided as audited, with the decided spec', () => {
    const diffs = actual
      .filter((r) => changing(r.key) && expected[r.key]?.audit)
      .filter((r) => {
        const a = expected[r.key].audit!
        const decidedAudited = !a.startsWith('exempt:') && !a.startsWith('todo:')
        return decidedAudited ? r.audit !== a : r.audit !== null
      })
      .map((r) => `${r.key}: decided "${expected[r.key].audit}", the route has ${r.audit ? `audited(AUDIT.${r.audit})` : 'no audited(...)'}`)
    expect(diffs).toEqual([])
  })

  it('an exemption states a reason', () => {
    const bare = Object.entries(expected).filter(([, v]) => v.audit?.startsWith('exempt:') && v.audit.length < 20).map(([k]) => k)
    expect(bare).toEqual([])
  })

  it('every spec in audit-specs.ts is used by a route, and every route names a spec that exists', () => {
    const src = readFileSync(resolve(ROOT_DIR, 'apps/core-api/src/audit-specs.ts'), 'utf8')
    const block = src.slice(src.indexOf('export const AUDIT'))
    const defined = [...block.matchAll(/^  (\w+):/gm)].map((m) => m[1])
    const used = new Set(actual.map((r) => r.audit).filter(Boolean) as string[])
    expect(defined.filter((n) => !used.has(n)), 'a spec nobody uses').toEqual([])
    expect([...used].filter((n) => !defined.includes(n)), 'a route names a spec that is not defined').toEqual([])
  })

  it('has no audit decision left to do ("todo:") - none may ship', () => {
    expect(Object.entries(expected).filter(([, v]) => v.audit?.startsWith('todo:')).map(([k]) => k)).toEqual([])
  })
})
