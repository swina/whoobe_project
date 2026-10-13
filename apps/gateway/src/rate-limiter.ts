import { GATEWAY_DEFAULT_RATE_LIMIT_RPS } from './config.js';
import { limiter } from './limiter.js';

/** Per-endpoint limit of the routes called through /api/remote: requests per second, counted in the shared store when
 *  GATEWAY_RATE_LIMIT_BACKEND=redis (see limiter.ts), else in this process. */
export async function checkRateLimit(key: string, maxRps: number): Promise<boolean> {
  const effectiveMax = maxRps > 0 ? maxRps : GATEWAY_DEFAULT_RATE_LIMIT_RPS;
  return (await limiter.slide(key, effectiveMax, 1000)).allowed;
}
