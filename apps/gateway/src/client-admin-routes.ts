import { Router, type Request, type Response } from 'express';
import { isIP } from 'node:net';
import { PERMISSIONS, requirePermission } from './auth.js';
import { audited, AUDIT } from './audit-specs.js';
import { logGatewayError } from './log-error.js';

// Management of API clients from the dashboard (docs/plans/api-gateway/client-access-hub.md). Needs `gateway:manage`.
// A key is returned once, when it is created; nothing returns it again and no response carries a hash.

const IP_ENTRY = /^\d{1,3}(\.\d{1,3}){3}\/(\d|[12]\d|3[0-2])$/;

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function ipList(v: unknown): Parsed<string[] | null> {
  if (v == null || (Array.isArray(v) && v.length === 0)) return { ok: true, value: null };
  if (!Array.isArray(v) || v.length > 50) return { ok: false, error: 'allowedIps must be a list of at most 50 addresses' };
  for (const e of v) {
    if (typeof e !== 'string' || !(isIP(e) || (IP_ENTRY.test(e) && e.split('/')[0].split('.').every((o) => Number(o) <= 255)))) {
      return { ok: false, error: `Not an IP address or IPv4 range: ${String(e).slice(0, 60)}` };
    }
  }
  return { ok: true, value: v as string[] };
}

function dateOrNull(v: unknown): Parsed<Date | null> {
  if (v == null || v === '') return { ok: true, value: null };
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? { ok: false, error: 'Invalid date' } : { ok: true, value: d };
}

function intIn(v: unknown, min: number, max: number, what: string): Parsed<number> {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? { ok: true, value: n } : { ok: false, error: `${what} must be a whole number from ${min} to ${max}` };
}

