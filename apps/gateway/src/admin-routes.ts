import { Router, type Request, type Response } from 'express';
import { requirePermission, PERMISSIONS } from './auth.js';
import type { GatewayPlugin } from './plugin-types.js';

export function createAdminRoutes(plugins: GatewayPlugin[]): Router {
  const router = Router();

  router.get('/endpoints', requirePermission(PERMISSIONS.GATEWAY_MANAGE), async (_req: Request, res: Response): Promise<void> => {
    try {
      const { listGatewayEndpoints } = await import('@whoobe-cms/core/server');
      const endpoints = await listGatewayEndpoints();
      res.json(endpoints);
    } catch (err) {
      res.status(500).json({ error: 'Failed to list endpoints', details: String(err) });
    }
  });

  router.post('/endpoints', requirePermission(PERMISSIONS.GATEWAY_MANAGE), async (req: Request, res: Response): Promise<void> => {
    try {
      const { createGatewayEndpoint } = await import('@whoobe-cms/core/server');
      const endpoint = await createGatewayEndpoint(req.body);
      res.status(201).json(endpoint);
    } catch (err) {
      res.status(400).json({ error: 'Failed to create endpoint', details: String(err) });
    }
  });

  router.get('/endpoints/:id', requirePermission(PERMISSIONS.GATEWAY_MANAGE), async (req: Request, res: Response): Promise<void> => {
    try {
      const { getGatewayEndpoint } = await import('@whoobe-cms/core/server');
      const endpoint = await getGatewayEndpoint(req.params.id);
      if (!endpoint) { res.status(404).json({ error: 'Not found' }); return; }
      res.json(endpoint);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.patch('/endpoints/:id', requirePermission(PERMISSIONS.GATEWAY_MANAGE), async (req: Request, res: Response): Promise<void> => {
    try {
      const { updateGatewayEndpoint } = await import('@whoobe-cms/core/server');
      const endpoint = await updateGatewayEndpoint(req.params.id, req.body);
      if (!endpoint) { res.status(404).json({ error: 'Not found' }); return; }
      res.json(endpoint);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  router.delete('/endpoints/:id', requirePermission(PERMISSIONS.GATEWAY_MANAGE), async (req: Request, res: Response): Promise<void> => {
    try {
      const { deleteGatewayEndpoint } = await import('@whoobe-cms/core/server');
      await deleteGatewayEndpoint(req.params.id);
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.get('/endpoints/:id/routes', requirePermission(PERMISSIONS.GATEWAY_MANAGE), async (req: Request, res: Response): Promise<void> => {
    try {
      const { listGatewayRoutes } = await import('@whoobe-cms/core/server');
      const routes = await listGatewayRoutes(req.params.id);
      res.json(routes);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post('/endpoints/:id/routes', requirePermission(PERMISSIONS.GATEWAY_MANAGE), async (req: Request, res: Response): Promise<void> => {
    try {
      const { createGatewayRoute } = await import('@whoobe-cms/core/server');
      const route = await createGatewayRoute({ ...req.body, endpointId: req.params.id });
      res.status(201).json(route);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  router.patch('/routes/:id', requirePermission(PERMISSIONS.GATEWAY_MANAGE), async (req: Request, res: Response): Promise<void> => {
    try {
      const { updateGatewayRoute } = await import('@whoobe-cms/core/server');
      const route = await updateGatewayRoute(req.params.id, req.body);
      if (!route) { res.status(404).json({ error: 'Not found' }); return; }
      res.json(route);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  router.delete('/routes/:id', requirePermission(PERMISSIONS.GATEWAY_MANAGE), async (req: Request, res: Response): Promise<void> => {
    try {
      const { deleteGatewayRoute } = await import('@whoobe-cms/core/server');
      await deleteGatewayRoute(req.params.id);
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ error: String(err) });
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

      if (endpoint.authType === 'api-key' && endpoint.authConfig) {
        const config = endpoint.authConfig as Record<string, string>;
        headers[config.keyHeader || 'X-API-Key'] = config.keyValue || '';
      } else if (endpoint.authType === 'bearer' && endpoint.authConfig) {
        const config = endpoint.authConfig as Record<string, string>;
        headers['Authorization'] = `Bearer ${config.token || ''}`;
      } else if (endpoint.authType === 'basic' && endpoint.authConfig) {
        const config = endpoint.authConfig as Record<string, string>;
        const encoded = Buffer.from(`${config.username || ''}:${config.password || ''}`).toString('base64');
        headers['Authorization'] = `Basic ${encoded}`;
      }

      const result = await proxyFetch(upstreamUrl, route.method, headers, undefined, 15000);

      const schema = inferSchema(result.body) as unknown as Record<string, unknown>;

      const { upsertGatewaySchema } = await import('@whoobe-cms/core/server');
      const schemaRecord = await upsertGatewaySchema(route.id, schema, result.body);
      await updateGatewayRoute(route.id, { responseSchemaId: schemaRecord.id });

      res.json({ status: result.status, schema, sample: result.body });
    } catch (err) {
      res.status(502).json({ error: 'Proxy test failed', details: String(err) });
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

      if (endpoint.authType === 'api-key' && endpoint.authConfig) {
        const config = endpoint.authConfig as Record<string, string>;
        headers[config.keyHeader || 'X-API-Key'] = config.keyValue || '';
      } else if (endpoint.authType === 'bearer' && endpoint.authConfig) {
        const config = endpoint.authConfig as Record<string, string>;
        headers['Authorization'] = `Bearer ${config.token || ''}`;
      } else if (endpoint.authType === 'basic' && endpoint.authConfig) {
        const config = endpoint.authConfig as Record<string, string>;
        const encoded = Buffer.from(`${config.username || ''}:${config.password || ''}`).toString('base64');
        headers['Authorization'] = `Basic ${encoded}`;
      }

      const requestBody = body?.requestBody;
      const result = await proxyFetch(upstreamUrl, route.method, headers, requestBody, 15000);

      const responseHeaders: Record<string, string> = {};
      if (result.headers) {
        for (const [k, v] of Object.entries(result.headers)) {
          if (typeof v === 'string') responseHeaders[k] = v;
        }
      }

      res.json({ error: false, upstreamStatus: result.status, headers: responseHeaders, body: result.body });
    } catch (err) {
      res.json({ error: true, upstreamStatus: 0, headers: {}, body: String(err) });
    }
  });

  router.get('/routes/:id/schema', requirePermission(PERMISSIONS.GATEWAY_MANAGE), async (req: Request, res: Response): Promise<void> => {
    try {
      const { getGatewaySchema } = await import('@whoobe-cms/core/server');
      const schema = await getGatewaySchema(req.params.id);
      if (!schema) { res.status(404).json({ error: 'Schema not found. Test the route first.' }); return; }
      res.json(schema);
    } catch (err) {
      res.status(500).json({ error: String(err) });
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
      if (endpoint.authType === 'api-key' && endpoint.authConfig) {
        const config = endpoint.authConfig as Record<string, string>;
        headers[config.keyHeader || 'X-API-Key'] = config.keyValue || '';
      } else if (endpoint.authType === 'bearer' && endpoint.authConfig) {
        const config = endpoint.authConfig as Record<string, string>;
        headers['Authorization'] = `Bearer ${config.token || ''}`;
      } else if (endpoint.authType === 'basic' && endpoint.authConfig) {
        const config = endpoint.authConfig as Record<string, string>;
        const encoded = Buffer.from(`${config.username || ''}:${config.password || ''}`).toString('base64');
        headers['Authorization'] = `Basic ${encoded}`;
      }

      const result = await proxyFetch(upstreamUrl, route.method, headers, undefined, 15000);
      const schema = inferSchema(result.body) as unknown as Record<string, unknown>;

      const { upsertGatewaySchema } = await import('@whoobe-cms/core/server');
      const schemaRecord = await upsertGatewaySchema(route.id, schema, result.body);
      await updateGatewayRoute(route.id, { responseSchemaId: schemaRecord.id });

      res.json({ status: result.status, schema });
    } catch (err) {
      res.status(502).json({ error: 'Schema refresh failed', details: String(err) });
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

  return router;
}