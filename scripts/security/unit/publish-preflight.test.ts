// publish-site.sh asks for the gateway URL only when the pages use the gateway and proposes one that answers; the page walking and the
// candidates live in scripts/publish-preflight.mjs.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT_DIR } from '../lib/config'
// @ts-expect-error plain ESM helper without types
import { scanTree, gatewayCandidates } from '../../publish-preflight.mjs'

describe('publish-preflight: scanTree', () => {
  it('counts bindings of tables, containers and forms, and the ones never pinned to a route', () => {
    const tree = { id: 'r', blocks: [
      { id: 'a', gatewayBinding: { bindingId: 'b1' } },
      { id: 'b', blocks: [{ id: 'c', gatewayBinding: { endpointName: 'x', routePath: '/y' } }] },
      { id: 'f', formConfig: { gatewayEndpointName: 'brevo', gatewayBindingId: 'b2' } },
      { id: 'g', formConfig: { gatewayEndpointName: 'brevo' } },
      { id: 'h', formConfig: {} },
    ] }
    const r = scanTree(tree)
    expect(r.gateway).toBe(4)
    expect(r.dangling).toBe(2)
    expect([...r.bindings].sort()).toEqual(['b1', 'b2'])
  })
  it('a page with no gateway usage needs no gateway', () => {
    expect(scanTree({ blocks: [{ tag: 'p' }] }).gateway).toBe(0)
    expect(scanTree(null).gateway).toBe(0)
  })
})

describe('publish-preflight: gatewayCandidates', () => {
  it('local dev: the gateway port first', () => {
    expect(gatewayCandidates('http://localhost:3003')[0]).toBe('http://localhost:3001')
  })
  it('production without a port: the API host itself (behind a proxy)', () => {
    expect(gatewayCandidates('https://cms.example.com')).toEqual(['https://cms.example.com'])
  })
  it('garbage gives nothing', () => { expect(gatewayCandidates('not a url')).toEqual([]) })
})

describe('publish-site.sh', () => {
  const sh = readFileSync(join(ROOT_DIR, 'publish-site.sh'), 'utf8')
  it('no longer defaults the gateway to the CMS API URL', () => {
    expect(sh).not.toContain('DEFAULT_GATEWAY_URL')
    expect(sh).toContain('publish-preflight.mjs')
  })
  it('keeps optional flags as arrays and has a non-interactive mode', () => {
    expect(sh).toContain('EXTRA_ARGS=()')
    expect(sh).toContain('--yes')
  })
})
