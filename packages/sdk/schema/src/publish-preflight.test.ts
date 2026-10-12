import { describe, it, expect } from 'vitest'
import { scanGatewayUsage, gatewayCandidates } from './publish-preflight.js'

describe('scanGatewayUsage', () => {
  it('counts tables, containers and forms, and the bindings never pinned to a route', () => {
    const r = scanGatewayUsage({ blocks: [
      { gatewayBinding: { bindingId: 'b1' } },
      // a field of a repeated container: only a fieldPath, not a use of the gateway of its own
      { blocks: [{ gatewayBinding: { fieldPath: 'title' } }] },
      { formConfig: { gatewayEndpointName: 'brevo', gatewayBindingId: 'b2' } },
      { formConfig: { gatewayEndpointName: 'brevo' } },
      { formConfig: {} },
    ] })
    // b2 is a form's submit binding: counted, but not to be checked against the resolve route
    expect(r).toEqual({ gateway: 3, dangling: 1, bindings: ['b1'] })
  })
  it('a page without gateway usage, or no page', () => {
    expect(scanGatewayUsage({ blocks: [{ tag: 'p' }] }).gateway).toBe(0)
    expect(scanGatewayUsage(null).gateway).toBe(0)
  })
})

describe('gatewayCandidates', () => {
  it('dev: the gateway port first, then the API host', () => {
    expect(gatewayCandidates('http://localhost:3003')).toEqual(['http://localhost:3001', 'http://localhost:3003'])
  })
  it('production without a port: the API host (behind a proxy)', () => {
    expect(gatewayCandidates('https://cms.example.com')).toEqual(['https://cms.example.com'])
  })
  it('not a URL', () => { expect(gatewayCandidates('nope')).toEqual([]) })
})
