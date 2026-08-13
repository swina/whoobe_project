// "localhost" in a persisted config URL only ever meant "whatever machine
// the browser happened to be on when it was saved" - if the page is now
// loaded from a different hostname (e.g. a LAN host like develop.local),
// that stale value can never be reachable: the session cookie is host-only
// for the host the login happened on, so it is never attached to API calls
// on the other host (SameSite=Lax + cross-site), and every authenticated
// request comes back 401. Discard the stale value in favor of a fresh
// same-host default instead of getting stuck on it.
export function isStaleLocalhostUrl(url: string): boolean {
  try {
    const parsedHost = new URL(url).hostname
    const isLocalhostUrl = parsedHost === 'localhost' || parsedHost === '127.0.0.1'
    const pageIsLocalhost =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    return isLocalhostUrl && !pageIsLocalhost
  } catch {
    return false
  }
}