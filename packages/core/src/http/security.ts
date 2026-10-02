// Shared HTTP hardening for the Express services (core-api, asset-processor):
//  - corsPolicy():            credentialed CORS only for an allowlist, open (credential-less) CORS for public routes
//  - securityHeaders():       baseline response headers, no X-Powered-By
//  - sanitizeServerErrors():  5xx bodies never carry database/stack text
//  - cookieShouldBeSecure():  `Secure` session cookie when the deployment is HTTPS
import type { Request, Response, NextFunction, RequestHandler } from 'express';

export interface CorsPolicyOptions {
  /** Path prefixes served to any origin (without credentials unless the origin is allowed), e.g. `/public/`. */
  publicPathPrefixes?: string[];
  /** Extra exact origins, e.g. `https://admin.example.com`. Default: env CORS_ALLOWED_ORIGINS (comma separated). */
  allowedOrigins?: string[];
  /** Hostnames allowed on any port/scheme. Default: env CORS_ALLOWED_HOSTS + WHOOBE_HOSTNAME (+ localhost outside production). */
  allowedHosts?: string[];
  methods?: string[];
  env?: NodeJS.ProcessEnv;
}

const csv = (v: string | undefined): string[] => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export function resolveCorsAllowlist(opts: CorsPolicyOptions = {}) {
  const env = opts.env ?? process.env;
  const hosts = new Set<string>([...(opts.allowedHosts ?? csv(env.CORS_ALLOWED_HOSTS)), ...(env.WHOOBE_HOSTNAME ? [env.WHOOBE_HOSTNAME] : [])].map((h) => h.toLowerCase()));
  if (env.NODE_ENV !== 'production') for (const h of ['localhost', '127.0.0.1', '[::1]']) hosts.add(h);
  const origins = new Set((opts.allowedOrigins ?? csv(env.CORS_ALLOWED_ORIGINS)).map((o) => o.replace(/\/+$/, '').toLowerCase()));
  return { hosts, origins };
}

export function isOriginAllowed(origin: string | undefined, allow: { hosts: Set<string>; origins: Set<string> }): boolean {
  if (!origin || origin === 'null') return false;
  let url: URL;
  try { url = new URL(origin); } catch { return false; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  return allow.origins.has(url.origin.toLowerCase()) || allow.hosts.has(url.hostname.toLowerCase());
}

export function corsPolicy(opts: CorsPolicyOptions = {}): RequestHandler {
  const allow = resolveCorsAllowlist(opts);
  const publicPrefixes = opts.publicPathPrefixes ?? [];
  const methods = (opts.methods ?? ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']).join(', ');
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    if (!origin) return next();
    res.append('Vary', 'Origin');
    const allowed = isOriginAllowed(origin, allow);
    const isPublic = publicPrefixes.some((p) => req.path === p.replace(/\/$/, '') || req.path.startsWith(p));
    if (allowed || (isPublic && origin !== 'null')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      // Credentials only ever go to an allowed origin, never to "any website" on a public route.
      if (allowed) res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    if (req.method === 'OPTIONS') {
      if (allowed || isPublic) {
        res.setHeader('Access-Control-Allow-Methods', methods);
        const reqHeaders = req.headers['access-control-request-headers'];
        res.setHeader('Access-Control-Allow-Headers', typeof reqHeaders === 'string' ? reqHeaders : 'Content-Type');
        res.setHeader('Access-Control-Max-Age', '600');
      }
      res.status(204).end();
      return;
    }
    next();
  };
}

export function securityHeaders(): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.removeHeader('X-Powered-By');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    next();
  };
}

const DB_OR_STACK_TEXT = /Failed query|params:|invalid input syntax|violates (foreign key|unique|not-null)|duplicate key|\bselect\b.+\bfrom\b|\binsert into\b|\bupdate\b.+\bset\b|relation ".*"|column ".*"|\bat .*\(.*:\d+:\d+\)|node_modules/is;

/** Express handlers here answer 5xx with `error.message`, which for database failures is the full SQL
 *  text and its parameters. In production every 5xx `error` becomes generic; elsewhere only DB/stack
 *  text is hidden (other messages stay readable for development). The original is logged by the handler. */
export function sanitizeServerErrors(opts: { env?: NodeJS.ProcessEnv } = {}): RequestHandler {
  const production = (opts.env ?? process.env).NODE_ENV === 'production';
  return (_req: Request, res: Response, next: NextFunction): void => {
    const json = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (res.statusCode >= 500 && body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
        const message = (body as { error: string }).error;
        if (production || DB_OR_STACK_TEXT.test(message)) body = { ...(body as object), error: 'Internal server error' };
      }
      return json(body);
    }) as Response['json'];
    next();
  };
}

/** `Secure` for the session cookie: explicit COOKIE_SECURE=true, a TLS connection, or a TLS-terminating proxy. */
export function cookieShouldBeSecure(req: Request, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.COOKIE_SECURE === 'true') return true;
  if (env.COOKIE_SECURE === 'false') return false;
  const forwarded = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim().toLowerCase();
  return req.secure || forwarded === 'https';
}
