// What a website needs to be published, read from its pages: does it use the API Gateway (a bound table, container or field, a form that
// posts to a gateway endpoint), which bindings are pinned to a gateway route, which never were. Used by the dashboard's Publish tab; the
// same rules are in scripts/publish-preflight.mjs (publish-site.sh), a parity test keeps the two equal.

export interface GatewayUsage {
  /** Nodes that use the gateway: resolve bindings and forms with a gateway endpoint. */
  gateway: number
  /** Of those, the ones with no binding id: authored, but never tied to a gateway route (re-save the page). */
  dangling: number
  /** The binding ids to check against the gateway. */
  bindings: string[]
}

export function scanGatewayUsage(tree: unknown): GatewayUsage {
  const acc = { gateway: 0, dangling: 0, bindings: new Set<string>() }
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach(walk); return }
    const n = node as Record<string, unknown>
    const gb = n.gatewayBinding
    if (gb && typeof gb === 'object') {
      acc.gateway++
      const id = (gb as Record<string, unknown>).bindingId
      if (typeof id === 'string' && id) acc.bindings.add(id)
      else acc.dangling++
    }
    const fc = n.formConfig as Record<string, unknown> | undefined
    if (fc && typeof fc === 'object' && (fc.gatewayEndpointName || fc.gatewayBindingId)) {
      acc.gateway++
      if (typeof fc.gatewayBindingId === 'string' && fc.gatewayBindingId) acc.bindings.add(fc.gatewayBindingId)
      else acc.dangling++
    }
    if (Array.isArray(n.blocks)) n.blocks.forEach(walk)
  }
  walk(tree)
  return { gateway: acc.gateway, dangling: acc.dangling, bindings: [...acc.bindings] }
}

/** Where the gateway may be, given the CMS API URL: the gateway's own port on the same host first (dev), then the API host (behind a proxy). */
export function gatewayCandidates(apiUrl: string): string[] {
  let u: URL
  try { u = new URL(apiUrl) } catch { return [] }
  const out: string[] = []
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || u.hostname.endsWith('.local')
  if (local || u.port) out.push(`${u.protocol}//${u.hostname}:3001`)
  out.push(`${u.protocol}//${u.host}`)
  return [...new Set(out)]
}
