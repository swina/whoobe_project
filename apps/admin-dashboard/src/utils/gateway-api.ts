export function getDefaultGatewayUrl(): string {
  if (import.meta.env.VITE_GATEWAY_URL) return import.meta.env.VITE_GATEWAY_URL.replace(/\/+$/, '')
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const hostname = window.location.hostname
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'
    if (isLocalhost) return 'http://localhost:3001'
    return `http://${hostname}:3001`
  }
  return 'http://localhost:3001'
}

export function getDefaultGatewayUpstreams(): { coreApi: string; assetProcessor: string } {
  return {
    coreApi: import.meta.env.VITE_GATEWAY_CORE_API_URL || 'http://localhost:3003',
    assetProcessor: import.meta.env.VITE_GATEWAY_ASSET_PROCESSOR_URL || 'http://localhost:3002',
  }
}

export function getDefaultGatewayRateLimit(): string {
  return import.meta.env.VITE_GATEWAY_DEFAULT_RATE_LIMIT_RPS || '10'
}

let gatewayBaseUrl: string | null = null

export function setGatewayBaseUrl(url: string): void {
  gatewayBaseUrl = url
}

function baseUrl(): string {
  return (gatewayBaseUrl || getDefaultGatewayUrl()).replace(/\/+$/, '')
}

async function parseJsonOrThrow(res: Response): Promise<any> {
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`
    try { const body = await res.json(); if (body?.error) message = body.error } catch {}
    throw new Error(message)
  }
  return res.json()
}

export interface GatewayEndpoint {
  id: string
  name: string
  description: string
  baseUrl: string
  authType: 'none' | 'api-key' | 'bearer' | 'basic'
  /** Never present on data read from the API - the server strips stored
   *  credentials before sending an endpoint back (see admin-routes.ts's
   *  redactEndpoint()). Only used to submit new/changed credentials on
   *  create/update; a blank field on update keeps the stored value. */
  authConfig?: Record<string, unknown>
  requestTimeoutMs: number
  rateLimitRps: number
  rateLimitBurst: number
  requiredPermission: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface GatewayRoute {
  id: string
  endpointId: string
  path: string
  method: string
  description: string
  requestBodySchema: Record<string, unknown> | null
  responseSchemaId: string | null
  pluginChain: string[]
  autoUpdateSchema: boolean
  cacheTtlSeconds: number
  createdAt: string
  updatedAt: string
}

export interface GatewaySchema {
  id: string
  routeId: string
  schema: Record<string, unknown>
  samplePayload: unknown
  inferredAt: string
  updatedAt: string
}

export interface GatewayPluginInfo {
  name: string
  hasRoutes: boolean
  hasRequestMiddleware: boolean
  hasResponseMiddleware: boolean
}

export async function listEndpoints(): Promise<GatewayEndpoint[]> {
  const res = await fetch(`${baseUrl()}/api/v1/gateway/endpoints`, { credentials: 'include' })
  return parseJsonOrThrow(res)
}

export async function getEndpoint(id: string): Promise<GatewayEndpoint> {
  const res = await fetch(`${baseUrl()}/api/v1/gateway/endpoints/${id}`, { credentials: 'include' })
  return parseJsonOrThrow(res)
}

export async function createEndpoint(input: Partial<GatewayEndpoint>): Promise<GatewayEndpoint> {
  const res = await fetch(`${baseUrl()}/api/v1/gateway/endpoints`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

export async function updateEndpoint(id: string, input: Partial<GatewayEndpoint>): Promise<GatewayEndpoint> {
  const res = await fetch(`${baseUrl()}/api/v1/gateway/endpoints/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

export async function deleteEndpoint(id: string): Promise<void> {
  const res = await fetch(`${baseUrl()}/api/v1/gateway/endpoints/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`
    try { const body = await res.json(); if (body?.error) message = body.error } catch {}
    throw new Error(message)
  }
}

export async function listRoutes(endpointId: string): Promise<GatewayRoute[]> {
  const res = await fetch(`${baseUrl()}/api/v1/gateway/endpoints/${endpointId}/routes`, { credentials: 'include' })
  return parseJsonOrThrow(res)
}

export async function createRoute(input: Partial<GatewayRoute> & { endpointId: string }): Promise<GatewayRoute> {
  const res = await fetch(`${baseUrl()}/api/v1/gateway/endpoints/${input.endpointId}/routes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

export async function updateRoute(id: string, input: Partial<GatewayRoute>): Promise<GatewayRoute> {
  const res = await fetch(`${baseUrl()}/api/v1/gateway/routes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

export async function deleteRoute(id: string): Promise<void> {
  const res = await fetch(`${baseUrl()}/api/v1/gateway/routes/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`
    try { const body = await res.json(); if (body?.error) message = body.error } catch {}
    throw new Error(message)
  }
}

export async function testRoute(id: string): Promise<{ status: number; schema: Record<string, unknown>; sample: unknown }> {
  const res = await fetch(`${baseUrl()}/api/v1/gateway/routes/${id}/test`, {
    method: 'POST',
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

export async function executeRoute(id: string, requestBody?: unknown, params?: Record<string, string>): Promise<{ error: boolean; upstreamStatus: number; headers: Record<string, string>; body: unknown }> {
  const res = await fetch(`${baseUrl()}/api/v1/gateway/routes/${id}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestBody, params }),
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

export async function getRouteSchema(id: string): Promise<GatewaySchema> {
  const res = await fetch(`${baseUrl()}/api/v1/gateway/routes/${id}/schema`, { credentials: 'include' })
  return parseJsonOrThrow(res)
}

export async function refreshSchema(id: string): Promise<{ status: number; schema: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl()}/api/v1/gateway/routes/${id}/refresh-schema`, {
    method: 'POST',
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

export async function listPlugins(): Promise<GatewayPluginInfo[]> {
  const res = await fetch(`${baseUrl()}/api/v1/gateway/plugins`, { credentials: 'include' })
  return parseJsonOrThrow(res)
}