// Thin HTTP client for apps/core-api's auth endpoints. Session state lives
// entirely in an httpOnly cookie set by the server - this client never
// touches a token directly, it just always sends `credentials: 'include'`
// so the browser attaches that cookie. Cookies are host-scoped, not
// port-scoped, so the same cookie set here is also sent to asset-processor
// (see dam-api.ts) as long as both are reached via the same hostname.

export interface AuthenticatedUser {
  id: string
  email: string
  displayName: string
  permissions: string[]
}

// /auth/login's other possible shape: password was correct, but the
// account has TOTP enabled, so no session exists yet - the caller must
// follow up with mfaChallenge() using mfaToken before getting a real
// AuthenticatedUser back.
export interface MfaRequired {
  mfaRequired: true
  mfaToken: string
}

export interface MfaSetupResponse {
  secret: string
  otpauthUrl: string
  qrCodeDataUrl: string
}

export interface MfaVerifySetupResponse {
  success: true
  recoveryCodes: string[]
}

// Mirrors dam-api.ts's getDefaultAssetProcessorUrl(): default to whatever
// hostname the page itself was loaded from, never a hardcoded "localhost".
export function getDefaultCoreApiUrl(): string {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:3003`
  }
  return 'http://localhost:3003'
}

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

export async function login(baseUrl: string, email: string, password: string): Promise<AuthenticatedUser | MfaRequired> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

// Step 2 of login when mfaRequired came back from login() above - pass
// either a 6-digit authenticator `code` or a one-time `recoveryCode`, not
// both are required (the server tries whichever is present).
export async function mfaChallenge(
  baseUrl: string,
  mfaToken: string,
  credentials: { code?: string; recoveryCode?: string }
): Promise<AuthenticatedUser> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/auth/mfa/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mfaToken, ...credentials }),
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

export async function fetchMfaStatus(baseUrl: string): Promise<{ enabled: boolean }> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/auth/mfa/status`, { credentials: 'include' })
  return parseJsonOrThrow(res)
}

export async function startMfaSetup(baseUrl: string): Promise<MfaSetupResponse> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/auth/mfa/setup`, {
    method: 'POST',
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

export async function verifyMfaSetup(baseUrl: string, code: string): Promise<MfaVerifySetupResponse> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/auth/mfa/verify-setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
}

export async function disableMfa(baseUrl: string, password: string): Promise<void> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/auth/mfa/disable`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
    credentials: 'include',
  })
  await parseJsonOrThrow(res)
}

export async function logout(baseUrl: string): Promise<void> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  })
  await parseJsonOrThrow(res)
}

// Returns null (not a thrown error) on 401 - "not logged in" is an expected,
// routine outcome here (e.g. on first page load), not a failure to surface.
export async function fetchCurrentUser(baseUrl: string): Promise<AuthenticatedUser | null> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/auth/me`, { credentials: 'include' })
  if (res.status === 401) return null
  return parseJsonOrThrow(res)
}
