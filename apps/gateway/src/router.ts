import { Router, type Request, type Response } from 'express';
import { proxyFetch } from './proxy-engine.js';
import { requireAuth } from './auth.js';
import { GATEWAY_CORE_API_URL, GATEWAY_ASSET_PROCESSOR_URL } from './config.js';
import { createAdminRoutes } from './admin-routes.js';
import { createRemoteRouter, setLoadedPlugins } from './remote-router.js';
import { createResolveHandler } from './resolve-handler.js';
import { loadPlugins } from './plugin-loader.js';
import type { GatewayPlugin } from './plugin-types.js';
import { PERMISSIONS, requirePermission } from './auth.js';

export function createRouter(): Router {
  const router = Router();

  const plugins: GatewayPlugin[] = [];

  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'gateway', uptimeSeconds: process.uptime(), timestamp: new Date().toISOString() });
  });

  router.all('/api/internal/*', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const targetPath = req.path.replace(/^\/api\/internal/, '');
      const queryString = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      const upstreamUrl = `${GATEWAY_CORE_API_URL}${targetPath}${queryString}`;

      const headers: Record<string, string> = {};
      const forwardedHeaders = ['content-type', 'accept', 'cookie'];
      for (const h of forwardedHeaders) {
        const val = req.headers[h];
        if (val) headers[h] = Array.isArray(val) ? val[0] : val;
      }

      const result = await proxyFetch(upstreamUrl, req.method, headers, req.body);

      if (result.headers['set-cookie']) {
        const cookies = result.headers['set-cookie'];
        if (Array.isArray(cookies)) {
          res.setHeader('set-cookie', cookies);
        } else if (typeof cookies === 'string') {
          res.setHeader('set-cookie', [cookies]);
        }
      }

      res.status(result.status).json(result.body);
    } catch (err) {
      res.status(502).json({ error: 'Internal proxy failed', details: String(err) });
    }
  });

  router.all('/dam/*', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const targetPath = req.path;
      const queryString = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      const upstreamUrl = `${GATEWAY_ASSET_PROCESSOR_URL}${targetPath}${queryString}`;

      const headers: Record<string, string> = {};
      const forwardedHeaders = ['content-type', 'accept', 'cookie'];
      for (const h of forwardedHeaders) {
        const val = req.headers[h];
        if (val) headers[h] = Array.isArray(val) ? val[0] : val;
      }

      const isMultipart = req.headers['content-type']?.toString().includes('multipart/form-data');
      const result = await proxyFetch(upstreamUrl, req.method, headers, isMultipart ? undefined : req.body);

      res.status(result.status).json(result.body);
    } catch (err) {
      res.status(502).json({ error: 'DAM proxy failed', details: String(err) });
    }
  });

  router.all('/public/*', async (req: Request, res: Response): Promise<void> => {
    try {
      const targetPath = req.path.replace(/^\/public/, '');
      const queryString = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      const upstreamUrl = `${GATEWAY_CORE_API_URL}${targetPath}${queryString}`;

      const headers: Record<string, string> = {};
      const forwardedHeaders = ['content-type', 'accept'];
      for (const h of forwardedHeaders) {
        const val = req.headers[h];
        if (val) headers[h] = Array.isArray(val) ? val[0] : val;
      }

      const result = await proxyFetch(upstreamUrl, req.method, headers, req.body);

      const contentType = (result.headers['content-type'] || 'application/json') as string;
      if (contentType.includes('application/json')) {
        res.status(result.status).json(result.body);
      } else {
        res.status(result.status).type(contentType).send(result.body as string);
      }
    } catch (err) {
      res.status(502).json({ error: 'Public proxy failed', details: String(err) });
    }
  });

  const loadPluginDirPath = process.env.GATEWAY_PLUGINS_PATH;
  const loadedPlugins = loadPlugins(router, loadPluginDirPath);
  plugins.push(...loadedPlugins);
  setLoadedPlugins(plugins);

  router.use('/api/v1/gateway', createAdminRoutes(plugins));
  router.use('/api/remote', createRemoteRouter());
  router.use('/api/v1/gateway/resolve', createResolveHandler());

  return router;
}