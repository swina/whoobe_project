import { Router, type Request, type Response } from 'express';
import { proxyFetch } from './proxy-engine.js';
import { logGatewayError, logger } from './log-error.js';
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

// Brevo's POST /contacts only recognizes these keys at the top level of the
// request body (https://developers.brevo.com/reference/createcontact); any
// custom contact field must be nested under "attributes" or Brevo silently
// drops it (no error - the contact is still created, just without that
// data). A CMS Form's fields are always flat (name -> string value), so
// anything outside this allowlist is moved into "attributes" before the
// request leaves the gateway.
const BREVO_CONTACT_TOP_LEVEL_FIELDS = new Set([
  'email', 'ext_id', 'attributes', 'emailBlacklisted', 'smsBlacklisted',
  'listIds', 'updateEnabled', 'smtpBlacklistSender',
]);

function nestBrevoContactAttributes(body: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const attributes: Record<string, unknown> = { ...(body.attributes as Record<string, unknown> | undefined) };
  for (const [key, value] of Object.entries(body)) {
    if (key === 'attributes') continue;
    if (BREVO_CONTACT_TOP_LEVEL_FIELDS.has(key)) {
      result[key] = value;
    } else {
      attributes[key] = value;
    }
  }
  if (Object.keys(attributes).length > 0) {
    result.attributes = attributes;
  }
  return result;
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

      // Form fields only ever produce strings (browser FormData has no
      // concept of arrays/objects), but upstream JSON APIs like Brevo's
      // contacts endpoint require e.g. listIds as a real array. A field
      // written as JSON (starts with [ or {) is parsed back into its
      // intended type before forwarding.
      for (const [key, value] of Object.entries(submitted)) {
        if (typeof value !== 'string') continue;
        const trimmed = value.trim();
        if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) continue;
        try {
          submitted[key] = JSON.parse(trimmed);
        } catch {
          // Not valid JSON - leave as the original string.
        }
      }

      const isBrevoCreateContact =
        endpoint.baseUrl.includes('api.brevo.com') &&
        route.path.replace(/^\/+/, '') === 'contacts' &&
        route.method === 'POST';
      const requestBody = isBrevoCreateContact ? nestBrevoContactAttributes(submitted) : submitted;

      const result = await proxyFetch(upstreamUrl, route.method, headers, requestBody, 15000);

      if (result.status >= 200 && result.status < 300) {
        res.status(result.status).json({ success: true, response: result.body });
      } else {
        logger.error(
          { upstreamStatus: result.status, upstreamBody: result.body, endpointName, routePath: route.path },
          '[gateway] form submit rejected by upstream'
        );
        res.status(502).json({ success: false, error: 'Upstream rejected the submission' });
      }
    } catch (err) {
      logGatewayError('gateway form submit', err);
      res.status(502).json({ error: 'Submission failed' });
    }
  });

  return router;
}
