// Returns the URL for whoobe-one-spike. Uses direct port 3006 on localhost
// (Vite dev server needs its own origin for HMR/asset paths), and the
// nginx-proxied /whoobe-one/ path when accessed from a remote hostname.
export function getWhoobeOneSpikeUrl(): string {
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
  const port = window.location.port
  return `${window.location.protocol}//${hostname}${port ? `:${port}` : ''}/whoobe-studio`
}