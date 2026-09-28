import { Router, type Request, type Response } from 'express';
import { proxyFetch } from './proxy-engine.js';
import { logGatewayError } from './log-error.js';
import { buildAuthHeaders } from './gateway-auth-headers.js';
import { resolveFieldPath } from './resolve-field-path.js';
import { applyResultFilters, type GatewayResultFilter } from './gateway-result-filters.js';
import { checkSiteAuth } from './site-auth.js';

// Same shape as submit-handler.ts's limiter - fixed-window, keyed by the
// calling site. resolve previously had NO rate limit at all (it relied
// entirely on requiring an admin session, which is what made it unusable
// for real published sites - see docs/plans/api-gateway/gateway-auth-
// authz.md); now that it's public, it needs one just as much as submit does.
const RESOLVE_MAX = 60;
const RESOLVE_WINDOW_MS = 60 * 1000;
const resolveCounts = new Map<string, { count: number; windowStart: number }>();

function isResolveRateLimited(key: string): boolean {
  const entry = resolveCounts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.windowStart > RESOLVE_WINDOW_MS) {
    resolveCounts.delete(key);
    return false;
  }
  return entry.count >= RESOLVE_MAX;
}

function recordResolve(key: string): void {
  const entry = resolveCounts.get(key);
  if (!entry || Date.now() - entry.windowStart > RESOLVE_WINDOW_MS) {
    resolveCounts.set(key, { count: 1, windowStart: Date.now() });
    return;
  }
  entry.count += 1;
}

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
      const { bindingId, params } = req.body as {
        bindingId?: string; params?: Record<string, string>;
      };

      if (!bindingId) {
        res.status(400).json({ error: 'bindingId is required' });
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

      const rateLimitKey = `site:${binding.websiteId}`;
      if (isResolveRateLimited(rateLimitKey)) {
        res.status(429).json({ error: 'Too many requests, please try again later' });
        return;
      }
      recordResolve(rateLimitKey);

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
