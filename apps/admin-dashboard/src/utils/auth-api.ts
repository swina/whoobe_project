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

export async function login(baseUrl: string, email: string, password: string): Promise<AuthenticatedUser> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include',
  })
  return parseJsonOrThrow(res)
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
