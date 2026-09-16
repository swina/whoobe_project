import { Router, type Request, type Response } from 'express';
import { PERMISSIONS, requirePermission } from './auth.js';
import { proxyFetch } from './proxy-engine.js';
import { checkRateLimit } from './rate-limiter.js';
import type { GatewayPlugin, RequestContext, ResponseContext } from './plugin-types.js';
import { logGatewayError } from './log-error.js';

const loadedPlugins: GatewayPlugin[] = [];

export function setLoadedPlugins(plugins: GatewayPlugin[]): void {
  loadedPlugins.length = 0;
  loadedPlugins.push(...plugins);
}

export function createRemoteRouter(): Router {
  const router = Router();

  router.all('/:endpointName/*', requirePermission(PERMISSIONS.GATEWAY_MANAGE), async (req: Request, res: Response): Promise<void> => {
    try {
      const { getGatewayEndpointByName, listGatewayRoutes } = await import('@whoobe-cms/core/server');

      const endpointName = req.params.endpointName as string;
      const wildcardPath = req.params[0] as string || '';

      const endpoint = await getGatewayEndpointByName(endpointName);
      if (!endpoint || !endpoint.isActive) {
        res.status(404).json({ error: `Endpoint '${endpointName}' not found or inactive` });
        return;
      }

      const routes = await listGatewayRoutes(endpoint.id);
      const matchingRoute = routes.find(r => r.path === wildcardPath && r.method === req.method);
      if (!matchingRoute) {
        res.status(404).json({ error: `Route '${req.method} ${wildcardPath}' not found on endpoint '${endpointName}'` });
        return;
      }

      if (!(await checkRateLimit(`gateway:${endpoint.id}`, endpoint.rateLimitRps))) {
        res.status(429).json({ error: 'Rate limit exceeded' });
        return;
      }

      const upstreamUrl = `${endpoint.baseUrl.replace(/\/$/, '')}/${wildcardPath}`;
      const upstreamHeaders: Record<string, string> = {};

      const contentType = req.headers['content-type'];
      if (contentType) upstreamHeaders['Content-Type'] = Array.isArray(contentType) ? contentType[0] : contentType;

      const accept = req.headers['accept'];
      if (accept) upstreamHeaders['Accept'] = Array.isArray(accept) ? accept[0] : accept;

      if (endpoint.authType === 'api-key' && endpoint.authConfig) {
        const config = endpoint.authConfig as Record<string, string>;
        upstreamHeaders[config.keyHeader || 'X-API-Key'] = config.keyValue || '';
      } else if (endpoint.authType === 'bearer' && endpoint.authConfig) {
        const config = endpoint.authConfig as Record<string, string>;
        upstreamHeaders['Authorization'] = `Bearer ${config.token || ''}`;
      } else if (endpoint.authType === 'basic' && endpoint.authConfig) {
        const config = endpoint.authConfig as Record<string, string>;
        const encoded = Buffer.from(`${config.username || ''}:${config.password || ''}`).toString('base64');
        upstreamHeaders['Authorization'] = `Basic ${encoded}`;
      }

      const requestContext: RequestContext = {
        req: req as unknown as Request,
        endpoint: { id: endpoint.id, name: endpoint.name, baseUrl: endpoint.baseUrl },
        route: { id: matchingRoute.id, path: matchingRoute.path, method: matchingRoute.method },
        upstreamUrl,
        upstreamHeaders,
        upstreamBody: req.body,
      };
      let currentRequestContext = requestContext;

      for (const plugin of loadedPlugins) {
        if (plugin.requestMiddleware) {
          currentRequestContext = await plugin.requestMiddleware(currentRequestContext);
        }
      }

      const result = await proxyFetch(
        currentRequestContext.upstreamUrl,
        req.method,
        currentRequestContext.upstreamHeaders,
        currentRequestContext.upstreamBody,
        endpoint.requestTimeoutMs
      );

      let responseBody = result.body;
      let currentResponseContext: ResponseContext = {
        req: req as unknown as Request,
        res: res as unknown as Response,
        endpoint: { id: endpoint.id, name: endpoint.name, baseUrl: endpoint.baseUrl },
        route: { id: matchingRoute.id, path: matchingRoute.path, method: matchingRoute.method },
        upstreamResponse: new Response(null as unknown as BodyInit),
        body: responseBody,
      };

      for (const plugin of loadedPlugins) {
        if (plugin.responseMiddleware) {
          currentResponseContext = await plugin.responseMiddleware(currentResponseContext);
        }
      }

      responseBody = currentResponseContext.body;

      if (result.status >= 400) {
        res.status(result.status).json(responseBody);
        return;
      }

      res.status(result.status).json(responseBody);
    } catch (err) {
      logGatewayError('remote gateway request', err);
      res.status(502).json({ error: 'Upstream request failed' });
    }
  });

  return router;
}