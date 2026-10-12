// publish-site.sh asks for the gateway URL only when the pages use the gateway and proposes one that answers; the page walking and the
// candidates live in scripts/publish-preflight.mjs.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT_DIR } from '../lib/config'
// @ts-expect-error plain ESM helper without types
import { scanTree, gatewayCandidates } from '../../publish-preflight.mjs'
import { scanGatewayUsage, gatewayCandidates as schemaCandidates } from '../../../packages/sdk/schema/src/publish-preflight'

describe('publish-preflight: scanTree', () => {
  it('counts bindings of tables, containers and forms, and the ones never pinned to a route', () => {
    const tree = { id: 'r', blocks: [
      { id: 'a', gatewayBinding: { bindingId: 'b1' } },
      { id: 'b', blocks: [{ id: 'c', gatewayBinding: { fieldPath: 'title' } }] },
      { id: 'f', formConfig: { gatewayEndpointName: 'brevo', gatewayBindingId: 'b2' } },
      { id: 'g', formConfig: { gatewayEndpointName: 'brevo' } },
      { id: 'h', formConfig: {} },
    ] }
    const r = scanTree(tree)
    expect(r.gateway).toBe(3)
    expect(r.dangling).toBe(1)
    expect([...r.bindings].sort()).toEqual(['b1'])
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

describe('publish-preflight: the script and the dashboard (schema package) agree', () => {
  const tree = { blocks: [
    { gatewayBinding: { bindingId: 'b1' } }, { gatewayBinding: {} },
    { formConfig: { gatewayEndpointName: 'e', gatewayBindingId: 'b2' } }, { formConfig: { gatewayEndpointName: 'e' } },
    { blocks: [{ gatewayBinding: { bindingId: 'b1' } }] },
  ] }
  it('the same usage for the same page', () => {
    const a = scanTree(tree), b = scanGatewayUsage(tree)
    expect({ gateway: a.gateway, dangling: a.dangling, bindings: [...a.bindings] }).toEqual(b)
  })
  it('the same gateway candidates', () => {
    for (const u of ['http://localhost:3003', 'https://cms.example.com', 'http://whoobecms.local:3003', 'https://cms.example.com:8443', 'nope'])
      expect(gatewayCandidates(u)).toEqual(schemaCandidates(u))
  })
})

describe('whoobe-publish: where the SDK packages come from', () => {
  it('is found from the generator, so the output folder can be anywhere', async () => {
    const { defaultMonorepoRoot } = await import('../../../packages/publish/src/cli')
    expect(defaultMonorepoRoot('/tmp/somewhere/else/site')).toBe(ROOT_DIR)
    expect(defaultMonorepoRoot('/a/b/c', '/nowhere')).toBe('/a')
  })
})
