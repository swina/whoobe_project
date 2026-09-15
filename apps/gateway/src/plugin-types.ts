import type { Router, Request, Response } from 'express';

export interface RequestContext {
  req: Request;
  endpoint: { id: string; name: string; baseUrl: string };
  route: { id: string; path: string; method: string };
  upstreamUrl: string;
  upstreamHeaders: Record<string, string>;
  upstreamBody?: unknown;
}

export interface ResponseContext {
  req: Request;
  res: Response;
  endpoint: { id: string; name: string; baseUrl: string };
  route: { id: string; path: string; method: string };
  upstreamResponse: globalThis.Response;
  body: unknown;
}

export interface GatewayPlugin {
  name: string;
  routes?: (router: Router) => void;
  requestMiddleware?: (ctx: RequestContext) => Promise<RequestContext>;
  responseMiddleware?: (ctx: ResponseContext) => Promise<ResponseContext>;
}