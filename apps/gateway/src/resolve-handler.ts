import { Router, type Request, type Response } from 'express';
import { requirePermission, PERMISSIONS } from './auth.js';
import { proxyFetch } from './proxy-engine.js';
import { logGatewayError } from './log-error.js';
import { buildAuthHeaders } from './gateway-auth-headers.js';
import { resolveFieldPath } from './resolve-field-path.js';
import { applyResultFilters, type GatewayResultFilter } from './gateway-result-filters.js';

export function createResolveHandler(): Router {
  const router = Router();

  router.post('/', requirePermission(PERMISSIONS.GATEWAY_MANAGE), async (req: Request, res: Response): Promise<void> => {
    try {
      const { getGatewayEndpointByName, listGatewayRoutes } = await import('@whoobe-cms/core/server');
      const { resolveGatewayUrl } = await import('./resolve-gateway-url.js');

      const { endpointName, fieldPath, routePath, params, filters } = req.body as {
        endpointName?: string; fieldPath?: string; routePath?: string; params?: Record<string, string>; filters?: GatewayResultFilter[];
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
      Object.assign(headers, await buildAuthHeaders(endpoint));

      const result = await proxyFetch(upstreamUrl, routeMethod, headers, undefined, 15000);

      let resolvedValue = fieldPath ? resolveFieldPath(result.body, fieldPath) : result.body;

      // Result filters only make sense against an array (the repeater
      // case) - a scalar/object resolvedValue passes through unfiltered.
      if (filters?.length && Array.isArray(resolvedValue)) {
        resolvedValue = applyResultFilters(resolvedValue, filters);
      }

      res.json({
        endpointName,
        fieldPath: fieldPath || '(whole response)',
        value: resolvedValue,
        found: resolvedValue !== undefined,
      });
    } catch (err) {
      logGatewayError('resolve gateway binding', err);
      res.status(502).json({ error: 'Resolution failed' });
    }
  });

  return router;
}