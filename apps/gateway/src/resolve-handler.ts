import { Router, type Request, type Response } from 'express';
import { proxyFetch } from './proxy-engine.js';
import { logGatewayError } from './log-error.js';
import { buildAuthHeaders } from './gateway-auth-headers.js';
import { resolveFieldPath } from './resolve-field-path.js';
import { applyResultFilters, type GatewayResultFilter } from './gateway-result-filters.js';
import { checkSiteAuth } from './site-auth.js';
import { resolveIpLimiter, resolveSiteLimiter, isUuid } from './public-limits.js';

/** Public read counterpart to submit-handler.ts - resolves a container's/
 *  field's gatewayBinding by its opaque bindingId (pinned to one fixed
 *  endpoint+route+fieldPath+filters+allowed-param-keys at page-save time,
 *  never chosen by the client - see docs/plans/api-gateway/gateway-auth-
 *  authz.md and core-api's bind-page-content.ts). The free-form,
 *  admin-authenticated version of this endpoint (raw endpointName/routePath,
 *  used by the editor's own live preview before a binding is saved) now
 *  lives at POST /api/v1/gateway/preview-resolve (admin-routes.ts). */
export function createResolveHandler(): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
      // before any database work: one client cannot flood the lookup with random binding ids
      if (resolveIpLimiter.hit(req.ip ?? 'unknown')) {
        res.status(429).json({ error: 'Too many requests, please try again later' });
        return;
      }
      const { bindingId, params } = req.body as {
        bindingId?: string; params?: Record<string, string>;
      };

      if (!bindingId) {
        res.status(400).json({ error: 'bindingId is required' });
        return;
      }
      if (!isUuid(bindingId)) {
        // a malformed id can match nothing: answer like an unknown one, without a database round trip
        res.status(404).json({ error: 'Unknown resolve target' });
        return;
      }

      const { getGatewayBindingById, getGatewayEndpoint, getGatewayRoute } = await import('@whoobe-cms/core/server');

      const binding = await getGatewayBindingById(bindingId);
      if (!binding || binding.kind !== 'resolve') {
        res.status(404).json({ error: 'Unknown resolve target' });
        return;
      }

      const auth = await checkSiteAuth(req, binding.websiteId);
      if (!auth.ok) {
        res.status(auth.status ?? 403).json({ error: auth.error ?? 'Not authorized' });
        return;
      }

      if (resolveSiteLimiter.hit(`site:${binding.websiteId}`)) {
        res.status(429).json({ error: 'Too many requests, please try again later' });
        return;
      }

      const [endpoint, route] = await Promise.all([
        getGatewayEndpoint(binding.endpointId),
        getGatewayRoute(binding.routeId),
      ]);
      if (!endpoint || !endpoint.isActive || !route) {
        res.status(404).json({ error: 'Resolve target is no longer available' });
        return;
      }

      // Only the placeholder names the admin actually authored into this
      // binding are honored - any other key in the client's `params` is
      // dropped rather than forwarded upstream.
      const allowedParams: Record<string, string> | undefined = params
        ? Object.fromEntries(
            binding.paramKeys
              .filter((key) => Object.prototype.hasOwnProperty.call(params, key))
              .map((key) => [key, params[key]]),
          )
        : undefined;

      const { resolveGatewayUrl } = await import('./resolve-gateway-url.js');
      const upstreamUrl = resolveGatewayUrl(endpoint.baseUrl, route.path, allowedParams);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      Object.assign(headers, await buildAuthHeaders(endpoint));

      // route.method is trusted as-is (unlike the old free-form path, which
      // always forced 'GET' when a client-supplied routePath was given) -
      // findOrCreateGatewayBinding already enforced 'resolve' bindings can
      // only ever point at a GET route, so this can never be a write.
      const result = await proxyFetch(upstreamUrl, route.method, headers, undefined, 15000);

      let resolvedValue = binding.fieldPath ? resolveFieldPath(result.body, binding.fieldPath) : result.body;

      // Result filters only make sense against an array (the repeater
      // case) - a scalar/object resolvedValue passes through unfiltered.
      const filters = binding.filters as GatewayResultFilter[] | null;
      if (filters?.length && Array.isArray(resolvedValue)) {
        resolvedValue = applyResultFilters(resolvedValue, filters);
      }

      res.json({
        fieldPath: binding.fieldPath || '(whole response)',
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
