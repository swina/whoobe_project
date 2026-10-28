import { Router, type Request, type Response, type NextFunction } from 'express';
import { createFailureLock } from '@whoobe-cms/core/server';
import type { ApiClientRecord } from '@whoobe-cms/core/server';
import { limiter } from './limiter.js';
import { logger, logGatewayError } from './log-error.js';
import { withRequestId } from '@whoobe-cms/logger';
import { auditClientRefused } from './audit-failures.js';
import { callRoute } from './route-call.js';
import { passedHeaders, queryOf } from './remote-router.js';
import { resolveGatewayUrl } from './resolve-gateway-url.js';
import { pickSafeResponseHeaders } from './redact.js';
import { ipAllowed } from './client-ip.js';
import { createGatewayJwtVerifier, JwtRejected } from './jwt-verify.js';
import { decodeJwt } from 'jose';
import { extractOutcome } from './submit-outcome.js';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { GATEWAY_ASSET_PROCESSOR_URL } from './config.js';

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
    if (authFailures.isLocked(ip)) { auditClientRefused(req, 'locked_out', presentedCredential(req)?.kind ?? 'none'); refuse(res, 429, 'Too many failed attempts, try again later', { 'Retry-After': '60' }); return; }
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
          auditClientRefused(req, 'key sent by a browser', 'key', client);
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
      auditClientRefused(req, why, 'jwt');
      refuse(res, 403, 'This token does not give access');
      return;
    }
    if (!client) {
      authFailures.fail(ip);
      logger.info({ ip, reason: why, credential: cred?.kind ?? 'none' }, '[gateway] client credential refused');
      auditClientRefused(req, why, cred?.kind ?? 'none');
      refuse(res, 401, 'Invalid or missing credential', { 'WWW-Authenticate': 'Bearer' });
      return;
    }
    if (!ipAllowed(ip, client.allowedIps)) {
      logger.info({ ip, clientId: client.id }, '[gateway] client address not allowed');
      auditClientRefused(req, 'address not allowed', cred?.kind ?? 'none', client);
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

  // Published Data Objects of the classes named in the scopes (`data:read:<Class>`). Unknown class, no scope, draft and other class's id
  // all answer the same 404.
  const dataNotFound = (req: ClientRequest, res: Response, why: string): void => {
    logger.info({ clientId: req.apiClient!.id, method: req.method, path: req.path, why }, '[gateway] client data call not served');
    res.status(404).json({ error: 'Not found' });
  };
  const dataClass = async (req: ClientRequest, res: Response, action: 'read' | 'write' = 'read') => {
    const core = await import('@whoobe-cms/core/server');
    const className = String(req.params.className ?? '');
    if (!core.dataScopeAllows(req.callerScopes ?? [], action, className)) { dataNotFound(req, res, 'no scope for the class'); return null; }
    const cls = await core.getDataClassByName(className);
    if (!cls) { dataNotFound(req, res, 'unknown class'); return null; }
    return { core, cls };
  };

  // `?expand=assets`: next to each `{ assetId }` of an image / asset field, the file's facts and addresses, for the assets the scopes allow
  const publicAssetUrl = (core: typeof import('@whoobe-cms/core/server')) => (a: { pimcorePath: string }): string | null => core.damPathToProxyUrl(a.pimcorePath) || null;
  const expandRows = async <T extends { attributes: Record<string, unknown> }>(
    req: ClientRequest, rows: T[], fields: import('@whoobe-cms/core/server').ClassFieldDefinition[],
  ): Promise<T[]> => {
    if (req.query.expand !== 'assets') return rows;
    const scopes = req.callerScopes ?? [];
    if (!scopes.some((s) => s.startsWith('assets:'))) return rows;
    const core = await import('@whoobe-cms/core/server');
    const ids = [...new Set(rows.flatMap((o) => core.collectAssetRefs(o.attributes ?? {}, fields)))].slice(0, core.CLIENT_ASSET_MAX_EXPAND);
    const map = new Map(
      (await core.getAssetsByIds(ids)).map((a) => [a.id, core.projectClientAsset(a, publicAssetUrl(core))] as const),
    );
    return rows.map((o) => ({ ...o, attributes: core.expandAssetRefs(o.attributes ?? {}, fields, scopes, map) }));
  };

  router.get('/data/:className', async (req: ClientRequest, res: Response): Promise<void> => {
    try {
      const found = await dataClass(req, res);
      if (!found) return;
      const { core, cls } = found;
      const fields = (cls.fields ?? []) as import('@whoobe-cms/core/server').ClassFieldDefinition[];
      const q = core.parseClientDataQuery(req.query as Record<string, unknown>, fields);
      if ('error' in q) { res.status(400).json({ error: q.error }); return; }
      const rows = await core.queryPublishedDataObjects(cls.id, { filters: q.filters, orderBy: q.orderBy, offset: q.offset, limit: q.limit, locale: q.locale });
      logger.info({ clientId: req.apiClient!.id, client: req.apiClient!.name, sub: req.subject, class: cls.name, count: rows.length }, '[gateway] client data list');
      const objects = await expandRows(req, rows.map((o) => core.projectClientObject(o, fields) as { attributes: Record<string, unknown> }), fields);
      res.json({ class: cls.name, objects, limit: q.limit, offset: q.offset });
    } catch (err) {
      logGatewayError('client data list', err);
      res.status(500).json({ error: 'Failed to read objects' });
    }
  });

  router.get('/data/:className/:id', async (req: ClientRequest, res: Response): Promise<void> => {
    try {
      const found = await dataClass(req, res);
      if (!found) return;
      const { core, cls } = found;
      const id = String(req.params.id ?? '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) { dataNotFound(req, res, 'malformed id'); return; }
      const obj = await core.getPublishedDataObject(id);
      if (!obj || obj.classId !== cls.id) { dataNotFound(req, res, 'no published object of this class'); return; }
      logger.info({ clientId: req.apiClient!.id, client: req.apiClient!.name, sub: req.subject, class: cls.name, id }, '[gateway] client data get');
      const fields = (cls.fields ?? []) as import('@whoobe-cms/core/server').ClassFieldDefinition[];
      const [object] = await expandRows(req, [core.projectClientObject(obj, fields) as { attributes: Record<string, unknown> }], fields);
      res.json({ object });
    } catch (err) {
      logGatewayError('client data get', err);
      res.status(500).json({ error: 'Failed to read the object' });
    }
  });

  // Assets of the DAM folders named in the scopes (`assets:read:<folder>`). Unknown id, id outside the scopes and malformed id all
  // answer the same 404.
  const assetNotFound = (req: ClientRequest, res: Response, why: string): void => {
    logger.info({ clientId: req.apiClient!.id, method: req.method, path: req.path, why }, '[gateway] client asset call not served');
    res.status(404).json({ error: 'Not found' });
  };
  const hasAssetScope = (req: ClientRequest): boolean => (req.callerScopes ?? []).some((s) => s.startsWith('assets:'));

  router.get('/assets', async (req: ClientRequest, res: Response): Promise<void> => {
    try {
      if (!hasAssetScope(req)) { assetNotFound(req, res, 'no asset scope'); return; }
      const core = await import('@whoobe-cms/core/server');
      const scopes = req.callerScopes ?? [];
      const folderParam = typeof req.query.folder === 'string' ? req.query.folder : '';
      const folder = folderParam ? '/' + folderParam.split('/').filter(Boolean).join('/') : null;
      // without `folder` the whole library is listed, which only a `*` scope allows
      if (!core.assetScopeAllows(scopes, 'read', folder ?? '/')) { assetNotFound(req, res, 'folder outside the scopes'); return; }
      const num = (v: unknown, def: number, max: number): number => {
        const n = Number(v);
        return v === undefined || v === '' || !Number.isInteger(n) || n < 0 ? def : Math.min(n, max);
      };
      const limit = Math.max(1, num(req.query.limit, 50, 100));
      const offset = num(req.query.offset, 0, 100000);
      const rows = await core.listAssetsPage(folder, limit, offset);
      const assets = rows.filter((a) => core.assetScopeAllows(scopes, 'read', a.folderPath)).map((a) => core.projectClientAsset(a, publicAssetUrl(core)));
      logger.info({ clientId: req.apiClient!.id, client: req.apiClient!.name, sub: req.subject, folder, count: assets.length }, '[gateway] client asset list');
      res.json({ folder: folder ?? '*', assets, limit, offset });
    } catch (err) {
      logGatewayError('client asset list', err);
      res.status(500).json({ error: 'Failed to list assets' });
    }
  });

  const loadAsset = async (req: ClientRequest, res: Response) => {
    if (!hasAssetScope(req)) { assetNotFound(req, res, 'no asset scope'); return null; }
    const id = String(req.params.id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) { assetNotFound(req, res, 'malformed id'); return null; }
    const core = await import('@whoobe-cms/core/server');
    const asset = await core.getAssetById(id);
    if (!asset || !core.assetScopeAllows(req.callerScopes ?? [], 'read', asset.folderPath)) { assetNotFound(req, res, 'unknown asset or outside the scopes'); return null; }
    return { core, asset };
  };

  router.get('/assets/:id', async (req: ClientRequest, res: Response): Promise<void> => {
    try {
      const found = await loadAsset(req, res);
      if (!found) return;
      logger.info({ clientId: req.apiClient!.id, client: req.apiClient!.name, sub: req.subject, id: found.asset.id }, '[gateway] client asset get');
      res.json({ asset: found.core.projectClientAsset(found.asset, publicAssetUrl(found.core)) });
    } catch (err) {
      logGatewayError('client asset get', err);
      res.status(500).json({ error: 'Failed to read the asset' });
    }
  });

  // The file itself, streamed from the asset processor with the service token: works for private assets and for workspaces whose
  // storage cannot be reached from the application. `Range` is passed on (video, resumed downloads).
  router.get('/assets/:id/content', async (req: ClientRequest, res: Response): Promise<void> => {
    const abort = new AbortController();
    res.on('close', () => abort.abort());
    try {
      const found = await loadAsset(req, res);
      if (!found) return;
      const key = found.asset.s3Key.split('/').map(encodeURIComponent).join('/');
      const token = process.env.DAM_SERVICE_TOKEN;
      const upstream = await fetch(`${GATEWAY_ASSET_PROCESSOR_URL}/dam-asset/${key}`, {
        headers: withRequestId({ ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(typeof req.headers.range === 'string' ? { Range: req.headers.range } : {}) }),
        signal: abort.signal,
      });
      if (upstream.status === 416) { res.status(416).end(); return; }
      if (!upstream.ok && upstream.status !== 206 || !upstream.body) { assetNotFound(req, res, `asset processor answered ${upstream.status}`); return; }
      for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'content-disposition']) {
        const v = upstream.headers.get(h);
        if (v) res.setHeader(h, v);
      }
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, max-age=60');
      res.status(upstream.status);
      logger.info({ clientId: req.apiClient!.id, client: req.apiClient!.name, sub: req.subject, id: found.asset.id, status: upstream.status }, '[gateway] client asset content');
      const body = Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream);
      body.on('error', () => { if (!res.headersSent) res.status(502).end(); else res.destroy(); });
      body.pipe(res);
    } catch (err) {
      if (abort.signal.aborted) return;
      logGatewayError('client asset content', err);
      if (!res.headersSent) res.status(502).json({ error: 'The file could not be read' });
    }
  });

  // Writing (scope `data:write:<Class>`): a client creates DRAFTS and changes DRAFTS; nothing here publishes, and a published object is
  // not changed (409). Unknown class, no scope and an id of another class answer the same 404 as for reading.
  const readJsonBody = (req: ClientRequest, res: Response): unknown | undefined => {
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared > MAX_BODY_BYTES) { res.status(413).json({ error: 'Body too large' }); return undefined; }
    if (!String(req.headers['content-type'] ?? '').includes('application/json')) { res.status(415).json({ error: 'Send JSON (Content-Type: application/json)' }); return undefined; }
    return req.body ?? {};
  };
  // every file the written values link must be one this client may read; unknown and not allowed answer alike
  const assetsAllowed = async (core: typeof import('@whoobe-cms/core/server'), req: ClientRequest, attributes: Record<string, unknown>): Promise<boolean> => {
    const ids = [...core.writtenAssetIds(attributes)];
    if (!ids.length) return true;
    if (ids.length > core.CLIENT_ASSET_MAX_EXPAND) return false;
    const found = await core.getAssetsByIds(ids);
    return found.length === ids.length && found.every((a) => core.assetScopeAllows(req.callerScopes ?? [], 'read', a.folderPath));
  };

  router.post('/data/:className', async (req: ClientRequest, res: Response): Promise<void> => {
    try {
      const found = await dataClass(req, res, 'write');
      if (!found) return;
      const { core, cls } = found;
      const body = readJsonBody(req, res);
      if (body === undefined) return;
      const fields = (cls.fields ?? []) as import('@whoobe-cms/core/server').ClassFieldDefinition[];
      const checked = core.validateClientWrite('create', cls.name, fields, body);
      if (!checked.ok) { res.status(400).json({ error: checked.error }); return; }
      if (!(await assetsAllowed(core, req, checked.write.attributes))) { res.status(400).json({ error: 'A linked asset does not exist or is not available to this client' }); return; }
      const obj = await core.createDataObject({
        classId: cls.id, key: checked.write.key ?? `api-${randomUUID()}`, locale: checked.write.locale, attributes: checked.write.attributes,
      }, { actor: { type: 'api-client', id: req.apiClient!.id }, endOfFlow: core.isEndOfFlow(req.headers[core.END_OF_FLOW_HEADER]) });
      logger.info({ clientId: req.apiClient!.id, client: req.apiClient!.name, sub: req.subject, class: cls.name, id: obj.id }, '[gateway] client data created (draft)');
      res.status(201).json({ draft: true, object: core.projectClientObject(obj, fields) });
    } catch (err: any) {
      if ((err?.code ?? err?.cause?.code) === '23505') { res.status(409).json({ error: 'An object with this key already exists for this class and language' }); return; }
      if (err?.code === 'UNIQUE_VIOLATION') { res.status(409).json({ error: err.message, field: err.field }); return; }
      logGatewayError('client data create', err);
      res.status(500).json({ error: 'Failed to create the object' });
    }
  });

  router.patch('/data/:className/:id', async (req: ClientRequest, res: Response): Promise<void> => {
    try {
      const found = await dataClass(req, res, 'write');
      if (!found) return;
      const { core, cls } = found;
      const id = String(req.params.id ?? '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) { dataNotFound(req, res, 'malformed id'); return; }
      const obj = await core.getDataObject(id);
      if (!obj || obj.classId !== cls.id) { dataNotFound(req, res, 'no object of this class'); return; }
      if (obj.published) { res.status(409).json({ error: 'A published object cannot be changed through the API' }); return; }
      const body = readJsonBody(req, res);
      if (body === undefined) return;
      const fields = (cls.fields ?? []) as import('@whoobe-cms/core/server').ClassFieldDefinition[];
      const checked = core.validateClientWrite('update', cls.name, fields, body);
      if (!checked.ok) { res.status(400).json({ error: checked.error }); return; }
      if (!(await assetsAllowed(core, req, checked.write.attributes))) { res.status(400).json({ error: 'A linked asset does not exist or is not available to this client' }); return; }
      // `If-Match: <updatedAt>` (as returned by the object): refuse when someone changed the draft in the meantime
      const ifMatch = req.headers['if-match'];
      if (typeof ifMatch === 'string' && ifMatch.replace(/^W\/|"/g, '') !== new Date(obj.updatedAt).toISOString()) {
        res.status(412).json({ error: 'The object was changed since you read it' });
        return;
      }
      const updated = await core.updateDataObject(id, { attributes: { ...(obj.attributes ?? {}), ...checked.write.attributes } }, { actor: { type: 'api-client', id: req.apiClient!.id }, endOfFlow: core.isEndOfFlow(req.headers[core.END_OF_FLOW_HEADER]) });
      if (!updated) { dataNotFound(req, res, 'vanished'); return; }
      logger.info({ clientId: req.apiClient!.id, client: req.apiClient!.name, sub: req.subject, class: cls.name, id, fields: Object.keys(checked.write.attributes) }, '[gateway] client data updated (draft)');
      res.json({ draft: true, object: core.projectClientObject(updated, fields) });
    } catch (err: any) {
      if (err?.code === 'UNIQUE_VIOLATION') { res.status(409).json({ error: err.message, field: err.field }); return; }
      logGatewayError('client data update', err);
      res.status(500).json({ error: 'Failed to update the object' });
    }
  });

  // Start the flow behind a POST route of an engine endpoint (scope `automation:run:<endpoint>:<route>`) and wait for its answer:
  // { ok, outcome, response }. `outcome` is the validated key (see submit-outcome.ts), the only part of the reply meant to be acted on.
  router.post('/automations/:endpoint/*', async (req: ClientRequest, res: Response): Promise<void> => {
    const started = Date.now();
    const client = req.apiClient!;
    const scopes = req.callerScopes ?? client.scopes;
    const endpointName = req.params.endpoint as string;
    const path = (req.params[0] as string) || '';
    const notFound = (why: string): void => {
      logger.info({ clientId: client.id, endpoint: endpointName, why }, '[gateway] client automation call not served');
      res.status(404).json({ error: 'Not found' });
    };
    try {
      const core = await import('@whoobe-cms/core/server');
      if (!scopes.some((s) => s.startsWith(`automation:run:${endpointName}:`))) { notFound('no scope for the endpoint'); return; }
      const bad = core.unsafePathReason(path);
      if (bad) { res.status(400).json({ error: bad }); return; }
      const endpoint = await core.getGatewayEndpointByName(endpointName);
      if (!endpoint || !endpoint.isActive) { notFound('unknown or inactive endpoint'); return; }
      const routes = await core.listGatewayRoutes(endpoint.id);
      let matched = core.matchRoute(routes, 'POST', path);
      if (matched === 'ambiguous') matched = core.matchRoute(routes.filter((r) => core.automationScopeAllows(scopes, endpoint.name, r.path)), 'POST', path, 'first');
      if (matched === 'none' || matched === 'ambiguous') { notFound(matched); return; }
      if (!core.automationScopeAllows(scopes, endpoint.name, matched.route.path)) { notFound('outside the scopes'); return; }

      const declared = Number(req.headers['content-length'] ?? 0);
      if (declared > MAX_BODY_BYTES) { res.status(413).json({ error: 'Body too large' }); return; }
      if (declared > 0 && !String(req.headers['content-type'] ?? '').includes('application/json')) { res.status(415).json({ error: 'Send JSON (Content-Type: application/json)' }); return; }

      const query = queryOf(req);
      const result = await callRoute({
        req, res, endpoint,
        route: matched.route,
        upstreamUrl: resolveGatewayUrl(endpoint.baseUrl, matched.route.path, matched.params) + (query ? `?${query}` : ''),
        headers: passedHeaders(req),
        body: declared > 0 ? req.body : undefined,
        timeoutMs: Math.min(endpoint.requestTimeoutMs, 30_000),
      });
      const outcome = extractOutcome(result.body);
      logger.info({
        clientId: client.id, client: client.name, sub: req.subject, endpoint: endpoint.name, route: matched.route.path, status: result.status,
        outcome: outcome ?? undefined, ms: Date.now() - started,
      }, '[gateway] client automation run');
      if (result.status >= 500) { res.status(502).json({ ok: false, error: 'The automation answered with an error' }); return; }
      res.status(result.status).json({ ok: result.status < 400, ...(outcome ? { outcome } : {}), response: result.body });
    } catch (err) {
      logGatewayError('client automation run', err);
      res.status(502).json({ ok: false, error: 'The automation could not be reached' });
    }
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

  // anything else under /client/v1: the same JSON answer as a call outside the scopes
  router.use((_req: Request, res: Response): void => { res.status(404).json({ error: 'Not found' }); });

  return router;
}
