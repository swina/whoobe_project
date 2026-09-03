// Returns the URL for whoobe-one-spike, always using the direct port 3006.
// The editor Vue app serves its own assets (Vite dev server) and must be
// accessed on its own port — proxying through admin-dashboard's port is
// broken because Vite's HTML contains absolute asset paths (/@vite/client,
// /src/main.ts) that the browser resolves against the wrong origin.
export function getWhoobeOneSpikeUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:3006'
  const hostname = window.location.hostname
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
  const port = window.location.port
  return `${window.location.protocol}//${hostname}${port ? `:${port}` : ''}/whoobe-studio`
}