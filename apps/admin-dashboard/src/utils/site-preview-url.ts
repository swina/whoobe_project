// Where the pages of a website are previewed. A page is shown by the editor application, and its address is the
// website's root (preview) path plus the slug (`/whoobe-website/blog`), on the origin that serves the editor:
//   - local development: the editor's own port (`http://localhost:3006/whoobe-website/blog`);
//   - a workspace behind the reverse proxy: the dashboard's own host, root path first - the proxy tells a website's path
//     from the dashboard's (deploy/nginx/_locations.conf.template, core-api GET /site-root) - NOT under /whoobe-one/,
//     which is where the editor itself (the editing screens) lives.
// `override` is VITE_WHOOBE_ONE_URL (the editor's base URL for a stack on odd ports or a single container): the
// `/whoobe-one` it ends with is the editor's mount point, not part of the site's address.

export interface SitePreviewEnv {
  override?: string
  protocol: string
  hostname: string
  port: string
}

export function computeSitePreviewBase(env: SitePreviewEnv): string {
  const override = env.override?.trim()
  if (override) return override.replace(/\/+$/, '').replace(/\/whoobe-one$/, '')
  if (env.hostname === 'localhost' || env.hostname === '127.0.0.1') return `${env.protocol}//${env.hostname}:3006`
  return `${env.protocol}//${env.hostname}${env.port ? `:${env.port}` : ''}`
}
