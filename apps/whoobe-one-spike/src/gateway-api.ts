function gatewayBaseUrl(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env.VITE_GATEWAY_URL) {
    return import.meta.env.VITE_GATEWAY_URL
  }
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const hostname = window.location.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `http://${hostname}:3001`
    }
    return `${window.location.protocol}//${hostname}:3001`
  }
  return 'http://localhost:3001'
}

export interface GatewayEndpoint {
  id: string
  name: string
  baseUrl: string
  description: string
  authType: string
  isActive: boolean
}

export interface GatewayRoute {
  id: string
  endpointId: string
  method: string
  path: string
  description: string
  responseSchemaId: string | null
}

export interface GatewaySchema {
  id: string
  routeId: string
  schema: Record<string, unknown>
}

export async function listEndpoints(): Promise<GatewayEndpoint[]> {
  const res = await fetch(`${gatewayBaseUrl()}/api/v1/gateway/endpoints`, { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed to list endpoints: ${res.status}`)
  return res.json()
}

export async function listRoutes(endpointId: string): Promise<GatewayRoute[]> {
  const res = await fetch(`${gatewayBaseUrl()}/api/v1/gateway/endpoints/${endpointId}/routes`, { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed to list routes: ${res.status}`)
  return res.json()
}

export async function getRouteSchema(routeId: string): Promise<GatewaySchema> {
  const res = await fetch(`${gatewayBaseUrl()}/api/v1/gateway/routes/${routeId}/schema`, { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed to get schema: ${res.status}`)
  return res.json()
}