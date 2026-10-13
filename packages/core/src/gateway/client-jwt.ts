import { validateClientScopes } from './client-scopes.js';

// Clients that authenticate with a token of the organisation's identity provider instead of a key
// (docs/plans/api-gateway/client-access-hub.md, sections 12 and 14). This file is the pure part: what a registration looks like, how it is
// validated when saved, and how the claims of an already-verified token become scopes. The cryptographic check of the token (signature,
// issuer, audience, expiry) is in apps/gateway/src/jwt-verify.ts.

export const JWT_ALGORITHMS = ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512', 'EdDSA'] as const;
export type JwtAlgorithm = (typeof JWT_ALGORITHMS)[number];

export interface ClaimMatch {
  /** Claim name or a dotted path into nested claims: `scope`, `groups`, `realm_access.roles`. */
  claim: string;
  /** The claim is a text equal to this, or a list / space separated text that contains it. */
  value: string;
}

export interface ClaimScopeRule extends ClaimMatch {
  /** Scopes granted when the claim matches. Each must also be one of the client's own scopes (the client's scopes are the ceiling). */
  scopes: string[];
}

export interface JwtClientConfig {
  /** Exactly the `iss` of the tokens, trailing slash included when the provider has one (Auth0 does, Keycloak and Entra do not). */
  issuer: string;
  /** The token's `aud` must contain one of these. */
  audience: string[];
  algorithms: JwtAlgorithm[];
  /** Taken from the issuer's OIDC discovery document when absent. */
  jwksUri?: string;
  /** When set, the token's `azp` (or `client_id`) must equal it: a token made for another application of the same provider is refused. */
  authorizedParty?: string;
  /** Claims the token must carry, all of them. */
  requiredClaims?: ClaimMatch[];
  /** Without rules the client's scopes apply to every valid token; with rules a token gets the union of the matching rules, and none = refused. */
  claimScopes?: ClaimScopeRule[];
  /** Calls per second one subject (`sub`) may make, inside the client's own limit. */
  subjectRateLimitRps?: number;
}

const CLAIM_PATH = /^[A-Za-z0-9_:.\-]{1,100}$/;
const MAX_LIST = 50;

function isHttpUrl(v: unknown, allowInsecure: boolean): v is string {
  if (typeof v !== 'string' || v.length > 500) return false;
  try {
    const u = new URL(v);
    if (u.username || u.password || u.hash) return false;
    return u.protocol === 'https:' || (allowInsecure && u.protocol === 'http:');
  } catch { return false; }
}

function claimMatches(v: unknown, label: string): { ok: true; value: ClaimMatch } | { ok: false; error: string } {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o.claim !== 'string' || !CLAIM_PATH.test(o.claim) || typeof o.value !== 'string' || !o.value || o.value.length > 200) {
    return { ok: false, error: `${label}: a claim name and a value are needed` };
  }
  return { ok: true, value: { claim: o.claim, value: o.value } };
}

