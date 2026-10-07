// The nginx template sends /whoobe-one/<prefix> to core-api only for the prefixes listed in its regex; everything else
// under /whoobe-one/ is the editor SPA and answers with HTML. A core-api prefix missing from the regex shows up as
// "Unexpected token '<', "<!doctype"..." in the UI (it happened with /whoobe-one/settings/*).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT_DIR } from '../lib/config'

const routes = Object.keys(JSON.parse(readFileSync(join(ROOT_DIR, 'scripts/security/routes.expected.json'), 'utf8')).routes as Record<string, unknown>)
const corePrefixes = [...new Set(routes.map((r) => /^\w+ \/whoobe-one\/([^/:]+)/.exec(r)?.[1]).filter((p): p is string => !!p))]

for (const file of ['deploy/nginx/_locations.conf.template', 'deploy/nginx/_locations-ws-demo.inc']) {
  describe(file, () => {
    const text = readFileSync(join(ROOT_DIR, file), 'utf8')
    const routed = new Set((/location ~ \^\/whoobe-one\/\(([^)]*)\)/.exec(text)?.[1] ?? '').split('|'))

    it('caps the request body for the whole server, not only for one location (the 1 MB default answers 413 to a website import)', () => {
      const beforeFirstLocation = text.slice(0, text.search(/^location\b/m))
      expect(beforeFirstLocation).toMatch(/^client_max_body_size\s+(\S+);/m)
      // no location may lower it silently: a limit inside a location is a deliberate override, not the only one
      expect(text.match(/client_max_body_size/g)?.length).toBe(1)
    })

    it('routes every /whoobe-one/<prefix> of core-api to core-api', () => {
      expect(corePrefixes.length).toBeGreaterThan(5)
      expect(corePrefixes.filter((p) => !routed.has(p))).toEqual([])
    })
  })
}
