import { safeFetch } from '../http/safe-fetch.js';
import { createJwtVerifier, JwtRejected } from '../gateway/jwt-verify.js';
import type { JwtAlgorithm } from '../gateway/client-jwt.js';
import { isOidcUrl, oidcAllowsHttp, oidcRedirectUri, pkceChallenge } from './oidc-helpers.js';
import type { OidcSettings } from '../db/oidc-records.js';

// The protocol side of the staff OIDC login: discovery, the authorization address, the code exchange and the check of the ID token
// (docs/plans/system/oidc-login-plan.md). Every request to the provider goes through the outbound guard.

export class OidcProtocolError extends Error {
  constructor(public readonly code: 'provider_error' | 'token_exchange' | 'invalid_token', detail: string) { super(detail); }
}

export interface OidcEndpoints { authorizationEndpoint: string; tokenEndpoint: string }

const DISCOVERY_TTL_MS = 10 * 60_000;
const discoveryCache = new Map<string, { at: number; endpoints: OidcEndpoints }>();
const allowHttp = (): boolean => oidcAllowsHttp();
const ALGORITHMS: JwtAlgorithm[] = ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512', 'EdDSA'];
// the same verifier as the gateway's, with the provider's address rules of the sign-in (https, or http where OIDC_ALLOW_HTTP / non-production allows it)
const verifier = createJwtVerifier({
  allowInsecureHttp: oidcAllowsHttp(),
  fetchJson: async (url) => {
    const res = await safeFetch(url, { headers: { accept: 'application/json' } }, { maxBytes: 512 * 1024, timeoutMs: 5000 });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
});

async function getJson(url: string): Promise<unknown> {
  const res = await safeFetch(url, { headers: { accept: 'application/json' } }, { maxBytes: 512 * 1024, timeoutMs: 5000 });
  if (!res.ok) throw new OidcProtocolError('provider_error', `GET ${url} answered HTTP ${res.status}`);
  return res.json();
}

/** The provider's discovery document: its `issuer` must be exactly the one configured, and the two endpoints must be acceptable addresses. */
export async function discoverOidc(issuer: string, fresh = false): Promise<OidcEndpoints> {
  const hit = discoveryCache.get(issuer);
  if (!fresh && hit && Date.now() - hit.at < DISCOVERY_TTL_MS) return hit.endpoints;
  let doc: Record<string, unknown>;
  try {
    doc = (await getJson(`${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`)) as Record<string, unknown>;
  } catch (e) {
    throw e instanceof OidcProtocolError ? e : new OidcProtocolError('provider_error', `discovery failed: ${(e as Error).message}`);
  }
  if (!doc || doc.issuer !== issuer) throw new OidcProtocolError('provider_error', 'the discovery document is not the provider\'s own (issuer differs)');
  const a = doc.authorization_endpoint;
  const t = doc.token_endpoint;
  const acceptable = (v: unknown): v is string => typeof v === 'string' && isOidcUrl(v.split('?')[0], allowHttp());   // an authorization endpoint may carry a query
  if (!acceptable(a) || !acceptable(t)) {
    throw new OidcProtocolError('provider_error', 'the discovery document has no usable authorization_endpoint / token_endpoint');
  }
  const endpoints = { authorizationEndpoint: a, tokenEndpoint: t };
  if (discoveryCache.size >= 20) discoveryCache.clear();
  discoveryCache.set(issuer, { at: Date.now(), endpoints });
  return endpoints;
}

export function buildAuthorizationUrl(endpoints: OidcEndpoints, s: Pick<OidcSettings, 'clientId' | 'scopes' | 'redirectBaseUrl'>, p: { state: string; nonce: string; verifier: string }): string {
  const u = new URL(endpoints.authorizationEndpoint);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', s.clientId!);
  u.searchParams.set('redirect_uri', oidcRedirectUri(s.redirectBaseUrl!));
  u.searchParams.set('scope', s.scopes);
  u.searchParams.set('state', p.state);
  u.searchParams.set('nonce', p.nonce);
  u.searchParams.set('code_challenge', pkceChallenge(p.verifier));
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}

/** Trades the code for tokens. Only the ID token is kept: the access and refresh tokens are never stored. */
export async function exchangeCode(endpoints: OidcEndpoints, s: Pick<OidcSettings, 'clientId' | 'clientSecret' | 'redirectBaseUrl'>, code: string, codeVerifier: string): Promise<string> {
  const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: oidcRedirectUri(s.redirectBaseUrl!), code_verifier: codeVerifier });
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' };
  if (s.clientSecret) headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(s.clientId!)}:${encodeURIComponent(s.clientSecret)}`).toString('base64')}`;
  else form.set('client_id', s.clientId!);
  let res: Response;
  try {
    res = await safeFetch(endpoints.tokenEndpoint, { method: 'POST', headers, body: form.toString() }, { maxBytes: 256 * 1024, timeoutMs: 8000 });
  } catch (e) {
    throw new OidcProtocolError('token_exchange', `token request failed: ${(e as Error).message}`);
  }
  let body: Record<string, unknown> | null = null;
  try { body = (await res.json()) as Record<string, unknown>; } catch { /* handled below */ }
  if (!res.ok) throw new OidcProtocolError('token_exchange', `token endpoint answered HTTP ${res.status}${typeof body?.error === 'string' ? ` (${body.error})` : ''}`);
  if (!body || typeof body.id_token !== 'string') throw new OidcProtocolError('token_exchange', 'the token response has no id_token');
  return body.id_token;
}

/** Signature (from the provider's JWKS), issuer, audience (= our client id), expiry, `azp` and the nonce of this sign-in. */
export async function verifyIdToken(idToken: string, s: Pick<OidcSettings, 'issuer' | 'clientId'>, nonce: string): Promise<Record<string, unknown>> {
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await verifier.verify(idToken, { issuer: s.issuer!, audience: [s.clientId!], algorithms: ALGORITHMS }));
  } catch (e) {
    throw new OidcProtocolError('invalid_token', e instanceof JwtRejected ? `ID token refused: ${e.reason}` : `ID token refused: ${(e as Error).message}`);
  }
  if (payload.nonce !== nonce) throw new OidcProtocolError('invalid_token', 'ID token refused: nonce differs');
  const azp = payload.azp;
  if (azp !== undefined && azp !== s.clientId) throw new OidcProtocolError('invalid_token', 'ID token refused: azp is another client');
  if (Array.isArray(payload.aud) && payload.aud.length > 1 && azp !== s.clientId) throw new OidcProtocolError('invalid_token', 'ID token refused: several audiences and no azp');
  return payload;
}