/** Checks and normalises what the dashboard saves. `allowInsecureHttp` is for a local identity provider outside production. */
export function validateJwtConfig(
  input: unknown,
  clientScopes: readonly string[],
  opts: { allowInsecureHttp?: boolean } = {},
): { ok: true; config: JwtClientConfig } | { ok: false; error: string } {
  const c = input as Record<string, unknown> | null;
  if (!c || typeof c !== 'object') return { ok: false, error: 'jwt settings are required for a client that uses identity-provider tokens' };
  const insecure = !!opts.allowInsecureHttp;
  if (!isHttpUrl(c.issuer, insecure)) return { ok: false, error: 'issuer must be an https address (the `iss` of the tokens)' };
  const aud = typeof c.audience === 'string' ? [c.audience] : c.audience;
  if (!Array.isArray(aud) || !aud.length || aud.length > 10 || aud.some((a) => typeof a !== 'string' || !a || a.length > 300)) {
    return { ok: false, error: 'audience is required (the value the tokens carry in `aud`)' };
  }
  const algs = c.algorithms === undefined ? ['RS256', 'ES256'] : c.algorithms;
  if (!Array.isArray(algs) || !algs.length || algs.some((a) => !(JWT_ALGORITHMS as readonly string[]).includes(a as string))) {
    return { ok: false, error: `algorithms must be taken from: ${JWT_ALGORITHMS.join(', ')} (no HS256, no none)` };
  }
  const out: JwtClientConfig = { issuer: c.issuer as string, audience: [...new Set(aud as string[])], algorithms: [...new Set(algs as JwtAlgorithm[])] };
  if (c.jwksUri !== undefined && c.jwksUri !== '' && c.jwksUri !== null) {
    if (!isHttpUrl(c.jwksUri, insecure)) return { ok: false, error: 'jwksUri must be an https address' };
    out.jwksUri = c.jwksUri as string;
  }
  if (c.authorizedParty !== undefined && c.authorizedParty !== '' && c.authorizedParty !== null) {
    if (typeof c.authorizedParty !== 'string' || c.authorizedParty.length > 200) return { ok: false, error: 'authorizedParty must be text' };
    out.authorizedParty = c.authorizedParty;
  }
  if (c.subjectRateLimitRps !== undefined && c.subjectRateLimitRps !== null && c.subjectRateLimitRps !== '') {
    const n = Number(c.subjectRateLimitRps);
    if (!Number.isInteger(n) || n < 1 || n > 1000) return { ok: false, error: 'subjectRateLimitRps must be a whole number from 1 to 1000' };
    out.subjectRateLimitRps = n;
  }
  if (c.requiredClaims !== undefined) {
    if (!Array.isArray(c.requiredClaims) || c.requiredClaims.length > MAX_LIST) return { ok: false, error: 'requiredClaims must be a list' };
    out.requiredClaims = [];
    for (const r of c.requiredClaims) {
      const m = claimMatches(r, 'requiredClaims');
      if (!m.ok) return m;
      out.requiredClaims.push(m.value);
    }
  }
  if (c.claimScopes !== undefined) {
    if (!Array.isArray(c.claimScopes) || c.claimScopes.length > MAX_LIST) return { ok: false, error: 'claimScopes must be a list' };
    out.claimScopes = [];
    for (const r of c.claimScopes) {
      const m = claimMatches(r, 'claimScopes');
      if (!m.ok) return m;
      const sc = validateClientScopes((r as Record<string, unknown>).scopes);
      if (!sc.ok) return { ok: false, error: `claimScopes: ${sc.error}` };
      const outside = sc.scopes.find((s) => !clientScopes.includes(s));
      if (outside) return { ok: false, error: `claimScopes: "${outside}" is not one of the client's own scopes (they are the ceiling)` };
      out.claimScopes.push({ ...m.value, scopes: sc.scopes });
    }
  }
  return { ok: true, config: out };
}

/** The values a claim path holds: a text gives itself and its space separated words (the OAuth `scope` claim), a list its texts. */
export function claimValues(payload: Record<string, unknown>, path: string): string[] {
  let cur: unknown = payload;
  // a claim name may itself contain dots (a URL-style claim): try the whole name first
  if (Object.prototype.hasOwnProperty.call(payload, path)) cur = payload[path];
  else {
    for (const part of path.split('.')) {
      if (cur === null || typeof cur !== 'object' || Array.isArray(cur) || !Object.prototype.hasOwnProperty.call(cur, part)) return [];
      cur = (cur as Record<string, unknown>)[part];
    }
  }
  if (typeof cur === 'string') return [cur, ...cur.split(/\s+/).filter(Boolean)];
  if (typeof cur === 'number' || typeof cur === 'boolean') return [String(cur)];
  if (Array.isArray(cur)) return cur.filter((v): v is string => typeof v === 'string');
  return [];
}

export const claimHas = (payload: Record<string, unknown>, m: ClaimMatch): boolean => claimValues(payload, m.claim).includes(m.value);

/** The token carries every required claim. */
export function requiredClaimsMet(config: JwtClientConfig, payload: Record<string, unknown>): boolean {
  return (config.requiredClaims ?? []).every((m) => claimHas(payload, m));
}

/** Scopes this token may use: the client's scopes when there are no rules, else the union of the rules the claims satisfy (never beyond the client's scopes). */
export function scopesForClaims(config: JwtClientConfig, clientScopes: readonly string[], payload: Record<string, unknown>): string[] {
  if (!config.claimScopes?.length) return [...clientScopes];
  const out = new Set<string>();
  for (const rule of config.claimScopes) {
    if (!claimHas(payload, rule)) continue;
    for (const s of rule.scopes) if (clientScopes.includes(s)) out.add(s);
  }
  return [...out];
}
