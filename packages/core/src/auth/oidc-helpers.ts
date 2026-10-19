import { createHash, randomBytes } from 'node:crypto';
import { claimValues } from '../gateway/client-jwt.js';
import type { OidcRoleMapping } from '../db/oidc-schema.js';

// The pure parts of the staff OIDC login (docs/plans/system/oidc-login-plan.md): PKCE, the claim to role mapping, the addresses.

export const randomUrlToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

/** RFC 7636, S256: BASE64URL(SHA256(verifier)). */
export const pkceChallenge = (verifier: string): string => createHash('sha256').update(verifier).digest('base64url');

export const sha256Hex = (v: string): string => createHash('sha256').update(v).digest('hex');

export interface RoleSync {
  /** the roles the claim grants */
  grant: string[];
  /** every role the mapping manages: the ones not granted are taken away, the others (given by hand) are left alone */
  managed: string[];
}

/** Which roles the claims of the ID token grant, through the mapping. A mapping without a claim name grants nothing. */
export function mapRoles(claims: Record<string, unknown>, roleClaim: string | null | undefined, mapping: readonly OidcRoleMapping[]): RoleSync {
  const managed = [...new Set(mapping.map((m) => m.roleId))];
  if (!roleClaim || mapping.length === 0) return { grant: [], managed: roleClaim ? managed : [] };
  const present = new Set(claimValues(claims, roleClaim));
  const grant = [...new Set(mapping.filter((m) => present.has(m.value)).map((m) => m.roleId))];
  return { grant, managed };
}

/** The address a provider calls back, built from the setting and never from the request. */
export function oidcRedirectUri(redirectBaseUrl: string): string {
  return `${redirectBaseUrl.replace(/\/+$/, '')}/auth/oidc/callback`;
}

/** Where the browser goes after a sign-in or a failure: the dashboard root of the configured address, never a value of the request. */
export function oidcLandingUrl(redirectBaseUrl: string, error?: string): string {
  const base = `${redirectBaseUrl.replace(/\/+$/, '')}/`;
  return error ? `${base}?sso_error=${encodeURIComponent(error)}` : base;
}

/** Short, fixed codes shown to the person; the cause goes to the log. */
export const OIDC_ERRORS = {
  not_configured: 'Single sign-on is not set up.',
  provider_error: 'The provider refused the sign-in.',
  invalid_state: 'The sign-in expired or was not started here. Try again.',
  token_exchange: 'The provider did not complete the sign-in. Try again.',
  invalid_token: 'The provider\'s answer could not be verified.',
  email_not_verified: 'The provider has not verified your e-mail address.',
  no_account: 'There is no account for you here. Ask an administrator.',
  inactive: 'This account is deactivated.',
  no_access: 'No access has been given to this account. Ask an administrator.',
} as const;
export type OidcErrorCode = keyof typeof OIDC_ERRORS;

const HTTPS_OR_LOCAL_HTTP = (v: string, allowHttp: boolean): boolean => {
  try {
    const u = new URL(v);
    if (u.username || u.password || u.hash || u.search) return false;
    return u.protocol === 'https:' || (allowHttp && u.protocol === 'http:');
  } catch { return false; }
};
export const isOidcUrl = HTTPS_OR_LOCAL_HTTP;

/** http addresses for the provider: outside production, or when the operator says the provider is on a network they trust (OIDC_ALLOW_HTTP=true). */
export const oidcAllowsHttp = (env: NodeJS.ProcessEnv = process.env): boolean => env.NODE_ENV !== 'production' || env.OIDC_ALLOW_HTTP === 'true';
