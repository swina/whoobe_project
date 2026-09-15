import { loadRootEnv } from '@whoobe-cms/core/server';

loadRootEnv();

export const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT || '3001', 10);
export const GATEWAY_CORE_API_URL = process.env.GATEWAY_CORE_API_URL || 'http://localhost:3003';
export const GATEWAY_ASSET_PROCESSOR_URL = process.env.GATEWAY_ASSET_PROCESSOR_URL || 'http://localhost:3002';
export const GATEWAY_PLUGINS_PATH = process.env.GATEWAY_PLUGINS_PATH || '';
export const GATEWAY_DEFAULT_RATE_LIMIT_RPS = parseInt(process.env.GATEWAY_DEFAULT_RATE_LIMIT_RPS || '10', 10);
export const GATEWAY_RATE_LIMIT_BACKEND = (process.env.GATEWAY_RATE_LIMIT_BACKEND || 'memory') as 'memory' | 'redis';
export const GATEWAY_REDIS_URL = process.env.GATEWAY_REDIS_URL || '';
export const GATEWAY_PROXY_TIMEOUT_MS = parseInt(process.env.GATEWAY_PROXY_TIMEOUT_MS || '30000', 10);