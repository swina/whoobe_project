import { Router, type Request, type Response } from 'express';
import { PERMISSIONS, requirePermission } from './auth.js';
import { checkRateLimit } from './rate-limiter.js';
import { logGatewayError } from './log-error.js';
import { callRoute } from './route-call.js';
import { resolveGatewayUrl } from './resolve-gateway-url.js';

export { setLoadedPlugins } from './route-call.js';

/** Content type and accept of the caller, the only request headers passed on to an upstream. */
export function passedHeaders(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  const contentType = req.headers['content-type'];
  if (contentType) out['Content-Type'] = Array.isArray(contentType) ? contentType[0] : contentType;
  const accept = req.headers['accept'];
  if (accept) out['Accept'] = Array.isArray(accept) ? accept[0] : accept;
  return out;
}

/** The query string of the request as sent (without the '?'), bounded. */
export function queryOf(req: Request): string {
  const i = req.originalUrl.indexOf('?');
  return i < 0 ? '' : req.originalUrl.slice(i + 1, i + 1 + 2048);
}

export function createRemoteRouter(): Router {
  const router = Router();

  // The way for a signed-in dashboard user to call a configured route directly. Applications use /client/v1/gateway (client-router.ts).
  router.all('/:endpointName/*', requirePermission(PERMISSIONS.GATEWAY_MANAGE), async (req: Request, res: Response): Promise<void> => {
    try {
      const { getGatewayEndpointByName, listGatewayRoutes } = await import('@whoobe-cms/core/server');
      const { matchRoute, unsafePathReason } = await import('@whoobe-cms/core/server');

      const endpointName = req.params.endpointName as string;
      const wildcardPath = (req.params[0] as string) || '';

      const endpoint = await getGatewayEndpointByName(endpointName);
      if (!endpoint || !endpoint.isActive) {
        res.status(404).json({ error: `Endpoint '${endpointName}' not found or inactive` });
        return;
      }
      const bad = unsafePathReason(wildcardPath);
      if (bad) {
        res.status(400).json({ error: bad });
        return;
      }

      const routes = await listGatewayRoutes(endpoint.id);
      const matched = matchRoute(routes, req.method, wildcardPath, 'first');
      if (matched === 'none' || matched === 'ambiguous') {
        res.status(404).json({ error: `Route '${req.method} ${wildcardPath}' not found on endpoint '${endpointName}'` });
        return;
      }

      if (!(await checkRateLimit(`gateway:${endpoint.id}`, endpoint.rateLimitRps))) {
        res.status(429).json({ error: 'Rate limit exceeded' });
        return;
      }

      const query = queryOf(req);
      const result = await callRoute({
        req, res, endpoint,
        route: matched.route,
        upstreamUrl: resolveGatewayUrl(endpoint.baseUrl, matched.route.path, matched.params) + (query ? `?${query}` : ''),
        headers: passedHeaders(req),
        body: req.body,
        timeoutMs: endpoint.requestTimeoutMs,
      });
      res.status(result.status).json(result.body);
    } catch (err) {
      logGatewayError('remote gateway request', err);
      res.status(502).json({ error: 'Upstream request failed' });
    }
  });

  return router;
}
