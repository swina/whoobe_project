import { Router, type Request, type Response } from 'express';
import { requirePermission, PERMISSIONS } from './auth.js';
import { proxyFetch } from './proxy-engine.js';

export function createResolveHandler(): Router {
  const router = Router();

  router.post('/', requirePermission(PERMISSIONS.GATEWAY_MANAGE), async (req: Request, res: Response): Promise<void> => {
    try {
      const { getGatewayEndpointByName, listGatewayRoutes } = await import('@whoobe-cms/core/server');
      const { resolveGatewayUrl } = await import('./resolve-gateway-url.js');

      const { endpointName, fieldPath, routePath, params } = req.body as {
        endpointName?: string; fieldPath?: string; routePath?: string; params?: Record<string, string>;
      };

      if (!endpointName) {
        res.status(400).json({ error: 'endpointName is required' });
        return;
      }

      const endpoint = await getGatewayEndpointByName(endpointName);
      if (!endpoint) {
        res.status(404).json({ error: `Endpoint '${endpointName}' not found` });
        return;
      }

      let upstreamUrl: string;
      let routeMethod: string;

      if (routePath) {
        upstreamUrl = resolveGatewayUrl(endpoint.baseUrl, routePath, params || undefined);
        routeMethod = 'GET';
      } else {
        const routes = await listGatewayRoutes(endpoint.id);
        if (routes.length === 0) {
          res.status(404).json({ error: `No routes configured for endpoint '${endpointName}'` });
          return;
        }
        const route = routes[0];
        upstreamUrl = resolveGatewayUrl(endpoint.baseUrl, route.path, params || undefined);
        routeMethod = route.method;
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      if (endpoint.authType === 'api-key' && endpoint.authConfig) {
        const config = endpoint.authConfig as Record<string, string>;
        headers[config.keyHeader || 'X-API-Key'] = config.keyValue || '';
      } else if (endpoint.authType === 'bearer' && endpoint.authConfig) {
        const config = endpoint.authConfig as Record<string, string>;
        headers['Authorization'] = `Bearer ${config.token || ''}`;
      } else if (endpoint.authType === 'basic' && endpoint.authConfig) {
        const config = endpoint.authConfig as Record<string, string>;
        const encoded = Buffer.from(`${config.username || ''}:${config.password || ''}`).toString('base64');
        headers['Authorization'] = `Basic ${encoded}`;
      }

      const result = await proxyFetch(upstreamUrl, routeMethod, headers, undefined, 15000);

      const resolvedValue = fieldPath ? resolveFieldPath(result.body, fieldPath) : result.body;

      res.json({
        endpointName,
        fieldPath: fieldPath || '(whole response)',
        value: resolvedValue,
        found: resolvedValue !== undefined,
      });
    } catch (err) {
      res.status(502).json({ error: 'Resolution failed', details: String(err) });
    }
  });

  return router;
}

function resolveFieldPath(data: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = data;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, indexStr] = arrayMatch;
      const index = parseInt(indexStr, 10);
      if (typeof current !== 'object') return undefined;
      const arr = (current as Record<string, unknown>)[key];
      if (!Array.isArray(arr)) return undefined;
      current = arr[index];
    } else if (Array.isArray(current)) {
      return undefined;
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}