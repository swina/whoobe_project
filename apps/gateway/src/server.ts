import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import { corsPolicy, securityHeaders, parseTrustProxy } from '@whoobe-cms/core/server';
import { createRouter } from './router.js';
import { GATEWAY_PORT } from './config.js';
import { logger } from './log-error.js';

const app: Express = express();
const port = GATEWAY_PORT;

// Default (100kb) is far too small for POST /routes/:id/execute once a
// caller's requestBody embeds base64 image data (BrevoCampaignModal.vue's
// embedImages option can easily produce several MB of htmlContent) -
// without this, Express itself rejects the request with a 413 "payload too
// large" before it ever reaches buildAuthHeaders()/proxyFetch(), let alone
// the upstream API. 25mb comfortably covers a multi-image campaign body
// while still bounding worst-case memory use per request.
app.use(express.json({ limit: '25mb' }));
app.use(cookieParser());
// Credentialed CORS only for an allowlist (WHOOBE_HOSTNAME, CORS_ALLOWED_HOSTS, CORS_ALLOWED_ORIGINS;
// localhost too outside production). The site-facing routes (key-authenticated, no cookie) answer
// any origin without credentials. 5xx bodies are NOT sanitised here: proxied upstream errors are the point.
app.disable('x-powered-by');
// req.ip feeds the public-route limiters: behind a reverse proxy set TRUST_PROXY (hops / loopback / CIDRs),
// never when the gateway is directly reachable (X-Forwarded-For would become spoofable).
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));
app.use(securityHeaders());
app.use(corsPolicy({
  publicPathPrefixes: ['/health', '/public/', '/api/remote', '/client/v1', '/api/v1/gateway/resolve', '/api/v1/gateway/submit'],
}));

app.use('/', createRouter());

app.listen(port, () => {
  logger.info({ port, coreApiUrl: process.env.GATEWAY_CORE_API_URL, assetProcessorUrl: process.env.GATEWAY_ASSET_PROCESSOR_URL }, 'API Gateway started');
});

export default app;