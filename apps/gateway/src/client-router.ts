import { Router, type Request, type Response, type NextFunction } from 'express';
import { createFailureLock } from '@whoobe-cms/core/server';
import type { ApiClientRecord } from '@whoobe-cms/core/server';
import { limiter } from './limiter.js';
import { logger, logGatewayError } from './log-error.js';
import { callRoute } from './route-call.js';
import { passedHeaders, queryOf } from './remote-router.js';
import { resolveGatewayUrl } from './resolve-gateway-url.js';
import { pickSafeResponseHeaders } from './redact.js';
import { ipAllowed } from './client-ip.js';
import { createGatewayJwtVerifier, JwtRejected } from './jwt-verify.js';
import { decodeJwt } from 'jose';

// /client/v1: what an application that holds an API key may call (docs/plans/api-gateway/client-access-hub.md).
// The key is read from `Authorization: Bearer wbk_...` or `X-Whoobe-Key`; there is no cookie and no session.
// Every refusal about WHAT may be called answers the same `404 Not found`, so the answer does not tell a client which endpoints and
// routes exist beyond its own scopes.

const MAX_BODY_BYTES = 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

/** `callerScopes`: what this call may use (the client's scopes, or the part of them a token's claims grant); `subject`: the token's `sub`. */
interface ClientRequest extends Request { apiClient?: ApiClientRecord; callerScopes?: string[]; subject?: string }

const jwtVerifier = createGatewayJwtVerifier();

// guessing keys: after 20 failures from one address, that address waits a minute (checked before any database work)
const authFailures = createFailureLock({ max: 20, lockMs: 60_000 });
const lastTouch = new Map<string, number>();

/** A key (`X-Whoobe-Key`, or a bearer value starting `wbk_`) or an identity-provider token (any other bearer value). */
function presentedCredential(req: Request): { kind: 'key' | 'jwt'; value: string } | null {
  const x = req.headers['x-whoobe-key'];
  if (typeof x === 'string' && x) return { kind: 'key', value: x.trim() };
  const a = req.headers.authorization;
  if (typeof a === 'string' && /^Bearer\s+/i.test(a)) {
    const value = a.replace(/^Bearer\s+/i, '').trim();
    return { kind: value.startsWith('wbk_') ? 'key' : 'jwt', value };
  }
  return null;
}

const refuse = (res: Response, status: number, error: string, extra: Record<string, string> = {}): void => {
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  res.status(status).json({ error });
};

