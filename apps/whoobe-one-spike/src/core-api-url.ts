// Returns the core-api base URL. On localhost, all backend ports are
// directly accessible so use localhost:3003 directly. On external hosts
// (Cloudflare tunnel, LAN), only the admin-dashboard port (3000) is exposed
// and API calls go through the Vite proxy, so use the page's own origin.
export function getDefaultCoreApiUrl(): string {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const hostname = window.location.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${window.location.protocol}//${hostname}:3003`
    }
    const port = window.location.port
    return `${window.location.protocol}//${hostname}${port ? `:${port}` : ''}`
  }
  return 'http://localhost:3003'
}