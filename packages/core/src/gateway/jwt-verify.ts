import { jwtVerify, createLocalJWKSet, decodeProtectedHeader, errors, type JSONWebKeySet, type JWTPayload } from 'jose';
import { safeFetch } from '../http/safe-fetch.js';
import type { JwtClientConfig } from './client-jwt.js';

// Verification of an identity provider's access token (docs/plans/api-gateway/client-access-hub.md, sections 12 and 14). Lives in core because two services use it: the gateway (API clients) and core-api (the ID token of a staff sign-in).
// What is checked: size and shape; the algorithm is on the client's allow-list (so `none` and HS256 with a public key as the secret
// cannot pass); the signature, with a key from the provider's JWKS; `iss`, `aud`, `exp` (required), `nbf`; `sub` is present; `azp` /
// `client_id` when the client names one. The JWKS comes from the address in the registration or from the issuer's OIDC discovery
// document, over the outbound guard (safeFetch); it is cached, and re-read at most every 30 seconds when a token names an unknown `kid`.

export type JwtRejection =
  | 'malformed' | 'algorithm' | 'signature' | 'expired' | 'not_yet_valid' | 'issuer' | 'audience' | 'claims' | 'subject'
  | 'authorized_party' | 'unknown_key' | 'no_keys';

export class JwtRejected extends Error {
  constructor(public readonly reason: JwtRejection) { super(reason); }
}

export interface JwtVerifierDeps {
  /** Fetches and parses a JSON document; throws when it cannot. */
  fetchJson: (url: string) => Promise<unknown>;
  /** Plain http for the identity provider (a local one outside production). */
  allowInsecureHttp?: boolean;
  now?: () => number;
}

const MAX_TOKEN_BYTES = 8192;
const JWKS_TTL_MS = 10 * 60_000;
const DISCOVERY_TTL_MS = 60 * 60_000;
const UNKNOWN_KID_REFRESH_MS = 30_000;
const MAX_CACHE = 100;

interface JwksEntry { jwks: JSONWebKeySet; fetchedAt: number }

export interface VerifiedToken { payload: JWTPayload; subject: string }

