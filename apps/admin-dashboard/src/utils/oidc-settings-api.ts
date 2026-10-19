import { getDefaultCoreApiUrl } from './auth-api'

// Single sign-on for staff (docs/plans/system/oidc-login-plan.md). The client secret is write-only: the server says only whether one is set.

export interface OidcRoleMapping { value: string; roleId: string }

export interface OidcSettingsView {
  enabled: boolean
  label: string
  issuer: string | null
  clientId: string | null
  hasClientSecret: boolean
  redirectBaseUrl: string | null
  dashboardUrl: string | null
  scopes: string
  roleClaim: string | null
  roleMapping: OidcRoleMapping[]
  defaultRoleIds: string[]
  autoProvision: boolean
  linkByEmail: boolean
  localLogin: 'all' | 'admins'
  updatedAt: string | null
  /** every role, for the pickers */
  roles?: { id: string; name: string }[]
}

export interface OidcSettingsInput {
  enabled?: boolean
  label?: string
  issuer?: string | null
  clientId?: string | null
  /** blank keeps the stored one */
  clientSecret?: string
  clearClientSecret?: boolean
  redirectBaseUrl?: string | null
  dashboardUrl?: string | null
  scopes?: string
  roleClaim?: string | null
  roleMapping?: OidcRoleMapping[]
  defaultRoleIds?: string[]
  autoProvision?: boolean
  linkByEmail?: boolean
  localLogin?: 'all' | 'admins'
}

/** What the sign-in screen needs, anonymously. */
export interface OidcPublicConfig { enabled: boolean; label: string; localLogin: 'all' | 'admins' }

function normalizeBaseUrl(baseUrl: string): string {
  return (baseUrl || getDefaultCoreApiUrl()).replace(/\/+$/, '')
}

async function parseJsonOrThrow(res: Response): Promise<any> {
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {
      // Ignore body parse failures; use the generic message above.
    }
    throw new Error(message)
  }
  return res.json()
}

export async function fetchOidcPublicConfig(baseUrl: string): Promise<OidcPublicConfig> {
  return parseJsonOrThrow(await fetch(`${normalizeBaseUrl(baseUrl)}/auth/oidc/config`, { credentials: 'include' }))
}

/** The address the "Sign in with ..." button goes to: a full page navigation, the provider answers with a redirect back. */
export const oidcLoginUrl = (baseUrl: string): string => `${normalizeBaseUrl(baseUrl)}/auth/oidc/login`

export async function fetchOidcSettings(baseUrl: string): Promise<OidcSettingsView> {
  return parseJsonOrThrow(await fetch(`${normalizeBaseUrl(baseUrl)}/oidc-settings`, { credentials: 'include' }))
}

export async function saveOidcSettings(baseUrl: string, input: OidcSettingsInput): Promise<OidcSettingsView> {
  return parseJsonOrThrow(await fetch(`${normalizeBaseUrl(baseUrl)}/oidc-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  }))
}

export async function testOidcSettings(baseUrl: string): Promise<{ ok: boolean; error?: string; authorizationEndpoint?: string; tokenEndpoint?: string }> {
  return parseJsonOrThrow(await fetch(`${normalizeBaseUrl(baseUrl)}/oidc-settings/test`, { method: 'POST', credentials: 'include' }))
}

/** What the person reads when the sign-in lands back on the dashboard with ?sso_error=<code> (the cause is in the server log). */
export const OIDC_ERROR_TEXT: Record<string, string> = {
  not_configured: 'Single sign-on is not set up.',
  provider_error: 'The provider refused the sign-in.',
  invalid_state: 'The sign-in expired or was not started here. Try again.',
  token_exchange: 'The provider did not complete the sign-in. Try again.',
  invalid_token: "The provider's answer could not be verified.",
  email_not_verified: 'The provider has not verified your e-mail address.',
  no_account: 'There is no account for you here. Ask an administrator.',
  inactive: 'This account is deactivated.',
  no_access: 'No access has been given to this account. Ask an administrator.',
}