export function createClientAdminRoutes(): Router {
  const router = Router();
  const gate = requirePermission(PERMISSIONS.GATEWAY_MANAGE);

  const fail = (res: Response, err: unknown, what: string): void => {
    const e = err as { code?: string; cause?: { code?: string } };
    if (e?.code === '23505' || e?.cause?.code === '23505') { res.status(409).json({ error: 'A client with this name already exists' }); return; }
    logGatewayError(what, err);
    res.status(500).json({ error: 'Request failed' });
  };

  router.get('/', gate, async (_req: Request, res: Response): Promise<void> => {
    try {
      const core = await import('@whoobe-cms/core/server');
      const clients = await core.listApiClients();
      res.json({ clients: await Promise.all(clients.map(async (c) => ({ ...c, keys: await core.listApiClientKeys(c.id) }))) });
    } catch (err) { fail(res, err, 'list api clients'); }
  });

  router.post('/', gate, audited(AUDIT.clientCreate), async (req: Request & { user?: { id?: string } }, res: Response): Promise<void> => {
    try {
      const core = await import('@whoobe-cms/core/server');
      const b = (req.body ?? {}) as Record<string, unknown>;
      const name = typeof b.name === 'string' ? b.name.trim() : '';
      if (!name || name.length > 80) { res.status(400).json({ error: 'name is required (80 characters at most)' }); return; }
      // one way in per client: a key held by a server, or a token of the organisation's identity provider
      const authMode = b.authMode === 'jwt' ? 'jwt' : b.authMode === undefined || b.authMode === 'key' ? 'key' : null;
      if (!authMode) { res.status(400).json({ error: 'authMode must be "key" or "jwt"' }); return; }
      const scopes = core.validateClientScopes(b.scopes ?? []);
      if (!scopes.ok) { res.status(400).json({ error: scopes.error }); return; }
      let jwtConfig: Record<string, unknown> | null = null;
      if (authMode === 'jwt') {
        const v = core.validateJwtConfig(b.jwt, scopes.scopes, { allowInsecureHttp: process.env.NODE_ENV !== 'production' });
        if (!v.ok) { res.status(400).json({ error: v.error }); return; }
        jwtConfig = v.config as unknown as Record<string, unknown>;
      }
      const rps = intIn(b.rateLimitRps ?? 10, 1, 1000, 'rateLimitRps');
      if (!rps.ok) { res.status(400).json({ error: rps.error }); return; }
      const quota = b.dailyQuota == null || b.dailyQuota === '' ? { ok: true as const, value: null } : intIn(b.dailyQuota, 1, 1_000_000_000, 'dailyQuota');
      if (!quota.ok) { res.status(400).json({ error: quota.error }); return; }
      const ips = ipList(b.allowedIps);
      if (!ips.ok) { res.status(400).json({ error: ips.error }); return; }
      const exp = dateOrNull(b.expiresAt);
      if (!exp.ok) { res.status(400).json({ error: exp.error }); return; }

      const client = await core.createApiClient({
        name, description: typeof b.description === 'string' ? b.description.slice(0, 500) : '', authMode, jwtConfig, scopes: scopes.scopes,
        rateLimitRps: rps.value, dailyQuota: quota.value, allowedIps: ips.value, expiresAt: exp.value, createdBy: req.user?.id ?? null,
      });
      // a token client has no secret of its own: nothing to hand out
      if (authMode === 'jwt') { res.status(201).json({ client }); return; }
      const { plaintext, key } = await core.addApiClientKey(client.id, { label: 'first key' });
      res.status(201).json({ client, key, plaintext });
    } catch (err) { fail(res, err, 'create api client'); }
  });

  router.get('/:id', gate, async (req: Request, res: Response): Promise<void> => {
    try {
      const core = await import('@whoobe-cms/core/server');
      const client = await core.getApiClient(req.params.id);
      if (!client) { res.status(404).json({ error: 'Client not found' }); return; }
      res.json({ client, keys: await core.listApiClientKeys(client.id) });
    } catch (err) { fail(res, err, 'get api client'); }
  });

  router.patch('/:id', gate, audited(AUDIT.clientUpdate), async (req: Request, res: Response): Promise<void> => {
    try {
      const core = await import('@whoobe-cms/core/server');
      const current = await core.getApiClient(req.params.id);
      if (!current) { res.status(404).json({ error: 'Client not found' }); return; }
      const b = (req.body ?? {}) as Record<string, unknown>;
      const patch: Parameters<typeof core.updateApiClient>[1] = {};
      if (b.name !== undefined) {
        const name = typeof b.name === 'string' ? b.name.trim() : '';
        if (!name || name.length > 80) { res.status(400).json({ error: 'name must be 1 to 80 characters' }); return; }
        patch.name = name;
      }
      if (b.description !== undefined) patch.description = typeof b.description === 'string' ? b.description.slice(0, 500) : '';
      if (b.status !== undefined) {
        if (b.status !== 'active' && b.status !== 'suspended') { res.status(400).json({ error: 'status must be active or suspended' }); return; }
        patch.status = b.status;
      }
      if (b.authMode !== undefined && b.authMode !== current.authMode) { res.status(400).json({ error: 'The way a client authenticates cannot be changed: create a new client' }); return; }
      let resultingScopes = current.scopes;
      if (b.scopes !== undefined) {
        const scopes = core.validateClientScopes(b.scopes);
        if (!scopes.ok) { res.status(400).json({ error: scopes.error }); return; }
        patch.scopes = scopes.scopes;
        resultingScopes = scopes.scopes;
      }
      // the claim rules of a token client may only grant scopes the client has: checked again whenever either side changes
      if (current.authMode === 'jwt' && (b.jwt !== undefined || b.scopes !== undefined)) {
        const v = core.validateJwtConfig(b.jwt ?? current.jwtConfig, resultingScopes, { allowInsecureHttp: process.env.NODE_ENV !== 'production' });
        if (!v.ok) { res.status(400).json({ error: v.error }); return; }
        patch.jwtConfig = v.config as unknown as Record<string, unknown>;
      } else if (b.jwt !== undefined) { res.status(400).json({ error: 'jwt settings belong to a client that uses identity-provider tokens' }); return; }
      if (b.rateLimitRps !== undefined) { const r = intIn(b.rateLimitRps, 1, 1000, 'rateLimitRps'); if (!r.ok) { res.status(400).json({ error: r.error }); return; } patch.rateLimitRps = r.value; }
      if (b.dailyQuota !== undefined) {
        if (b.dailyQuota === null || b.dailyQuota === '') patch.dailyQuota = null;
        else { const r = intIn(b.dailyQuota, 1, 1_000_000_000, 'dailyQuota'); if (!r.ok) { res.status(400).json({ error: r.error }); return; } patch.dailyQuota = r.value; }
      }
      if (b.allowedIps !== undefined) { const r = ipList(b.allowedIps); if (!r.ok) { res.status(400).json({ error: r.error }); return; } patch.allowedIps = r.value; }
      if (b.expiresAt !== undefined) { const r = dateOrNull(b.expiresAt); if (!r.ok) { res.status(400).json({ error: r.error }); return; } patch.expiresAt = r.value; }
      const updated = await core.updateApiClient(current.id, patch);
      res.json({ client: updated, keys: await core.listApiClientKeys(current.id) });
    } catch (err) { fail(res, err, 'update api client'); }
  });

  router.delete('/:id', gate, audited(AUDIT.clientDelete), async (req: Request, res: Response): Promise<void> => {
    try {
      const core = await import('@whoobe-cms/core/server');
      if (!(await core.deleteApiClient(req.params.id))) { res.status(404).json({ error: 'Client not found' }); return; }
      res.json({ success: true });
    } catch (err) { fail(res, err, 'delete api client'); }
  });

  // Rotation: add a key, move the application to it, then revoke the old one.
  router.post('/:id/keys', gate, audited(AUDIT.clientKeyAdd), async (req: Request, res: Response): Promise<void> => {
    try {
      const core = await import('@whoobe-cms/core/server');
      const owner = await core.getApiClient(req.params.id);
      if (!owner) { res.status(404).json({ error: 'Client not found' }); return; }
      if (owner.authMode !== 'key') { res.status(400).json({ error: 'A client that uses identity-provider tokens has no keys' }); return; }
      const b = (req.body ?? {}) as Record<string, unknown>;
      const exp = dateOrNull(b.expiresAt);
      if (!exp.ok) { res.status(400).json({ error: exp.error }); return; }
      const out = await core.addApiClientKey(req.params.id, { label: typeof b.label === 'string' ? b.label.slice(0, 80) : '', expiresAt: exp.value });
      res.status(201).json(out);
    } catch (err) { fail(res, err, 'add api client key'); }
  });

  router.delete('/:id/keys/:keyId', gate, audited(AUDIT.clientKeyRevoke), async (req: Request, res: Response): Promise<void> => {
    try {
      const core = await import('@whoobe-cms/core/server');
      if (!(await core.revokeApiClientKey(req.params.id, req.params.keyId))) { res.status(404).json({ error: 'Key not found or already revoked' }); return; }
      res.json({ success: true });
    } catch (err) { fail(res, err, 'revoke api client key'); }
  });

  return router;
}
