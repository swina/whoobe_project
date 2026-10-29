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
  /** the name in `audited(AUDIT.<name>)` found in the middleware list, or null */
  audit: string | null
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
    const audit = /\baudited\(\s*AUDIT\.(\w+)\s*\)/.exec(mw)?.[1] ?? null
    const method = m[1].toUpperCase()
    routes.push({ key: `${method} ${m[3]}`, method, path: m[3], access, permissions, mode, audit, line: src.slice(0, m.index).split('\n').length })
  }
  return routes
}

// The gateway's administration routes (release-0.4-plan.md, "Gateway administration audited"): every `router.<verb>(path, ...)` that
// changes something in the two admin routers, under the path router.ts mounts it on, plus a mount guarded by a permission
// (`router.use(path, requirePermission(...), handler)`, answered with a POST). Only the audit decision is checked for these.
export interface GatewayRouteInfo { key: string; audit: string | null; file: string; line: number }

const GATEWAY_ADMIN = [
  { file: 'apps/gateway/src/admin-routes.ts', mount: '/api/v1/gateway' },
  { file: 'apps/gateway/src/client-admin-routes.ts', mount: '/api/v1/gateway/clients' },
]

export function extractGatewayAdminRoutes(): GatewayRouteInfo[] {
  const routes: GatewayRouteInfo[] = []
  const lineOf = (src: string, i: number) => src.slice(0, i).split('\n').length
  for (const { file, mount } of GATEWAY_ADMIN) {
    const src = readFileSync(resolve(ROOT_DIR, file), 'utf8')
    const re = /^\s*router\.(post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2/gm
    let m: RegExpExecArray | null
    while ((m = re.exec(src))) {
      const rest = src.slice(m.index + m[0].length, m.index + m[0].length + 400)
      const arrow = rest.indexOf('=>')
      const mw = arrow >= 0 ? rest.slice(0, arrow) : rest
      const path = m[3] === '/' ? mount : `${mount}${m[3]}`
      routes.push({ key: `${m[1].toUpperCase()} ${path}`, audit: /\baudited\(\s*AUDIT\.(\w+)\s*\)/.exec(mw)?.[1] ?? null, file, line: lineOf(src, m.index) })
    }
  }
  const file = 'apps/gateway/src/router.ts'
  const src = readFileSync(resolve(ROOT_DIR, file), 'utf8')
  for (const m of src.matchAll(/^\s*router\.use\(\s*'([^']+)',\s*(requirePermission\([^)]*\)[^\n]*)$/gm)) {
    routes.push({ key: `POST ${m[1]}`, audit: /\baudited\(\s*AUDIT\.(\w+)\s*\)/.exec(m[2])?.[1] ?? null, file, line: lineOf(src, m.index!) })
  }
  return routes
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const routes = extractRoutes()
  writeFileSync(resolve(SECURITY_DIR, 'routes.generated.json'), JSON.stringify(routes, null, 2) + '\n')
  const by = routes.reduce<Record<string, number>>((a, r) => ((a[r.access] = (a[r.access] ?? 0) + 1), a), {})
  console.log(`${routes.length} routes`, by)
}