async function authenticate(req: ClientRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const ip = req.ip ?? 'unknown';
    if (authFailures.isLocked(ip)) { refuse(res, 429, 'Too many failed attempts, try again later', { 'Retry-After': '60' }); return; }
    const core = await import('@whoobe-cms/core/server');
    const cred = presentedCredential(req);
    let client: ApiClientRecord | null = null;
    let callerScopes: string[] = [];
    let subject: string | undefined;
    let why = 'malformed';
    let denied = false;   // a valid token whose claims give no access: not the same as a bad credential

    if (cred?.kind === 'key') {
      const check = await core.authenticateClientKey(cred.value);
      if (check.ok && check.client.authMode === 'key') {
        client = check.client;
        callerScopes = client.scopes;
        // A static key belongs to a server. A browser adds `Origin` to a cross-origin request, so a key that shows up with one is in a
        // page or an app: refuse it (a script can leave the header out, which is why the address list exists; this stops the common mistake).
        if (req.headers.origin) {
          logger.warn({ clientId: client.id, client: client.name, origin: String(req.headers.origin).slice(0, 100) }, '[gateway] API key refused: sent by a browser');
          refuse(res, 403, 'A key is for servers. A browser or an app must send a token of the identity provider');
          return;
        }
      } else why = check.ok ? 'not a key client' : check.reason;
    } else if (cred?.kind === 'jwt') {
      let iss: unknown;
      try { iss = decodeJwt(cred.value).iss; } catch { /* not a token */ }
      const candidates = typeof iss === 'string' ? await core.listJwtClientsByIssuer(iss) : [];
      why = candidates.length ? 'no client accepted the token' : 'unknown issuer';
      for (const cand of candidates) {
        try {
          const cfg = cand.jwtConfig as unknown as import('@whoobe-cms/core/server').JwtClientConfig;
          const verified = await jwtVerifier.verify(cred.value, cfg);
          // the token is the identity provider's; what it may do is decided here
          if (!core.requiredClaimsMet(cfg, verified.payload as Record<string, unknown>)) { why = 'required claim missing'; denied = true; continue; }
          const granted = core.scopesForClaims(cfg, cand.scopes, verified.payload as Record<string, unknown>);
          if (!granted.length) { why = 'no scope for these claims'; denied = true; continue; }
          client = cand; callerScopes = granted; subject = verified.subject;
          break;
        } catch (e) {
          why = e instanceof JwtRejected ? e.reason : 'verification failed';
        }
      }
    }

    if (!client && denied) {
      logger.info({ ip, reason: why }, '[gateway] valid token without access');
      refuse(res, 403, 'This token does not give access');
      return;
    }
    if (!client) {
      authFailures.fail(ip);
      logger.info({ ip, reason: why, credential: cred?.kind ?? 'none' }, '[gateway] client credential refused');
      refuse(res, 401, 'Invalid or missing credential', { 'WWW-Authenticate': 'Bearer' });
      return;
    }
    if (!ipAllowed(ip, client.allowedIps)) {
      logger.info({ ip, clientId: client.id }, '[gateway] client address not allowed');
      refuse(res, 403, 'This credential cannot be used from this address');
      return;
    }

    const rps = client.rateLimitRps > 0 ? client.rateLimitRps : 10;
    const rate = await limiter.slide(`client:${client.id}`, rps, 1000);
    res.setHeader('RateLimit-Limit', String(rps));
    res.setHeader('RateLimit-Remaining', String(rate.remaining));
    if (!rate.allowed) { refuse(res, 429, 'Rate limit exceeded', { 'Retry-After': String(Math.max(1, Math.ceil(rate.retryAfterMs / 1000))) }); return; }
    if (subject) {
      // one user of the application cannot use up the whole client's allowance
      const cfg = client.jwtConfig as { subjectRateLimitRps?: number } | null;
      const subRps = Math.min(rps, cfg?.subjectRateLimitRps ?? 5);
      const sub = await limiter.slide(`client:${client.id}:sub:${subject}`, subRps, 1000);
      if (!sub.allowed) { refuse(res, 429, 'Rate limit exceeded', { 'Retry-After': String(Math.max(1, Math.ceil(sub.retryAfterMs / 1000))) }); return; }
    }
    if (client.dailyQuota && client.dailyQuota > 0) {
      const day = new Date().toISOString().slice(0, 10);
      const q = await limiter.quota(`client:${client.id}:${day}`, client.dailyQuota, DAY_MS + 3_600_000);
      if (!q.allowed) {
        const secondsToMidnight = Math.ceil((Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1) - Date.now()) / 1000);
        refuse(res, 429, 'Daily quota exceeded', { 'Retry-After': String(secondsToMidnight) });
        return;
      }
    }

    const now = Date.now();
    if (now - (lastTouch.get(client.id) ?? 0) > 60_000) {
      lastTouch.set(client.id, now);
      void core.touchApiClient(client.id).catch(() => undefined);
    }
    req.apiClient = client;
    req.callerScopes = callerScopes;
    req.subject = subject;
    next();
  } catch (err) {
    logGatewayError('client authentication', err);
    refuse(res, 500, 'Authentication check failed');
  }
}

