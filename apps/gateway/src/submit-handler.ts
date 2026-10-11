import { Router, type Request, type Response } from 'express';
import { proxyFetch } from './proxy-engine.js';
import { logGatewayError, logger } from './log-error.js';
import { buildAuthHeaders } from './gateway-auth-headers.js';
import { resolveGatewayUrl } from './resolve-gateway-url.js';
import { checkSiteAuth } from './site-auth.js';
import { extractOutcome } from './submit-outcome.js';
import { submitIpLimiter, submitSiteLimiter, validateSubmittedAttributes, isUuid } from './public-limits.js';

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

/** Public (unauthenticated by design - a visitor submitting a real Form has
 *  no session) counterpart to resolve-handler.ts's public resolve route:
 *  forwards a page Form's submitted values as a write (POST/PUT/PATCH) to a
 *  Gateway endpoint/route - but only the ONE endpoint/route pinned to this
 *  exact Form at page-save time (bindPageGatewayContent, core-api), never
 *  one the client picks by name. Mounted at /api/v1/gateway/submit. See
 *  docs/plans/api-gateway/gateway-auth-authz.md. */
export function createSubmitHandler(): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
      // before any database work (see public-limits.ts)
      if (submitIpLimiter.hit(req.ip ?? 'unknown')) {
        res.status(429).json({ error: 'Too many submissions, please try again later' });
        return;
      }
      const { bindingId, attributes } = req.body as {
        bindingId?: string; attributes?: Record<string, unknown>;
      };

      if (!bindingId) {
        res.status(400).json({ error: 'bindingId is required' });
        return;
      }
      if (!isUuid(bindingId)) {
        // a malformed id can match nothing: answer like an unknown one, without a database round trip
        res.status(404).json({ error: 'Unknown submit target' });
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

      const { getGatewayBindingById, getGatewayEndpoint, getGatewayRoute, FORM_FIELDS_SENTINEL } = await import('@whoobe-cms/core/server');

      const binding = await getGatewayBindingById(bindingId);
      if (!binding || binding.kind !== 'submit') {
        res.status(404).json({ error: 'Unknown submit target' });
        return;
      }

      const auth = await checkSiteAuth(req, binding.websiteId);
      if (!auth.ok) {
        res.status(auth.status ?? 403).json({ error: auth.error ?? 'Not authorized' });
        return;
      }

      if (submitSiteLimiter.hit(`site:${binding.websiteId}`)) {
        res.status(429).json({ error: 'Too many submissions, please try again later' });
        return;
      }
      const shapeError = validateSubmittedAttributes(attributes as Record<string, unknown>);
      if (shapeError) {
        res.status(400).json({ error: shapeError });
        return;
      }

      const [endpoint, route] = await Promise.all([
        getGatewayEndpoint(binding.endpointId),
        getGatewayRoute(binding.routeId),
      ]);
      if (!endpoint || !endpoint.isActive || !route) {
        res.status(404).json({ error: 'Submit target is no longer available' });
        return;
      }

      const upstreamUrl = resolveGatewayUrl(endpoint.baseUrl, route.path);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      Object.assign(headers, await buildAuthHeaders(endpoint));

      const submitted = { ...(attributes as Record<string, unknown>) };
      delete submitted._hp;

      // Only the fields the form actually has (recorded in the binding when the page was saved) go
      // upstream - a visitor must not be able to add fields such as Brevo's listIds / updateEnabled.
      const fieldAllowlist = binding.paramKeys.includes(FORM_FIELDS_SENTINEL)
        ? new Set(binding.paramKeys.filter((k: string) => k !== FORM_FIELDS_SENTINEL))
        : null;
      if (fieldAllowlist) {
        for (const key of Object.keys(submitted)) {
          if (!fieldAllowlist.has(key)) delete submitted[key];
        }
      } else if (process.env.GATEWAY_REQUIRE_FIELD_ALLOWLIST === 'true') {
        // legacy binding (saved before the allowlist existed): refuse until the page is saved again
        res.status(409).json({ error: 'This form must be saved again before it can be used' });
        return;
      } else {
        logger.warn({ bindingId }, '[gateway] submit binding has no field allowlist (page saved before F-029); forwarding every field');
      }

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
        // `outcome`: the only part of the service's reply the page acts on (a validated key, see submit-outcome.ts).
        // `response` (the whole body) is still passed on for now; it is to be dropped, see docs/plans/automations/.
        const outcome = extractOutcome(result.body);
        res.status(result.status).json(outcome ? { success: true, outcome, response: result.body } : { success: true, response: result.body });
      } else {
        logger.error(
          { upstreamStatus: result.status, upstreamBody: result.body, bindingId, routePath: route.path },
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
