// The nginx template sends /whoobe-one/<prefix> to core-api only for the prefixes listed in its regex; everything else
// under /whoobe-one/ is the editor SPA and answers with HTML. A core-api prefix missing from the regex shows up as
// "Unexpected token '<', "<!doctype"..." in the UI (it happened with /whoobe-one/settings/*).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT_DIR } from '../lib/config'

const routes = Object.keys(JSON.parse(readFileSync(join(ROOT_DIR, 'scripts/security/routes.expected.json'), 'utf8')).routes as Record<string, unknown>)
const corePrefixes = [...new Set(routes.map((r) => /^\w+ \/whoobe-one\/([^/:]+)/.exec(r)?.[1]).filter((p): p is string => !!p))]

// the template is the source; the rendered file of a workspace (`_locations-<slug>.inc`) is generated on the host and is not in the repository
for (const file of ['deploy/nginx/_locations.conf.template']) {
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

    // The same failure for every other prefix: a route that core-api answers but the template does not send there falls to the dashboard
    // SPA and answers with HTML ("Unexpected token '<'"). It happened with /object-event-subscriptions, /docs-sites, /mail-providers and
    // /publish/jobs, which the dashboard calls and which the template did not list.
    it('routes every top-level prefix of core-api to core-api', () => {
      const topRegex = /location ~ \^\/\(([^)]*)\)\(\/\.\*\)\?\$ \{\n\s+proxy_pass http:\/\/127\.0\.0\.1:__CORE_API_PORT__;/.exec(text)?.[1] ?? ''
      const top = new Set(topRegex.split('|'))
      // prefixes with a location of their own (and why)
      const own: Record<string, string> = {
        'whoobe-one': 'its own locations (checked above)',
        'site-root': 'the internal auth_request location /_whoobe_site_root',
        'api': '/api/v1/system/ has its own location below; the rest of /api/ belongs to the gateway and the asset service',
      }
      const prefixes = [...new Set(routes.map((r) => /^\w+ \/([^/:]+)/.exec(r)?.[1]).filter((p): p is string => !!p))]
      expect(prefixes.length).toBeGreaterThan(15)
      expect(prefixes.filter((p) => !top.has(p) && !own[p])).toEqual([])
    })

    it('routes the dashboard\'s publication routes and the system log viewer to core-api, and not the publisher\'s own', () => {
      const m = /location ~ \^\/\(([^)]*)\)\(\/\.\*\)\?\$ \{\n\s+proxy_pass http:\/\/127\.0\.0\.1:__CORE_API_PORT__;/g
      const regexes = [...text.matchAll(m)].map((x) => x[1])
      expect(regexes.some((r) => r.split('|').includes('publish/jobs'))).toBe(true)
      expect(regexes.some((r) => r.includes('publish/runner'))).toBe(false)
      expect(regexes.some((r) => r.split('|').includes('api/v1/system'))).toBe(true)
    })
  })
}
