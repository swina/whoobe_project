// Scopes of API clients and the matching of a request path to a configured gateway route
// (docs/plans/api-gateway/client-access-hub.md, 4.2). Pure functions, no I/O.
//
// A gateway scope is  gateway:call:<endpoint name>:<METHOD | *>:<route template | prefix/* | *>
//   gateway:call:Shop:GET:orders.json         one route
//   gateway:call:Shop:GET:customers/{id}      one route with a parameter
//   gateway:call:Shop:GET:customers/*         every route whose template starts with customers/
//   gateway:call:Shop:*:*                     every route of the endpoint (the dashboard warns about this one)
// The endpoint is never a wildcard. The scope is checked against the route that the request path was MATCHED to,
// never against the raw path.

export type ClientAuthMode = 'key' | 'jwt';

export interface GatewayScope {
  endpoint: string;
  /** '*' or an upper-case method. */
  method: string;
  /** '*', a template, or a prefix ending in '/*'. */
  route: string;
}

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const MAX_SCOPES = 200;
const MAX_SCOPE_LENGTH = 400;

export function formatGatewayScope(s: GatewayScope): string {
  return `gateway:call:${s.endpoint}:${s.method}:${s.route}`;
}

// An automation scope is  automation:run:<endpoint name>:<route template | *>   (start the flow behind a POST route of an engine endpoint,
// Activepieces / n8n, and read its answer). The route is the one configured in Integrations, as in a gateway scope.
export interface AutomationScope { endpoint: string; route: string }

export const formatAutomationScope = (s: AutomationScope): string => `automation:run:${s.endpoint}:${s.route}`;

export function parseAutomationScope(text: string): AutomationScope | { error: string } {
  if (typeof text !== 'string' || text.length > MAX_SCOPE_LENGTH) return { error: 'Scope is too long or not text' };
  const parts = text.split(':');
  if (parts.length < 4 || parts[0] !== 'automation' || parts[1] !== 'run') return { error: `Not an automation scope: ${text}` };
  // same endpoint and route rules as a gateway scope: reuse them
  const g = parseGatewayScope(`gateway:call:${parts[2]}:POST:${parts.slice(3).join(':')}`);
  if ('error' in g) return { error: g.error.replace('gateway scope', 'automation scope') };
  if (g.route.endsWith('/*')) return { error: 'An automation scope names a route, or * for every POST route of the endpoint' };
  return { endpoint: g.endpoint, route: g.route };
}

/** Does any scope allow starting the flow behind this route (the template the request was matched to)? */
export function automationScopeAllows(scopes: readonly string[], endpoint: string, routeTemplate: string): boolean {
  const tpl = routeTemplate.replace(/^\/+/, '');
  for (const text of scopes) {
    if (!text.startsWith('automation:')) continue;
    const s = parseAutomationScope(text);
    if ('error' in s) continue;
    if (s.endpoint === endpoint && (s.route === '*' || s.route === tpl)) return true;
  }
  return false;
}

// A data scope is  data:read:<class name | *>   (read of the published objects of one Data Class; the class is named, never matched by pattern)
export interface DataScope { action: 'read'; className: string }

export function formatDataScope(s: DataScope): string {
  return `data:${s.action}:${s.className}`;
}

export function parseDataScope(text: string): DataScope | { error: string } {
  if (typeof text !== 'string' || text.length > MAX_SCOPE_LENGTH) return { error: 'Scope is too long or not text' };
  const m = /^data:([a-z]+):(.+)$/.exec(text);
  if (!m) return { error: `Not a data scope: ${text}` };
  if (m[1] !== 'read') return { error: `Unknown data action: ${m[1]} (only read exists)` };
  const className = m[2];
  if (className.includes(':') || /[\u0000-\u001f]/.test(className) || className.trim() !== className) return { error: `Invalid class name in scope: ${className}` };
  return { action: 'read', className };
}

