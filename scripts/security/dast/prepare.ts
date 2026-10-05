// Prepares the ZAP run: one OpenAPI document per service (docs/release/api/openapi.yaml mixes core-api, gateway and
// asset-processor, tagged "<service>: ...") pointing at the throwaway stack, and an admin session cookie.
// Safety: refuses to run unless the targets are local and the DB name contains _sec_test (lib/config.ts).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import yaml from 'js-yaml'
import { assertSafeTarget, TARGET, GATEWAY_TARGET, ASSET_TARGET, ROOT_DIR, ADMIN_EMAIL, ADMIN_PASSWORD } from '../lib/config'

assertSafeTarget()
const out = process.argv[2]
if (!out) throw new Error('usage: prepare.ts <output dir>')
mkdirSync(out, { recursive: true })

const spec: any = yaml.load(readFileSync(resolve(ROOT_DIR, 'docs/release/api/openapi.yaml'), 'utf8'))
const services: Record<string, string> = { 'core-api': TARGET, gateway: GATEWAY_TARGET, 'asset-processor': ASSET_TARGET }
const counts: Record<string, number> = {}

for (const [svc, url] of Object.entries(services)) {
  const paths: Record<string, any> = {}
  for (const [p, item] of Object.entries<any>(spec.paths)) {
    const ops: Record<string, any> = {}
    for (const [m, op] of Object.entries<any>(item)) {
      if (op && typeof op === 'object' && Array.isArray(op.tags) && op.tags.some((t: string) => t.startsWith(`${svc}:`))) ops[m] = op
    }
    if (Object.keys(ops).length) paths[p] = ops
  }
  counts[svc] = Object.keys(paths).length
  writeFileSync(resolve(out, `${svc}.yaml`), yaml.dump({ ...spec, servers: [{ url }], paths }))
}

const res = await fetch(`${TARGET}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }) })
if (!res.ok) throw new Error(`admin login failed: ${res.status}`)
const cookie = (res.headers as any).getSetCookie().find((c: string) => c.startsWith('wcms_session='))!.split(';')[0]
writeFileSync(resolve(out, 'session-cookie.txt'), cookie)
console.log(JSON.stringify({ paths: counts }))
