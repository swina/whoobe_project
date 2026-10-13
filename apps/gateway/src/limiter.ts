import { Redis } from 'ioredis';
import { GATEWAY_RATE_LIMIT_BACKEND, GATEWAY_REDIS_URL } from './config.js';
import { logger } from './log-error.js';

// Rate limiting shared by the routes that call upstream APIs (docs/plans/api-gateway/client-access-hub.md, section 13).
//   sliding-window counter: the estimate is  previous window x (1 - elapsed fraction) + current window, so a burst cannot
//   double at a window boundary the way a fixed window allows;
//   store: memory (one process) or Redis protocol (Valkey, Redis, KeyDB), one Lua script so check and increment are atomic.
// If the shared store is unreachable the in-process store answers instead (and the status says so): the gateway neither stops
// nor lets everything through.

export interface LimitResult {
  allowed: boolean;
  /** Calls left in the window, 0 when refused. */
  remaining: number;
  /** When refused: how long until a call can succeed, in ms. */
  retryAfterMs: number;
}

export interface QuotaResult { allowed: boolean; used: number }

export interface LimiterStore {
  slide(key: string, limit: number, windowMs: number, now?: number): Promise<LimitResult>;
  quota(key: string, max: number, ttlMs: number): Promise<QuotaResult>;
}

/** The algorithm, in plain code: used as the in-process store and as the reference for the Lua script. */
export function createMemoryStore(opts: { maxKeys?: number } = {}): LimiterStore {
  const maxKeys = opts.maxKeys ?? 20_000;
  const windows = new Map<string, { win: number; cur: number; prev: number }>();
  const quotas = new Map<string, { count: number; expires: number }>();
  const prune = (now: number): void => {
    for (const [k, v] of windows) if (v.win < Math.floor(now / 1000) - 3600) windows.delete(k);
    for (const [k, v] of quotas) if (v.expires < now) quotas.delete(k);
    while (windows.size > maxKeys) { const k = windows.keys().next().value; if (k === undefined) break; windows.delete(k); }
  };
  return {
    async slide(key, limit, windowMs, now = Date.now()) {
      const win = Math.floor(now / windowMs);
      let e = windows.get(key);
      if (!e) { e = { win, cur: 0, prev: 0 }; windows.set(key, e); if (windows.size > maxKeys) prune(now); }
      if (e.win !== win) { e.prev = e.win === win - 1 ? e.cur : 0; e.cur = 0; e.win = win; }
      const elapsed = (now % windowMs) / windowMs;
      const estimate = e.prev * (1 - elapsed) + e.cur;
      if (estimate + 1 > limit) return { allowed: false, remaining: 0, retryAfterMs: Math.max(1, windowMs - (now % windowMs)) };
      e.cur += 1;
      return { allowed: true, remaining: Math.max(0, Math.floor(limit - estimate - 1)), retryAfterMs: 0 };
    },
    async quota(key, max, ttlMs) {
      const now = Date.now();
      let q = quotas.get(key);
      if (!q || q.expires < now) { q = { count: 0, expires: now + ttlMs }; quotas.set(key, q); if (quotas.size > maxKeys) prune(now); }
      q.count += 1;
      return { allowed: q.count <= max, used: q.count };
    },
  };
}

