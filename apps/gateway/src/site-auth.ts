import type { Request } from 'express';

/** Optional per-site static key check (docs/plans/api-gateway/gateway-auth-
 *  authz.md) - a second, independent layer on top of the mandatory
 *  gateway_bindings check in submit-handler.ts/resolve-handler.ts. A
 *  published site sends its website id + key as X-Whoobe-Site-Id/
 *  X-Whoobe-Site-Key; this verifies the key against that website's stored
 *  hash (websiteRequiresGatewayApiKey/verifyWebsiteGatewayApiKey, both in
 *  @whoobe-cms/core/server) and cross-checks the id against the binding's
 *  OWN websiteId, so a bindingId leaked from site A can't be replayed under
 *  site B's key (or vice versa) even if both keys are known.
 *
 *  The key is deliberately optional per website: a website with no key
 *  configured (websiteRequiresGatewayApiKey() false) skips this check
 *  entirely and relies on the binding alone - this is what "optional"
 *  means in the plan, not "no check at all" once a site HAS generated one. */
export interface SiteAuthResult {
  ok: boolean;
  /** Present only when ok - the caller's asserted+verified website id. */
  websiteId?: string;
  error?: string;
  status?: number;
}

export async function checkSiteAuth(req: Request, bindingWebsiteId: string): Promise<SiteAuthResult> {
  const { websiteRequiresGatewayApiKey, verifyWebsiteGatewayApiKey } = await import('@whoobe-cms/core/server');

  const headerSiteId = req.headers['x-whoobe-site-id'];
  const headerSiteKey = req.headers['x-whoobe-site-key'];
  const siteId = Array.isArray(headerSiteId) ? headerSiteId[0] : headerSiteId;
  const siteKey = Array.isArray(headerSiteKey) ? headerSiteKey[0] : headerSiteKey;

  const requiresKey = await websiteRequiresGatewayApiKey(bindingWebsiteId);
  if (!requiresKey) {
    // No key configured for this website - binding-only is the policy.
    // A caller MAY still present one (harmless), but we don't require it.
    return { ok: true, websiteId: bindingWebsiteId };
  }

  if (!siteId || !siteKey) {
    return { ok: false, status: 401, error: 'Site authentication required' };
  }
  if (siteId !== bindingWebsiteId) {
    // Never say *why* - "wrong site for this binding" is exactly the kind
    // of detail that helps an attacker map bindingIds to websites.
    return { ok: false, status: 403, error: 'Not authorized for this binding' };
  }
  const valid = await verifyWebsiteGatewayApiKey(siteId, siteKey);
  if (!valid) {
    return { ok: false, status: 403, error: 'Not authorized for this binding' };
  }
  return { ok: true, websiteId: siteId };
}
