import { computeSitePreviewBase } from './site-preview-url'

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

/** Origin (and path) the pages of a website are previewed under: root path and slug follow it, without
 *  `/whoobe-one/` - see site-preview-url.ts. */
export function getSitePreviewBaseUrl(): string {
  const w = typeof window === 'undefined' ? null : window.location
  if (!w) return 'http://localhost:3006'
  return computeSitePreviewBase({
    override: import.meta.env.VITE_WHOOBE_ONE_URL,
    protocol: w.protocol,
    hostname: w.hostname,
    port: w.port,
  })
}

/** The preview of a website from the dashboard: its home page, with the pages that are not published yet (the server shows them only to a signed-in
 *  editor, and the preview marks itself as a draft). Links followed inside keep the draft mode. */
export function websiteDraftPreviewUrl(website: { rootPath: string | null; defaultLocale: string }): string {
  const rootPath = website.rootPath || ''
  const query = `?locale=${encodeURIComponent(website.defaultLocale || 'en')}${rootPath ? `&rootPath=${encodeURIComponent(rootPath)}` : ''}&draft=true`
  return `${getSitePreviewBaseUrl()}${rootPath}/${query}`
}
