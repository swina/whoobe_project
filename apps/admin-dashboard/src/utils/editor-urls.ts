// Returns the URL for whoobe-one-spike, choosing between the direct port and
// the Vite proxy path depending on the hostname. The proxy path
// (/whoobe-one-editor) is used when the page is on a non-localhost hostname
// (e.g. a Cloudflare tunnel), because port 3006 isn't exposed externally.
// On localhost the direct port is used, avoiding any proxy reliability issues.
export function getWhoobeOneSpikeUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:3006'
  const hostname = window.location.hostname
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'
  if (isLocalhost) {
    return `${window.location.protocol}//${hostname}:3006`
  }
  const port = window.location.port
  return `${window.location.protocol}//${hostname}${port ? `:${port}` : ''}/whoobe-one-editor`
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