import { Router, type Request, type Response } from 'express';
import { requirePermission, PERMISSIONS } from './auth.js';
import type { GatewayPlugin } from './plugin-types.js';
import type { GatewayPreset } from './preset-types.js';
import { logGatewayError } from './log-error.js';
import { redactSensitiveValues, pickSafeResponseHeaders } from './redact.js';
import { buildAuthHeaders } from './gateway-auth-headers.js';

/** Strips `authConfig` (raw API keys / bearer tokens / basic-auth
 *  credentials) before an endpoint record is ever sent to a client - these
 *  routes are consumed by the admin-dashboard's Gateway Endpoints page,
 *  which fetches the full endpoint list just to render it, not only when
 *  editing credentials. Auth is applied server-side (resolve-handler.ts,
 *  remote-router.ts, and the test/execute/refresh-schema routes below all
 *  read authConfig directly from the DB) so the client never needs it. */
function redactEndpoint<T extends { authConfig?: unknown }>(endpoint: T): Omit<T, 'authConfig'> {
  const { authConfig, ...safe } = endpoint;
  return safe;
}

export function createAdminRoutes(plugins: GatewayPlugin[], presets: GatewayPreset[] = []): Router {
  const router = Router();

  router.get('/endpoints', requirePermission(PERMISSIONS.GATEWAY_MANAGE), async (_req: Request, res: Response): Promise<void> => {
    try {
      const { listGatewayEndpoints } = await import('@whoobe-cms/core/server');
      const endpoints = await listGatewayEndpoints();
      res.json(endpoints.map(redactEndpoint));
    } catch (err) {
      logGatewayError('list gateway endpoints', err);
      res.status(500).json({ error: 'Failed to list endpoints' });
    }
  });

  router.post('/endpoints', requirePermission(PERMISSIONS.GATEWAY_MANAGE), async (req: Request, res: Response): Promise<void> => {
    try {
      const { createGatewayEndpoint } = await import('@whoobe-cms/core/server');
      const endpoint = await createGatewayEndpoint(req.body);
      res.status(201).json(redactEndpoint(endpoint));
    } catch (err) {
      logGatewayError('create gateway endpoint', err);
      res.status(400).json({ error: 'Failed to create endpoint' });
    }
  });

  router.get('/endpoints/:id', requirePermission(PERMISSIONS.GATEWAY_MANAGE), async (req: Request, res: Response): Promise<void> => {
    try {
      const { getGatewayEndpoint } = await import('@whoobe-cms/core/server');
      const endpoint = await getGatewayEndpoint(req.params.id);
      if (!endpoint) { res.status(404).json({ error: 'Not found' }); return; }
      res.json(redactEndpoint(endpoint));
    } catch (err) {
      logGatewayError('get gateway endpoint', err);
      res.status(500).json({ error: 'Failed to load endpoint' });
    }
  });

  router.patch('/endpoints/:id', requirePermission(PERMISSIONS.GATEWAY_MANAGE), async (req: Request, res: Response): Promise<void> => {
    try {
      const { getGatewayEndpoint, updateGatewayEndpoint } = await import('@whoobe-cms/core/server');

      const input = { ...req.body };
      // authConfig never round-trips back to the client (see redactEndpoint),
      // so the edit form only ever sends fields the user actually retyped.
      // A blank/missing field means "keep the stored value" - merge onto the
      // existing config instead of overwriting it wholesale.
      if (input.authConfig && typeof input.authConfig === 'object') {
        const existing = await getGatewayEndpoint(req.params.id);
        const merged: Record<string, unknown> = { ...(existing?.authConfig as Record<string, unknown> | undefined || {}) };
        for (const [key, value] of Object.entries(input.authConfig as Record<string, unknown>)) {
          if (value === '' || value === undefined || value === null) continue;
          merged[key] = value;
        }
        input.authConfig = merged;
      }

      const endpoint = await updateGatewayEndpoint(req.params.id, input);
      if (!endpoint) { res.status(404).json({ error: 'Not found' }); return; }
      res.json(redactEndpoint(endpoint));
    } catch (err) {
      logGatewayError('update gateway endpoint', err);
      res.status(400).json({ error: 'Failed to update endpoint' });
    }
  });

  router.delete('/endpoints/:id', requirePermission(PERMISSIONS.GATEWAY_MANAGE), async (req: Request, res: Response): Promise<void> => {
    try {
      const { deleteGatewayEndpoint } = await import('@whoobe-cms/core/server');
      await deleteGatewayEndpoint(req.params.id);
      res.status(204).end();
    } catch (err) {
      logGatewayError('delete gateway endpoint', err);
      res.status(500).json({ error: 'Failed to delete endpoint' });
    }
  });

  router.get('/endpoints/:id/routes', requirePermission(PERMISSIONS.GATEWAY_MANAGE), async (req: Request, res: Response): Promise<void> => {
    try {
      const { listGatewayRoutes } = await import('@whoobe-cms/core/server');
      const routes = await listGatewayRoutes(req.params.id);
      res.json(routes);
    } catch (err) {
      logGatewayError('list gateway routes', err);
      res.status(500).json({ error: 'Failed to list routes' });
    }
  });

  router.post('/endpoints/:id/routes', requirePermission(PERMISSIONS.GATEWAY_MANAGE), async (req: Request, res: Response): Promise<void> => {
    try {
      const { createGatewayRoute } = await import('@whoobe-cms/core/server');
      const route = await createGatewayRoute({ ...req.body, endpointId: req.params.id });
      res.status(201).json(route);
    } catch (err) {
      logGatewayError('create gateway route', err);
      res.status(400).json({ error: 'Failed to create route' });
    }
  });

  router.patch('/routes/:id', requirePermission(PERMISSIONS.GATEWAY_MANAGE), async (req: Request, res: Response): Promise<void> => {
    try {
      const { updateGatewayRoute } = await import('@whoobe-cms/core/server');
      const route = await updateGatewayRoute(req.params.id, req.body);
      if (!route) { res.status(404).json({ error: 'Not found' }); return; }
      res.json(route);
    } catch (err) {
      logGatewayError('update gateway route', err);
      res.status(400).json({ error: 'Failed to update route' });
    }
  });

  router.delete('/routes/:id', requirePermission(PERMISSIONS.GATEWAY_MANAGE), async (req: Request, res: Response): Promise<void> => {
    try {
      const { deleteGatewayRoute } = await import('@whoobe-cms/core/server');
      await deleteGatewayRoute(req.params.id);
      res.status(204).end();
    } catch (err) {
      logGatewayError('delete gateway route', err);
      res.status(500).json({ error: 'Failed to delete route' });
    }
  });

  router.post('/routes/:id/test', requirePermission(PERMISSIONS.GATEWAY_MANAGE), async (req: Request, res: Response): Promise<void> => {
    try {
      const { getGatewayRoute, getGatewayEndpoint, updateGatewayRoute } = await import('@whoobe-cms/core/server');
      const { inferSchema } = await import('./schema-inferrer.js');
      const { proxyFetch } = await import('./proxy-engine.js');

      const route = await getGatewayRoute(req.params.id);
      if (!route) { res.status(404).json({ error: 'Route not found' }); return; }

      const endpoint = await getGatewayEndpoint(route.endpointId);
      if (!endpoint) { res.status(404).json({ error: 'Endpoint not found' }); return; }

      const upstreamUrl = `${endpoint.baseUrl.replace(/\/$/, '')}/${route.path.replace(/^\//, '')}`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      Object.assign(headers, await buildAuthHeaders(endpoint));

      const result = await proxyFetch(upstreamUrl, route.method, headers, undefined, 15000);

      // An error response (bad/expired auth, 4xx/5xx from the upstream) has
      // a completely different shape from what a real success response
      // looks like - inferring and persisting a schema from it would
      // silently corrupt the route's schema (and every field-picker/data-
      // binding UI built on top of it) with e.g. {status,message,
      // correlationId,...} instead of the actual resource shape. Report the
      // failure and leave whatever schema is already stored untouched.
      if (result.status < 200 || result.status >= 300) {
        res.json({ status: result.status, error: true, body: result.body });
        return;
      }

      const schema = inferSchema(result.body) as unknown as Record<string, unknown>;
      // The sample is persisted (for the schema/field-picker UI to re-fetch
      // later) and shown in this response - scrub anything shaped like a
      // credential before either happens.
      const sanitizedSample = redactSensitiveValues(result.body);

      const { upsertGatewaySchema } = await import('@whoobe-cms/core/server');
      const schemaRecord = await upsertGatewaySchema(route.id, schema, sanitizedSample);
      await updateGatewayRoute(route.id, { responseSchemaId: schemaRecord.id });

      res.json({ status: result.status, schema, sample: sanitizedSample });
    } catch (err) {
      logGatewayError('test gateway route', err);
      res.status(502).json({ error: 'Proxy test failed' });
    }
  });

  router.post('/routes/:id/execute', requirePermission(PERMISSIONS.GATEWAY_MANAGE), async (req: Request, res: Response): Promise<void> => {
    try {
      const { getGatewayRoute, getGatewayEndpoint } = await import('@whoobe-cms/core/server');
      const { proxyFetch } = await import('./proxy-engine.js');

      const route = await getGatewayRoute(req.params.id);
      if (!route) { res.status(200).json({ error: true, upstreamStatus: 0, body: 'Route not found' }); return; }

      const endpoint = await getGatewayEndpoint(route.endpointId);
      if (!endpoint) { res.status(200).json({ error: true, upstreamStatus: 0, body: 'Endpoint not found' }); return; }

      let resolvedPath = route.path;
      const body = req.body as { requestBody?: unknown; params?: Record<string, string> };
      const params = body?.params;
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          resolvedPath = resolvedPath.replace(`{${key}}`, encodeURIComponent(value));
        }
      }

      const upstreamUrl = `${endpoint.baseUrl.replace(/\/$/, '')}/${resolvedPath.replace(/^\//, '')}`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      Object.assign(headers, await buildAuthHeaders(endpoint));

      const requestBody = body?.requestBody;
      const result = await proxyFetch(upstreamUrl, route.method, headers, requestBody, 15000);

      // Only relay a safe allow-list of response headers - the upstream API
      // is untrusted from the browser's point of view, and a raw pass-through
      // could hand it a Set-Cookie, trace/rate-limit token, or (on a
      // misconfigured upstream) an echoed Authorization header.
      const responseHeaders = pickSafeResponseHeaders(result.headers || {});

      res.json({ error: false, upstreamStatus: result.status, headers: responseHeaders, body: result.body });
    } catch (err) {
      logGatewayError('execute gateway route', err);
      res.json({ error: true, upstreamStatus: 0, headers: {}, body: 'Request to the upstream endpoint failed.' });
    }
  });

  router.get('/routes/:id/schema', requirePermission(PERMISSIONS.GATEWAY_MANAGE), async (req: Request, res: Response): Promise<void> => {
    try {
      const { getGatewaySchema } = await import('@whoobe-cms/core/server');
      const schema = await getGatewaySchema(req.params.id);
      if (!schema) { res.status(404).json({ error: 'Schema not found. Test the route first.' }); return; }
      res.json(schema);
    } catch (err) {
      logGatewayError('get gateway route schema', err);
      res.status(500).json({ error: 'Failed to load schema' });
    }
  });

  router.post('/routes/:id/refresh-schema', requirePermission(PERMISSIONS.GATEWAY_MANAGE), async (req: Request, res: Response): Promise<void> => {
    try {
      const { getGatewayRoute, getGatewayEndpoint, updateGatewayRoute } = await import('@whoobe-cms/core/server');
      const { inferSchema } = await import('./schema-inferrer.js');
      const { proxyFetch } = await import('./proxy-engine.js');

      const route = await getGatewayRoute(req.params.id);
      if (!route) { res.status(404).json({ error: 'Route not found' }); return; }

      const endpoint = await getGatewayEndpoint(route.endpointId);
      if (!endpoint) { res.status(404).json({ error: 'Endpoint not found' }); return; }

      const upstreamUrl = `${endpoint.baseUrl.replace(/\/$/, '')}/${route.path.replace(/^\//, '')}`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      Object.assign(headers, await buildAuthHeaders(endpoint));

      const result = await proxyFetch(upstreamUrl, route.method, headers, undefined, 15000);

      // Same guard as /test above - never let an error response's shape
      // overwrite a route's real, previously-inferred schema.
      if (result.status < 200 || result.status >= 300) {
        res.json({ status: result.status, error: true, body: result.body });
        return;
      }

      const schema = inferSchema(result.body) as unknown as Record<string, unknown>;
      const sanitizedSample = redactSensitiveValues(result.body);

      const { upsertGatewaySchema } = await import('@whoobe-cms/core/server');
      const schemaRecord = await upsertGatewaySchema(route.id, schema, sanitizedSample);
      await updateGatewayRoute(route.id, { responseSchemaId: schemaRecord.id });

      res.json({ status: result.status, schema });
    } catch (err) {
      logGatewayError('refresh gateway route schema', err);
      res.status(502).json({ error: 'Schema refresh failed' });
    }
  });

  router.post('/endpoints/:id/import-openapi', requirePermission(PERMISSIONS.GATEWAY_MANAGE), async (req: Request, res: Response): Promise<void> => {
    try {
      const { getGatewayEndpoint } = await import('@whoobe-cms/core/server');
      const endpoint = await getGatewayEndpoint(req.params.id);
      if (!endpoint) { res.status(404).json({ error: 'Endpoint not found' }); return; }

      const { specUrl, specRaw } = req.body as { specUrl?: string; specRaw?: string };
      if ((!specUrl && !specRaw) || (specUrl && specRaw)) {
        res.status(400).json({ error: 'Provide exactly one of specUrl or specRaw' });
        return;
      }

      const { parseOpenApiSpec, importOpenApiToEndpoint } = await import('./openapi-importer.js');
      const doc = await parseOpenApiSpec({ url: specUrl, raw: specRaw });
      const result = await importOpenApiToEndpoint(req.params.id, doc);
      res.json(result);
    } catch (err) {
      logGatewayError('import openapi spec', err);
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to import OpenAPI spec' });
    }
  });

  router.get('/plugins', requirePermission(PERMISSIONS.GATEWAY_MANAGE), (_req: Request, res: Response): void => {
    const pluginInfo = plugins.map(p => ({
      name: p.name,
      hasRoutes: !!p.routes,
      hasRequestMiddleware: !!p.requestMiddleware,
      hasResponseMiddleware: !!p.responseMiddleware,
    }));
    res.json(pluginInfo);
  });

  // Vendor endpoint presets (apps/gateway/presets/*.json, README.md there)
  // - data only, loaded once at startup by preset-loader.ts. Moved here
  // from a hardcoded array in admin-dashboard's own bundle so adding a
  // vendor is a data change (a new JSON file) rather than a frontend code
  // change, and the gateway - not one specific frontend - is the source
  // of truth for what it can talk to out of the box.
  router.get('/presets', requirePermission(PERMISSIONS.GATEWAY_MANAGE), (_req: Request, res: Response): void => {
    res.json(presets);
  });

  return router;
}