export function createClientRouter(): Router {
  const router = Router();
  router.use(authenticate);

  // What this key is: for diagnostics, no secret in it.
  router.get('/me', (req: ClientRequest, res: Response): void => {
    const c = req.apiClient!;
    res.json({
      name: c.name, authMode: c.authMode, subject: req.subject ?? null, scopes: req.callerScopes ?? c.scopes, rateLimitRps: c.rateLimitRps, dailyQuota: c.dailyQuota,
      expiresAt: c.expiresAt, limiter: limiter.status(),
    });
  });

  router.all('/gateway/:endpoint/*', async (req: ClientRequest, res: Response): Promise<void> => {
    const started = Date.now();
    const client = req.apiClient!;
    const scopes = req.callerScopes ?? client.scopes;
    const endpointName = req.params.endpoint as string;
    const path = (req.params[0] as string) || '';
    const notFound = (why: string): void => {
      logger.info({ clientId: client.id, endpoint: endpointName, method: req.method, why }, '[gateway] client call not served');
      res.status(404).json({ error: 'Not found' });
    };
    try {
      const core = await import('@whoobe-cms/core/server');
      // no scope for this endpoint at all: the same answer as an unknown endpoint, before any lookup
      if (!scopes.some((s) => s.startsWith(`gateway:call:${endpointName}:`))) { notFound('no scope for the endpoint'); return; }

      const bad = core.unsafePathReason(path);
      if (bad) { res.status(400).json({ error: bad }); return; }

      const endpoint = await core.getGatewayEndpointByName(endpointName);
      if (!endpoint || !endpoint.isActive) { notFound('unknown or inactive endpoint'); return; }
      const routes = await core.listGatewayRoutes(endpoint.id);
      let matched = core.matchRoute(routes, req.method, path);
      // two equally specific templates (`products/{id}`, `products/{name}`) reach the same upstream address: choose among those this client may call
      if (matched === 'ambiguous') {
        matched = core.matchRoute(routes.filter((r) => core.scopeAllows(scopes, endpoint.name, r.method, r.path)), req.method, path, 'first');
      }
      if (matched === 'none' || matched === 'ambiguous') { notFound(matched); return; }
      // the scope is checked against the route the path matched, never against the path itself
      if (!core.scopeAllows(scopes, endpoint.name, req.method, matched.route.path)) { notFound('outside the scopes'); return; }

      let body: unknown;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const declared = Number(req.headers['content-length'] ?? 0);
        if (declared > MAX_BODY_BYTES) { res.status(413).json({ error: 'Body too large' }); return; }
        const type = String(req.headers['content-type'] ?? '');
        if (declared > 0 && !type.includes('application/json')) { res.status(415).json({ error: 'Send JSON (Content-Type: application/json)' }); return; }
        body = declared > 0 ? req.body : undefined;
      }

      const query = queryOf(req);
      const result = await callRoute({
        req, res, endpoint,
        route: matched.route,
        upstreamUrl: resolveGatewayUrl(endpoint.baseUrl, matched.route.path, matched.params) + (query ? `?${query}` : ''),
        headers: passedHeaders(req),
        body,
        timeoutMs: Math.min(endpoint.requestTimeoutMs, 30_000),
      });

      logger.info({
        clientId: client.id, client: client.name, sub: req.subject, endpoint: endpoint.name, method: req.method, route: matched.route.path,
        status: result.status, ms: Date.now() - started,
      }, '[gateway] client call');

      if (result.status >= 500) { res.status(502).json({ error: 'The service answered with an error' }); return; }
      for (const [k, v] of Object.entries(pickSafeResponseHeaders(result.headers))) {
        if (k.toLowerCase() !== 'content-type' && k.toLowerCase() !== 'content-length') res.setHeader(k, v);
      }
      if (typeof result.body === 'string') res.status(result.status).type('text/plain').send(result.body);
      else res.status(result.status).json(result.body);
    } catch (err) {
      logGatewayError('client gateway call', err);
      res.status(502).json({ error: 'Upstream request failed' });
    }
  });

  return router;
}
