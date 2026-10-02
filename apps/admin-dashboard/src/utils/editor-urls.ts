// Returns the URL for whoobe-one-spike. Uses direct port 3006 on localhost
// only - that's the native single-instance dev setup (Vite dev server
// needs its own origin for HMR/asset paths, and its port is fixed/known).
// Everywhere else (any other hostname, HTTP or HTTPS) goes through the
// nginx-proxied /whoobe-one/ path on the current origin instead: a
// same-host workspace can have its own whoobe-one-spike on any port (see
// scripts/provision-workspace.sh's per-workspace port offsets), so a
// hardcoded direct port here would silently hit an unrelated instance
// (e.g. the local dev server on 3006) rather than this workspace's own -
// deploy/nginx/_locations.conf.template proxies /whoobe-one/ correctly
// regardless of protocol, so there's no HTTP-only special case anymore.
//
// VITE_WHOOBE_ONE_URL (build time) overrides all of the above, e.g. a stack
// published on non-default ports on localhost, or a single container serving
// the editor under /whoobe-one: set it to the full base URL (no trailing
// slash), e.g. http://localhost:3106/whoobe-one.
export function getWhoobeOneSpikeUrl(): string {
  const override = import.meta.env.VITE_WHOOBE_ONE_URL
  if (typeof override === 'string' && override.trim()) return override.trim().replace(/\/+$/, '')
  if (typeof window === 'undefined') return 'http://localhost:3006'
  const hostname = window.location.hostname
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'
  if (isLocalhost) {
    return `${window.location.protocol}//${hostname}:3006`
  }
  const port = window.location.port
  return `${window.location.protocol}//${hostname}${port ? `:${port}` : ''}/whoobe-one`
}

// Same for whoobe-studio (port 3004).
export function getWhoobeStudioUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:3004'
  const hostname = window.location.hostname
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'
  if (isLocalhost) {
    return `${window.location.protocol}//${hostname}:3004`
  }
  if (window.location.protocol === 'https:') {
    const port = window.location.port
    return `${window.location.protocol}//${hostname}${port ? `:${port}` : ''}/whoobe-studio`
  }
  return `${window.location.protocol}//${hostname}:3004`
}