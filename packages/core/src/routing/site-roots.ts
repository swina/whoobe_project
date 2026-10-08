// Website root paths and the host's URL space. A website's root (preview) path (`/whoobe-website`) is the first segment
// of the URL its pages are previewed at, on the host of the dashboard. That host also carries the dashboard itself and the
// APIs, so a root path must not be a name something else answers to, and the reverse proxy needs a way to tell "this is
// a website" from "this is the dashboard" for any first segment (core-api's GET /site-root, called by nginx for the
// requests that no other location claims).

/** First segments that belong to the dashboard, the editor, the APIs and the usual well-known files. A root path
 *  equal to one of them could never be reached (the proxy sends the name to the thing that owns it). */
export const RESERVED_ROOT_SEGMENTS: ReadonlySet<string> = new Set([
  // the editor and the asset/API prefixes of the proxy template (deploy/nginx/_locations.conf.template)
  'whoobe-one', 'api', 'dam-asset', 'assets', 'site-root', 'editor',
  // core-api routes served at the top level
  'auth', 'documents', 'snippets', 'data-classes', 'data-components', 'data-objects', 'mail-settings', 'mail-log',
  'mail-templates', 'migration-sources', 'health', 'search', 'themes', 'public', 'ai', 'figma', 'preview', 'sites',
  'pages', 'settings', 'workflows', 'users', 'roles', 'pwa', 'internal',
  // dashboard screens and files a browser asks for on its own
  'login', 'logout', 'forgot-password', 'reset-password', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'manifest.webmanifest',
]);

/** `/some-root/..` -> `some-root`; query, hash and case are ignored; '' for `/`. */
export function firstSegment(uri: string): string {
  const path = uri.split(/[?#]/, 1)[0] ?? '';
  const seg = path.split('/').find((s) => s !== '') ?? '';
  let decoded = seg;
  try { decoded = decodeURIComponent(seg); } catch { /* keep as is */ }
  return decoded.toLowerCase();
}

/** True when the root path (`/name`) would collide with something the host serves itself. */
export function isReservedRootPath(rootPath: string): boolean {
  return RESERVED_ROOT_SEGMENTS.has(firstSegment(rootPath));
}

/** Does the request URI belong to one of the websites? `roots` are root paths as stored (`/whoobe-website`). */
export function matchSiteRoot(uri: string, roots: Iterable<string>): boolean {
  const seg = firstSegment(uri);
  if (!seg || RESERVED_ROOT_SEGMENTS.has(seg)) return false;
  for (const r of roots) if (firstSegment(r) === seg) return true;
  return false;
}

/** The root paths, read at most every `ttlMs`: the proxy asks for every request it cannot route by name. */
export function createSiteRootCache(load: () => Promise<string[]>, ttlMs = 5000, now: () => number = Date.now) {
  let roots: string[] | null = null;
  let loadedAt = 0;
  let pending: Promise<string[]> | null = null;
  return {
    async matches(uri: string): Promise<boolean> {
      if (!roots || now() - loadedAt > ttlMs) {
        pending ??= load().finally(() => { pending = null; });
        roots = await pending;
        loadedAt = now();
      }
      return matchSiteRoot(uri, roots);
    },
    clear(): void { roots = null; },
  };
}
