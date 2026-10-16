import {
  claimDueDeliveries,
  deliverClaim,
  getGatewayEndpoint,
  getGatewayRoute,
  SIGNING_SECRET_PREFIX,
  type ClaimedDelivery,
  type DeliveryDeps,
  type TargetResult,
} from '@whoobe-cms/core/server';
import { buildAuthHeaders } from './gateway-auth-headers.js';
import { proxyFetch } from './proxy-engine.js';
import { resolveGatewayUrl } from './resolve-gateway-url.js';
import { logger } from './log-error.js';

// Delivers object events (docs/plans/datamodel/object-events-phase0.md, step 5). The rules (backoff, signature, states) are in core
// (object-events-delivery.ts, tested there); this file only knows how a gateway endpoint and route become an HTTP call:
// credentials from the endpoint (buildAuthHeaders), the call through proxyFetch (timeout and SSRF guard, outbound allow-list), no request
// plugins (they act on a caller's request and there is none here). The consumer's answer body is read by proxyFetch and dropped.

const POLL_MS = 2_000;
const CALL_TIMEOUT_MS = 10_000;

async function resolveTarget(sub: ClaimedDelivery['subscription']): Promise<TargetResult> {
  if (!sub.endpointId || !sub.routeId) return { ok: false, permanent: true, error: 'the endpoint or the route of this subscription was removed' };
  const endpoint = await getGatewayEndpoint(sub.endpointId);
  const route = await getGatewayRoute(sub.routeId);
  if (!endpoint || !route || route.endpointId !== endpoint.id) return { ok: false, permanent: true, error: 'the endpoint or the route of this subscription was removed' };
  if (!endpoint.isActive) return { ok: false, permanent: false, error: `the endpoint "${endpoint.name}" is inactive` };
  if (route.path.includes('{')) return { ok: false, permanent: true, error: 'the route has path parameters; an event route must be a fixed path' };
  return {
    ok: true,
    target: {
      url: resolveGatewayUrl(endpoint.baseUrl, route.path),
      method: route.method,
      headers: await buildAuthHeaders(endpoint),
      timeoutMs: Math.min(endpoint.requestTimeoutMs, CALL_TIMEOUT_MS),
    },
  };
}

export const objectEventDeps: DeliveryDeps = {
  resolveTarget,
  // proxyFetch serialises an object body itself: the string is parsed back so the bytes sent are exactly the bytes that were signed
  send: async (target, body) => {
    const result = await proxyFetch(target.url, target.method, target.headers, JSON.parse(body), target.timeoutMs);
    return { status: result.status };
  },
  // only names with the prefix: a subscription can never read another secret of the instance
  getSecret: (ref) => (ref.startsWith(SIGNING_SECRET_PREFIX) ? process.env[ref] : undefined),
  instance: process.env.WHOOBE_HOSTNAME || undefined,
};

/** One pass: take what is due and deliver it, at most `concurrency` at a time. Returns how many were taken. */
export async function runObjectEventPass(concurrency: number): Promise<number> {
  const claims = await claimDueDeliveries(concurrency);
  await Promise.all(
    claims.map(async (claim) => {
      try {
        const outcome = await deliverClaim(claim, objectEventDeps);
        if (outcome !== 'delivered') logger.warn({ event: claim.event.id, type: claim.event.type, subscription: claim.subscription.name, outcome }, '[object-events] delivery not completed');
      } catch (err) {
        logger.error({ err, event: claim.event.id }, '[object-events] delivery crashed');
      }
    }),
  );
  return claims.length;
}

/** Starts the poller. `OBJECT_EVENTS_ENABLED=0` turns it off (the kill switch); with no subscription a pass is one empty query. */
export function startObjectEventWorker(): void {
  if (process.env.OBJECT_EVENTS_ENABLED === '0') {
    logger.info('[object-events] worker off (OBJECT_EVENTS_ENABLED=0)');
    return;
  }
  const concurrency = Math.max(1, Math.min(50, parseInt(process.env.OBJECT_EVENTS_CONCURRENCY || '5', 10) || 5));
  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      // while there is a backlog keep going without waiting for the next tick
      while ((await runObjectEventPass(concurrency)) === concurrency) { /* next batch */ }
    } catch (err) {
      logger.error({ err }, '[object-events] pass failed');
    } finally {
      running = false;
    }
  };
  setInterval(() => void tick(), POLL_MS).unref();
  logger.info({ concurrency }, '[object-events] worker started');
}
