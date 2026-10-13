import type { Request, Response } from 'express';
import type { GatewayEndpointRecord } from '@whoobe-cms/core/server';
import { proxyFetch, type ProxyResult } from './proxy-engine.js';
import { buildAuthHeaders } from './gateway-auth-headers.js';
import type { GatewayPlugin, RequestContext, ResponseContext } from './plugin-types.js';

// The one place where a configured route is called on behalf of a caller: credentials added, request plugins, the call (timeout and
// SSRF guard in proxyFetch), response plugins. Used by /api/remote (dashboard users) and /client/v1/gateway (API clients), so the two
// cannot drift apart.

const loadedPlugins: GatewayPlugin[] = [];

export function setLoadedPlugins(plugins: GatewayPlugin[]): void {
  loadedPlugins.length = 0;
  loadedPlugins.push(...plugins);
}

export interface RouteCall {
  req: Request;
  res: Response;
  endpoint: Pick<GatewayEndpointRecord, 'id' | 'name' | 'baseUrl' | 'authType' | 'authConfig'> & GatewayEndpointRecord;
  route: { id: string; path: string; method: string };
  upstreamUrl: string;
  /** Headers of the caller that are passed on (content type, accept); credentials are added here. */
  headers: Record<string, string>;
  body?: unknown;
  timeoutMs: number;
}

export async function callRoute(c: RouteCall): Promise<ProxyResult> {
  const upstreamHeaders: Record<string, string> = { ...c.headers };
  Object.assign(upstreamHeaders, await buildAuthHeaders(c.endpoint));

  let reqCtx: RequestContext = {
    req: c.req,
    endpoint: { id: c.endpoint.id, name: c.endpoint.name, baseUrl: c.endpoint.baseUrl },
    route: { id: c.route.id, path: c.route.path, method: c.route.method },
    upstreamUrl: c.upstreamUrl,
    upstreamHeaders,
    upstreamBody: c.body,
  };
  for (const plugin of loadedPlugins) {
    if (plugin.requestMiddleware) reqCtx = await plugin.requestMiddleware(reqCtx);
  }

  const result = await proxyFetch(reqCtx.upstreamUrl, c.route.method, reqCtx.upstreamHeaders, reqCtx.upstreamBody, c.timeoutMs);

  let resCtx: ResponseContext = {
    req: c.req,
    res: c.res,
    endpoint: { id: c.endpoint.id, name: c.endpoint.name, baseUrl: c.endpoint.baseUrl },
    route: { id: c.route.id, path: c.route.path, method: c.route.method },
    upstreamResponse: new Response(null as unknown as BodyInit),
    body: result.body,
  };
  for (const plugin of loadedPlugins) {
    if (plugin.responseMiddleware) resCtx = await plugin.responseMiddleware(resCtx);
  }
  return { ...result, body: resCtx.body };
}
