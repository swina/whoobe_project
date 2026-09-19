import { Router, type Request, type Response } from 'express';
import { proxyFetch } from './proxy-engine.js';
import { logGatewayError } from './log-error.js';
import { buildAuthHeaders } from './gateway-auth-headers.js';
import { resolveGatewayUrl } from './resolve-gateway-url.js';

// Fixed-window per-IP limit, same shape/values as core-api's
// /public/forms/:classId/submit guard (server.ts) - a plain request-volume
// window, not the sliding per-second checkRateLimit in rate-limiter.ts
// (that one paces proxied read throughput, a different concern from
// capping how many times a stranger can hit a public write endpoint).
const FORM_SUBMIT_MAX = 10;
const FORM_SUBMIT_WINDOW_MS = 15 * 60 * 1000;
const formSubmitCounts = new Map<string, { count: number; windowStart: number }>();

function isFormSubmitRateLimited(key: string): boolean {
  const entry = formSubmitCounts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.windowStart > FORM_SUBMIT_WINDOW_MS) {
    formSubmitCounts.delete(key);
    return false;
  }
  return entry.count >= FORM_SUBMIT_MAX;
}

function recordFormSubmit(key: string): void {
  const entry = formSubmitCounts.get(key);
  if (!entry || Date.now() - entry.windowStart > FORM_SUBMIT_WINDOW_MS) {
    formSubmitCounts.set(key, { count: 1, windowStart: Date.now() });
    return;
  }
  entry.count += 1;
}

/** Public (unauthenticated) counterpart to resolve-handler.ts: forwards a
 *  page Form's submitted values as a write (POST/PUT/PATCH) to a configured
 *  Gateway endpoint/route, the same way core-api's /public/forms/:classId/
 *  submit forwards them into a Data Object. Mounted at
 *  /api/v1/gateway/submit, outside requirePermission(GATEWAY_MANAGE) -
 *  the endpoint/route are looked up by name/path server-side (never a raw
 *  URL from the client), and buildAuthHeaders() attaches whatever
 *  credentials the endpoint is configured with, so the visitor's browser
 *  never sees the upstream URL or its auth. */
export function createSubmitHandler(): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const rateLimitKey = req.ip ?? 'unknown';
      if (isFormSubmitRateLimited(rateLimitKey)) {
        res.status(429).json({ error: 'Too many submissions, please try again later' });
        return;
      }
      recordFormSubmit(rateLimitKey);

      const { endpointName, routePath, attributes } = req.body as {
        endpointName?: string; routePath?: string; attributes?: Record<string, unknown>;
      };

      if (!endpointName) {
        res.status(400).json({ error: 'endpointName is required' });
        return;
      }
      if (attributes == null || typeof attributes !== 'object') {
        res.status(400).json({ error: 'attributes is required' });
        return;
      }
      // Hidden decoy field - see form-actions.ts. Looks like success to
      // whatever submitted it without revealing it was a trap.
      if ((attributes as Record<string, unknown>)._hp) {
        res.status(204).end();
        return;
      }

      const { getGatewayEndpointByName, listGatewayRoutes } = await import('@whoobe-cms/core/server');

      const endpoint = await getGatewayEndpointByName(endpointName);
      if (!endpoint || !endpoint.isActive) {
        res.status(404).json({ error: `Endpoint '${endpointName}' not found` });
        return;
      }

      const routes = await listGatewayRoutes(endpoint.id);
      // A write route only, never GET - resolve-handler.ts already owns
      // reads, and forwarding a form's attributes onto a GET would silently
      // drop them (proxyFetch only sends a body for non-GET methods).
      const route = routePath
        ? routes.find(r => r.path === routePath && r.method !== 'GET')
        : routes.find(r => r.method !== 'GET');
      if (!route) {
        res.status(404).json({ error: `No write route configured for endpoint '${endpointName}'` });
        return;
      }

      const upstreamUrl = resolveGatewayUrl(endpoint.baseUrl, route.path);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      Object.assign(headers, await buildAuthHeaders(endpoint));

      const submitted = { ...(attributes as Record<string, unknown>) };
      delete submitted._hp;

      const result = await proxyFetch(upstreamUrl, route.method, headers, submitted, 15000);

      if (result.status >= 200 && result.status < 300) {
        res.status(result.status).json({ success: true, response: result.body });
      } else {
        res.status(502).json({ success: false, error: 'Upstream rejected the submission' });
      }
    } catch (err) {
      logGatewayError('gateway form submit', err);
      res.status(502).json({ error: 'Submission failed' });
    }
  });

  return router;
}
