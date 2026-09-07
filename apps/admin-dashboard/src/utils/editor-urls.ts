// Returns the URL for whoobe-one-spike. Uses direct port 3006 on localhost
// (Vite dev server needs its own origin for HMR/asset paths). On HTTP (local
// LAN dev, e.g. http://whoobecms.local:3000), also uses direct port 3006
// since there's no nginx to proxy /whoobe-one/. Only uses the nginx-proxied
// /whoobe-one/ path on HTTPS (production behind nginx on port 443).
export function getWhoobeOneSpikeUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:3006'
  const hostname = window.location.hostname
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'
  if (isLocalhost) {
    return `${window.location.protocol}//${hostname}:3006`
  }
  if (window.location.protocol === 'https:') {
    const port = window.location.port
    return `${window.location.protocol}//${hostname}${port ? `:${port}` : ''}/whoobe-one`
  }
  return `${window.location.protocol}//${hostname}:3006`
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