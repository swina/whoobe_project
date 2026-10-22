import { runtimeEnv } from './runtime-env'

// Returns the core-api base URL. Prefers the VITE_CORE_API_URL env var
// (set by dev-cms.sh --hostname, e.g. http://develop.local:3003), falling
// back to localhost:3003 (direct port for local dev) or, on external hosts,
// the page's own origin (which works when proxied through admin-dashboard).
export function getDefaultCoreApiUrl(): string {
  if (typeof import.meta !== 'undefined' && runtimeEnv('VITE_CORE_API_URL')) {
    return runtimeEnv('VITE_CORE_API_URL')!
  }
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