/** Does any scope allow reading the published objects of this class? */
export function dataScopeAllows(scopes: readonly string[], action: 'read', className: string): boolean {
  for (const text of scopes) {
    if (!text.startsWith('data:')) continue;
    const s = parseDataScope(text);
    if ('error' in s) continue;
    if (s.action === action && (s.className === '*' || s.className === className)) return true;
  }
  return false;
}

// An asset scope is  assets:read:<folder | *>   (metadata and content of the assets of a DAM folder and its sub-folders: `/products`
// allows `/products` and `/products/summer`, never `/products-old`; `*` is every folder).
export interface AssetScope { action: 'read'; folder: string }

export const formatAssetScope = (s: AssetScope): string => `assets:${s.action}:${s.folder}`;

export function parseAssetScope(text: string): AssetScope | { error: string } {
  if (typeof text !== 'string' || text.length > MAX_SCOPE_LENGTH) return { error: 'Scope is too long or not text' };
  const m = /^assets:([a-z]+):(.+)$/.exec(text);
  if (!m) return { error: `Not an asset scope: ${text}` };
  if (m[1] !== 'read') return { error: `Unknown asset action: ${m[1]} (only read exists)` };
  let folder = m[2];
  if (folder !== '*') {
    folder = '/' + folder.split('/').filter(Boolean).join('/');
    if (folder === '/') return { error: 'An asset scope names a folder (/products), or * for all folders' };
    if (/[\u0000-\u001f:\\*?#]/.test(folder) || folder.split('/').some((seg) => seg === '.' || seg === '..')) return { error: `Invalid folder in scope: ${m[2]}` };
  }
  return { action: 'read', folder };
}

/** Does any scope allow reading the assets of this folder (the folder itself or a folder below a scoped one)? */
export function assetScopeAllows(scopes: readonly string[], action: 'read', folderPath: string): boolean {
  const folder = '/' + folderPath.split('/').filter(Boolean).join('/');
  for (const text of scopes) {
    if (!text.startsWith('assets:')) continue;
    const s = parseAssetScope(text);
    if ('error' in s || s.action !== action) continue;
    if (s.folder === '*' || folder === s.folder || folder.startsWith(s.folder + '/')) return true;
  }
  return false;
}

/** Returns the parsed scope, or an error text. The endpoint name cannot contain ':' (it is the separator). */
export function parseGatewayScope(text: string): GatewayScope | { error: string } {
  if (typeof text !== 'string' || text.length > MAX_SCOPE_LENGTH) return { error: 'Scope is too long or not text' };
  const parts = text.split(':');
  if (parts.length < 5 || parts[0] !== 'gateway' || parts[1] !== 'call') return { error: `Not a gateway scope: ${text}` };
  const endpoint = parts[2];
  const method = parts[3].toUpperCase();
  const route = parts.slice(4).join(':');
  if (!endpoint || endpoint === '*') return { error: 'A scope names one endpoint (no wildcard)' };
  if (method !== '*' && !METHODS.has(method)) return { error: `Unknown method in scope: ${parts[3]}` };
  if (!route) return { error: 'A scope needs a route, or * for all routes of the endpoint' };
  if (route !== '*' && (route.includes('*') && !route.endsWith('/*') || route.includes('..') || route.startsWith('/') || route.includes('//'))) {
    return { error: `Invalid route in scope: ${route}` };
  }
  return { endpoint, method, route };
}

/** Validates a scope list as saved from the dashboard. */
export function validateClientScopes(scopes: unknown): { ok: true; scopes: string[] } | { ok: false; error: string } {
  if (!Array.isArray(scopes)) return { ok: false, error: 'scopes must be a list' };
  if (scopes.length > MAX_SCOPES) return { ok: false, error: `At most ${MAX_SCOPES} scopes` };
  const out: string[] = [];
  for (const raw of scopes) {
    if (typeof raw === 'string' && raw.startsWith('automation:')) {
      const a = parseAutomationScope(raw);
      if ('error' in a) return { ok: false, error: a.error };
      const norm = formatAutomationScope(a);
      if (!out.includes(norm)) out.push(norm);
      continue;
    }
    if (typeof raw === 'string' && raw.startsWith('assets:')) {
      const a = parseAssetScope(raw);
      if ('error' in a) return { ok: false, error: a.error };
      const norm = formatAssetScope(a);
      if (!out.includes(norm)) out.push(norm);
      continue;
    }
    if (typeof raw === 'string' && raw.startsWith('data:')) {
      const d = parseDataScope(raw);
      if ('error' in d) return { ok: false, error: d.error };
      const norm = formatDataScope(d);
      if (!out.includes(norm)) out.push(norm);
      continue;
    }
    const p = typeof raw === 'string' ? parseGatewayScope(raw) : { error: 'A scope must be text' };
    if ('error' in p) return { ok: false, error: p.error };
    const norm = formatGatewayScope(p);
    if (!out.includes(norm)) out.push(norm);
  }
  return { ok: true, scopes: out };
}

/** Does any scope allow this call? `routeTemplate` is the template of the route the request was matched to. */
export function scopeAllows(scopes: readonly string[], endpoint: string, method: string, routeTemplate: string): boolean {
  const m = method.toUpperCase();
  const tpl = routeTemplate.replace(/^\/+/, '');
  for (const text of scopes) {
    const s = parseGatewayScope(text);
    if ('error' in s) continue;
    if (s.endpoint !== endpoint) continue;
    if (s.method !== '*' && s.method !== m) continue;
    if (s.route === '*' || s.route === tpl) return true;
    if (s.route.endsWith('/*') && tpl.startsWith(s.route.slice(0, -1))) return true;
  }
  return false;
}

export interface MatchableRoute { path: string; method: string }

/** Why a path cannot be used at all, or null. Applied to the decoded path before any matching. */
export function unsafePathReason(path: string): string | null {
  if (path.length === 0 || path.length > 512) return 'Path is empty or too long';
  if (/[\u0000-\u001f\\?#]/.test(path)) return 'Path contains forbidden characters';
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.' || seg === '..') return 'Path has an empty or relative segment';
  }
  return null;
}

/**
 * The route a request path belongs to: segment by segment, a `{name}` segment of the template takes any one segment; the
 * most specific template wins (most literal segments); a tie is refused as `ambiguous` unless `tie` is 'first' (the sort is stable, so
 * that is the first one listed).
 * The parameter values are the request's own segments; the caller encodes them when building the upstream URL.
 */
export function matchRoute<R extends MatchableRoute>(
  routes: readonly R[],
  method: string,
  path: string,
  /** Two templates equally specific (`products/{id}` and `products/{name}`): 'refuse' (default) or take the first. */
  tie: 'refuse' | 'first' = 'refuse',
): { route: R; params: Record<string, string> } | 'none' | 'ambiguous' {
  const segs = path.split('/');
  const hits: { route: R; params: Record<string, string>; literals: number }[] = [];
  for (const r of routes) {
    if (r.method.toUpperCase() !== method.toUpperCase()) continue;
    const tpl = r.path.replace(/^\/+/, '').split('/');
    if (tpl.length !== segs.length) continue;
    const params: Record<string, string> = {};
    let literals = 0;
    let ok = true;
    for (let i = 0; i < tpl.length && ok; i++) {
      const m = /^\{([A-Za-z0-9_]+)\}$/.exec(tpl[i]);
      if (m) params[m[1]] = segs[i];
      else if (tpl[i] === segs[i]) literals++;
      else ok = false;
    }
    if (ok) hits.push({ route: r, params, literals });
  }
  if (!hits.length) return 'none';
  hits.sort((a, b) => b.literals - a.literals);
  if (tie === 'refuse' && hits.length > 1 && hits[0].literals === hits[1].literals) return 'ambiguous';
  return { route: hits[0].route, params: hits[0].params };
}
