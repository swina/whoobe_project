// A URL stored in localStorage is stale when its hostname no longer matches
// the page's current hostname — the session cookie is host-scoped, so it
// will never be sent to the old host, and every authenticated request would
// 401. Discard the stale value in favor of the default (same-host) URL.
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

export function isStoredUrlStale(storedUrl: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    const parsed = new URL(storedUrl)
    const currentHost = window.location.hostname
    const currentPort = window.location.port || '80'
    // If the hostname differs, the stored URL is stale (cookie won't be sent)
    if (parsed.hostname !== currentHost && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      return true
    }
    return false
  } catch {
    return false
  }
}