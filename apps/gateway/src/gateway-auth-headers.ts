import type { GatewayEndpointRecord } from '@whoobe-cms/core/server';
import { safeFetch } from '@whoobe-cms/core/server';

const OAUTH_CLOCK_SKEW_BUFFER_MS = 60_000;
const OAUTH_TOKEN_REQUEST_TIMEOUT_MS = 15_000;

/** Single implementation of the endpoint auth-type -> outbound-header
 *  mapping, replacing what used to be an identical if/else-if block
 *  duplicated across admin-routes.ts (x3), remote-router.ts, and
 *  resolve-handler.ts. Returns only the auth-specific headers to add - each
 *  call site merges them into whatever headers (Content-Type, Accept, ...)
 *  it already builds. */
export async function buildAuthHeaders(endpoint: GatewayEndpointRecord): Promise<Record<string, string>> {
  const config = endpoint.authConfig as Record<string, string> | undefined;
  if (!config) return {};

  switch (endpoint.authType) {
    case 'api-key':
      return { [config.keyHeader || 'X-API-Key']: config.keyValue || '' };
    case 'bearer':
      return { Authorization: `Bearer ${config.token || ''}` };
    case 'basic': {
      const encoded = Buffer.from(`${config.username || ''}:${config.password || ''}`).toString('base64');
      return { Authorization: `Basic ${encoded}` };
    }
    case 'oauth2': {
      const token = await getValidOAuthToken(endpoint.id, config);
      return token ? { Authorization: `Bearer ${token}` } : {};
    }
    default:
      return {};
  }
}

/** Proactive expiry-based refresh only (no automatic retry-on-401) - a
 *  cached token is reused until it's within OAUTH_CLOCK_SKEW_BUFFER_MS of
 *  its tracked expiry, at which point it's refreshed before use. */
async function getValidOAuthToken(endpointId: string, config: Record<string, string>): Promise<string | null> {
  const { getGatewayEndpointOAuthToken } = await import('@whoobe-cms/core/server');
  const cached = await getGatewayEndpointOAuthToken(endpointId);
  if (cached && cached.expiresAt.getTime() - OAUTH_CLOCK_SKEW_BUFFER_MS > Date.now()) {
    return cached.token;
  }
  return refreshOAuthToken(endpointId, config);
}

/** Client-credentials grant only (see gateway-oauth-tokens.sql's doc
 *  comment) - a stateless POST to the configured token URL, no user
 *  redirect/consent flow. Uses a raw fetch() rather than proxy-engine.ts's
 *  proxyFetch(), which unconditionally JSON-serializes non-GET bodies;
 *  RFC 6749 requires a form-urlencoded token request body. */
export async function refreshOAuthToken(endpointId: string, config: Record<string, string>): Promise<string | null> {
  const tokenUrl = config.tokenUrl;
  if (!tokenUrl) return null;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId || '',
    client_secret: config.clientSecret || '',
  });
  if (config.scope) body.set('scope', config.scope);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OAUTH_TOKEN_REQUEST_TIMEOUT_MS);
  try {
    const response = await safeFetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString(),
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const json = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return null;

    const expiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000);
    const { setGatewayEndpointOAuthToken } = await import('@whoobe-cms/core/server');
    await setGatewayEndpointOAuthToken(endpointId, json.access_token, expiresAt);
    return json.access_token;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
