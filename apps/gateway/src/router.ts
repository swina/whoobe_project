import { Router, type Request, type Response } from 'express';
import { proxyFetch } from './proxy-engine.js';
import { requireAuth } from './auth.js';
import { GATEWAY_CORE_API_URL, GATEWAY_ASSET_PROCESSOR_URL } from './config.js';
import { createAdminRoutes } from './admin-routes.js';
import { createRemoteRouter, setLoadedPlugins } from './remote-router.js';
import { createResolveHandler } from './resolve-handler.js';
import { createSubmitHandler } from './submit-handler.js';
import { loadPlugins } from './plugin-loader.js';
import type { GatewayPlugin } from './plugin-types.js';
import { createPresetSource } from './preset-loader.js';
import { PERMISSIONS, requirePermission } from './auth.js';
import { logGatewayError } from './log-error.js';

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

      const result = await proxyFetch(upstreamUrl, req.method, headers, req.body, undefined, { trusted: true });

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
      logGatewayError('internal proxy request', err);
      res.status(502).json({ error: 'Internal proxy failed' });
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
      const result = await proxyFetch(upstreamUrl, req.method, headers, isMultipart ? undefined : req.body, undefined, { trusted: true });

      res.status(result.status).json(result.body);
    } catch (err) {
      logGatewayError('DAM proxy request', err);
      res.status(502).json({ error: 'DAM proxy failed' });
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

      const result = await proxyFetch(upstreamUrl, req.method, headers, req.body, undefined, { trusted: true });

      const contentType = (result.headers['content-type'] || 'application/json') as string;
      if (contentType.includes('application/json')) {
        res.status(result.status).json(result.body);
      } else {
        res.status(result.status).type(contentType).send(result.body as string);
      }
    } catch (err) {
      logGatewayError('public proxy request', err);
      res.status(502).json({ error: 'Public proxy failed' });
    }
  });

  const loadPluginDirPath = process.env.GATEWAY_PLUGINS_PATH;
  const loadedPlugins = loadPlugins(router, loadPluginDirPath);
  plugins.push(...loadedPlugins);
  setLoadedPlugins(plugins);

  const presets = createPresetSource(process.env.GATEWAY_PRESETS_PATH);

  router.use('/api/v1/gateway', createAdminRoutes(plugins, presets));
  router.use('/api/remote', createRemoteRouter());
  router.use('/api/v1/gateway/resolve', createResolveHandler());
  router.use('/api/v1/gateway/submit', createSubmitHandler());

  return router;
}