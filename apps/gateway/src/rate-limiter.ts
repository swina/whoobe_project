import { GATEWAY_DEFAULT_RATE_LIMIT_RPS, GATEWAY_RATE_LIMIT_BACKEND, GATEWAY_REDIS_URL } from './config.js';

interface SlidingWindowEntry {
  timestamps: number[];
}

const windows = new Map<string, SlidingWindowEntry>();

const WINDOW_MS = 1000;

function memoryCheck(key: string, maxRps: number): boolean {
  const now = Date.now();
  let entry = windows.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    windows.set(key, entry);
  }
  entry.timestamps = entry.timestamps.filter(ts => now - ts < WINDOW_MS);
  if (entry.timestamps.length >= maxRps) {
    return false;
  }
  entry.timestamps.push(now);
  return true;
}

async function redisCheck(key: string, maxRps: number): Promise<boolean> {
  return memoryCheck(key, maxRps);
}

export async function checkRateLimit(key: string, maxRps: number): Promise<boolean> {
  const effectiveMax = maxRps > 0 ? maxRps : GATEWAY_DEFAULT_RATE_LIMIT_RPS;
  if (GATEWAY_RATE_LIMIT_BACKEND === 'redis' && GATEWAY_REDIS_URL) {
    return redisCheck(key, effectiveMax);
  }
  return memoryCheck(key, effectiveMax);
}