const SLIDE_LUA = `
local limit = tonumber(ARGV[1]); local window = tonumber(ARGV[2]); local now = tonumber(ARGV[3])
local win = math.floor(now / window)
local curKey = KEYS[1] .. ':' .. win
local prevKey = KEYS[1] .. ':' .. (win - 1)
local cur = tonumber(redis.call('GET', curKey) or '0')
local prev = tonumber(redis.call('GET', prevKey) or '0')
local elapsed = (now % window) / window
local estimate = prev * (1 - elapsed) + cur
if estimate + 1 > limit then
  return {0, 0, math.max(1, window - (now % window))}
end
redis.call('INCR', curKey)
redis.call('PEXPIRE', curKey, window * 2)
return {1, math.max(0, math.floor(limit - estimate - 1)), 0}
`;
const QUOTA_LUA = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[2])) end
return n
`;

type RedisWithScripts = Redis & {
  wbSlide(key: string, limit: number, windowMs: number, now: number): Promise<[number, number, number]>;
  wbQuota(key: string, max: number, ttlMs: number): Promise<number>;
};

export function createRedisStore(url: string): { store: LimiterStore; client: Redis; ready: () => Promise<void> } {
  const client = new Redis(url, {
    lazyConnect: false,
    enableOfflineQueue: false,   // a down store fails the call at once, so the fallback answers instead of the request hanging
    maxRetriesPerRequest: 1,
    commandTimeout: 250,
    connectTimeout: 2000,
    retryStrategy: (times) => Math.min(times * 500, 5000),
  });
  client.on('error', () => { /* reported through the failing calls; ioredis keeps retrying in the background */ });
  client.defineCommand('wbSlide', { numberOfKeys: 1, lua: SLIDE_LUA });
  client.defineCommand('wbQuota', { numberOfKeys: 1, lua: QUOTA_LUA });
  const r = client as RedisWithScripts;
  // not connected (yet, or any more): fail at once so the in-process store answers, instead of queueing the call
  const connected = (): void => { if (client.status !== 'ready') throw new Error('rate-limit store not connected'); };
  return {
    client,
    ready: () => (client.status === 'ready' ? Promise.resolve() : new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('rate-limit store did not become ready')), 3000);
      client.once('ready', () => { clearTimeout(t); resolve(); });
    })),
    store: {
      async slide(key, limit, windowMs, now = Date.now()) {
        connected();
        const [ok, remaining, retry] = await r.wbSlide(`wb:rl:${key}`, limit, windowMs, now);
        return { allowed: ok === 1, remaining, retryAfterMs: retry };
      },
      async quota(key, max, ttlMs) {
        connected();
        const used = await r.wbQuota(`wb:q:${key}`, max, ttlMs);
        return { allowed: used <= max, used };
      },
    },
  };
}

export interface LimiterStatus { backend: 'memory' | 'redis'; degraded: boolean }

export interface Limiter extends LimiterStore { status(): LimiterStatus; close(): Promise<void> }

/** The configured store with the in-process one behind it. */
export function createLimiter(backend: 'memory' | 'redis', redisUrl: string): Limiter {
  const memory = createMemoryStore();
  let shared: { store: LimiterStore; client: Redis; ready: () => Promise<void> } | null = null;
  let degraded = false;
  let lastWarn = 0;
  if (backend === 'redis') {
    if (redisUrl) shared = createRedisStore(redisUrl);
    else logger.warn('[gateway] GATEWAY_RATE_LIMIT_BACKEND=redis but GATEWAY_REDIS_URL is empty: counting in this process only');
  }
  const through = async <T>(use: (s: LimiterStore) => Promise<T>): Promise<T> => {
    if (!shared) return use(memory);
    try {
      const out = await use(shared.store);
      degraded = false;
      return out;
    } catch (err) {
      degraded = true;
      const now = Date.now();
      if (now - lastWarn > 60_000) {
        lastWarn = now;
        logger.warn({ err: (err as Error).message }, '[gateway] rate-limit store unreachable: counting in this process only');
      }
      return use(memory);
    }
  };
  return {
    slide: (key, limit, windowMs, now) => through((s) => s.slide(key, limit, windowMs, now)),
    quota: (key, max, ttlMs) => through((s) => s.quota(key, max, ttlMs)),
    status: () => ({ backend: shared ? 'redis' : 'memory', degraded }),
    close: async () => { if (shared) await shared.client.quit().catch(() => undefined); },
  };
}

export const limiter: Limiter = createLimiter(GATEWAY_RATE_LIMIT_BACKEND, GATEWAY_REDIS_URL);
