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
    // Internal-only backend ports (asset-processor on 3002, core-api on 3003)
    // are never reachable from a browser on a remote hostname — those ports
    // listen on 127.0.0.1 only and have no SSL. The stored URL is stale.
    const internalPorts = ['3002', '3003', '3006']
    if (parsed.port && internalPorts.includes(parsed.port)) {
      const isLocalhost = currentHost === 'localhost' || currentHost === '127.0.0.1'
      if (!isLocalhost) return true
    }
    return false
  } catch {
    return false
  }
}