export function createJwtVerifier(deps: JwtVerifierDeps) {
  const now = deps.now ?? Date.now;
  const jwksCache = new Map<string, JwksEntry>();
  const discoveryCache = new Map<string, { jwksUri: string; at: number }>();
  const inflight = new Map<string, Promise<JwksEntry>>();

  const urlOk = (u: unknown): u is string => {
    if (typeof u !== 'string') return false;
    try { const p = new URL(u); return p.protocol === 'https:' || (!!deps.allowInsecureHttp && p.protocol === 'http:'); } catch { return false; }
  };

  async function jwksUriOf(config: JwtClientConfig): Promise<string> {
    if (config.jwksUri) return config.jwksUri;
    const hit = discoveryCache.get(config.issuer);
    if (hit && now() - hit.at < DISCOVERY_TTL_MS) return hit.jwksUri;
    const doc = (await deps.fetchJson(`${config.issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`)) as { issuer?: unknown; jwks_uri?: unknown } | null;
    // the document must be the provider's own: its `issuer` is exactly the one registered (OIDC Discovery, section 4.3)
    if (!doc || doc.issuer !== config.issuer || !urlOk(doc.jwks_uri)) throw new JwtRejected('no_keys');
    if (discoveryCache.size >= MAX_CACHE) discoveryCache.clear();
    discoveryCache.set(config.issuer, { jwksUri: doc.jwks_uri, at: now() });
    return doc.jwks_uri;
  }

  function loadJwks(uri: string): Promise<JwksEntry> {
    const pending = inflight.get(uri);
    if (pending) return pending;
    const p = (async (): Promise<JwksEntry> => {
      const doc = (await deps.fetchJson(uri)) as JSONWebKeySet | null;
      if (!doc || !Array.isArray(doc.keys) || doc.keys.length === 0 || doc.keys.length > 100) throw new JwtRejected('no_keys');
      const entry = { jwks: { keys: doc.keys }, fetchedAt: now() };
      if (jwksCache.size >= MAX_CACHE) jwksCache.clear();
      jwksCache.set(uri, entry);
      return entry;
    })().finally(() => inflight.delete(uri));
    inflight.set(uri, p);
    return p;
  }

  async function verify(token: string, config: JwtClientConfig): Promise<VerifiedToken> {
    if (typeof token !== 'string' || token.length > MAX_TOKEN_BYTES || token.split('.').length !== 3) throw new JwtRejected('malformed');
    let alg: string | undefined;
    try { alg = decodeProtectedHeader(token).alg; } catch { throw new JwtRejected('malformed'); }
    if (!alg || !(config.algorithms as string[]).includes(alg)) throw new JwtRejected('algorithm');

    let uri: string;
    let entry: JwksEntry;
    try {
      uri = await jwksUriOf(config);
      const cached = jwksCache.get(uri);
      entry = cached && now() - cached.fetchedAt < JWKS_TTL_MS ? cached : await loadJwks(uri);
    } catch (e) {
      throw e instanceof JwtRejected ? e : new JwtRejected('no_keys');
    }

    const opts = { issuer: config.issuer, audience: config.audience, algorithms: config.algorithms as string[], clockTolerance: 60, requiredClaims: ['exp', 'sub'], currentDate: new Date(now()) };
    const attempt = (jwks: JSONWebKeySet) => jwtVerify(token, createLocalJWKSet(jwks), opts);
    let result;
    try {
      try {
        result = await attempt(entry.jwks);
      } catch (e) {
        // a key the provider rotated in after the cache was filled: look again, but never more often than every 30 seconds
        if (e instanceof errors.JWKSNoMatchingKey && now() - entry.fetchedAt > UNKNOWN_KID_REFRESH_MS) result = await attempt((await loadJwks(uri)).jwks);
        else throw e;
      }
    } catch (e) {
      throw classify(e);
    }

    const { payload } = result;
    if (typeof payload.sub !== 'string' || !payload.sub) throw new JwtRejected('subject');
    if (config.authorizedParty) {
      const azp = typeof payload.azp === 'string' ? payload.azp : typeof payload.client_id === 'string' ? payload.client_id : undefined;
      if (azp !== config.authorizedParty) throw new JwtRejected('authorized_party');
    }
    return { payload, subject: payload.sub };
  }

  return { verify, cacheSize: () => jwksCache.size };
}

function classify(e: unknown): JwtRejected {
  if (e instanceof JwtRejected) return e;
  if (e instanceof errors.JWTExpired) return new JwtRejected('expired');
  if (e instanceof errors.JWTClaimValidationFailed) {
    if (e.claim === 'iss') return new JwtRejected('issuer');
    if (e.claim === 'aud') return new JwtRejected('audience');
    if (e.claim === 'nbf' || e.claim === 'iat') return new JwtRejected('not_yet_valid');
    return new JwtRejected('claims');
  }
  if (e instanceof errors.JWKSNoMatchingKey) return new JwtRejected('unknown_key');
  if (e instanceof errors.JOSEAlgNotAllowed) return new JwtRejected('algorithm');
  if (e instanceof errors.JWSSignatureVerificationFailed) return new JwtRejected('signature');
  if (e instanceof errors.JWTInvalid || e instanceof errors.JWSInvalid) return new JwtRejected('malformed');
  return new JwtRejected('signature');
}

/** The verifier of the gateway and of the staff OIDC login (auth/oidc.ts): documents are fetched through the outbound guard, small and quickly. */
export function createGatewayJwtVerifier() {
  return createJwtVerifier({
    allowInsecureHttp: process.env.NODE_ENV !== 'production',
    fetchJson: async (url) => {
      const res = await safeFetch(url, { headers: { accept: 'application/json' } }, { maxBytes: 512 * 1024, timeoutMs: 5000 });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });
}
