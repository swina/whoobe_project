// Static route-table extraction for core-api (plan 3.2): every `app.<verb>(path, ...)`
// in server.ts, with the access guard found in its middleware list. The result is
// diffed against routes.expected.json by api/route-drift.test.ts.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ROOT_DIR, SECURITY_DIR } from './lib/config'

export type Access = 'public' | 'auth' | 'permission'
export interface RouteInfo {
  key: string // "GET /auth/users"
  method: string
  path: string
  access: Access
  permissions: string[]
  /** `any`: one of the listed keys is enough (a granular key or the broad key that always covered it); default: all */
  mode: 'all' | 'any'
  line: number
}

export function extractRoutes(file = resolve(ROOT_DIR, 'apps/core-api/src/server.ts')): RouteInfo[] {
  const src = readFileSync(file, 'utf8')
  const re = /^app\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2/gm
  const routes: RouteInfo[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length
    const rest = src.slice(start, start + 800)
    // middleware list = text up to the handler (first `=>`)
    const arrow = rest.indexOf('=>')
    const mw = arrow >= 0 ? rest.slice(0, arrow) : rest
    const single = [...mw.matchAll(/requirePermission\(\s*PERMISSIONS\.(\w+)\s*\)/g)].map((x) => x[1])
    const anyOf = mw.match(/requireAnyPermission\(([^)]*)\)/)
    const anyKeys = anyOf ? [...anyOf[1].matchAll(/PERMISSIONS\.(\w+)/g)].map((x) => x[1]) : []
    const permissions = anyKeys.length ? anyKeys : single
    const mode: 'all' | 'any' = anyKeys.length ? 'any' : 'all'
    const access: Access = permissions.length ? 'permission' : /\brequireAuth\b/.test(mw) ? 'auth' : 'public'
    const method = m[1].toUpperCase()
    routes.push({ key: `${method} ${m[3]}`, method, path: m[3], access, permissions, mode, line: src.slice(0, m.index).split('\n').length })
  }
  return routes
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const routes = extractRoutes()
  writeFileSync(resolve(SECURITY_DIR, 'routes.generated.json'), JSON.stringify(routes, null, 2) + '\n')
  const by = routes.reduce<Record<string, number>>((a, r) => ((a[r.access] = (a[r.access] ?? 0) + 1), a), {})
  console.log(`${routes.length} routes`, by)
}
