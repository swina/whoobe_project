// Delivery of object events: the rules that do not depend on HTTP (backoff, signature, what happens to a delivery). The worker in the gateway only
// supplies `DeliveryDeps` (how to find the endpoint and how to send). See docs/plans/datamodel/data-objects-automations.md section 6.
import { markDelivered, markFailed, type ClaimedDelivery } from './object-events-records.js';
import { signBody } from './object-events.js';

export interface DeliveryTarget {
  url: string;
  method: string;
  /** Content type and credentials; the signature headers are added here. */
  headers: Record<string, string>;
  timeoutMs: number;
}

export type TargetResult = { ok: true; target: DeliveryTarget } | { ok: false; error: string; permanent: boolean };

export interface DeliveryDeps {
  /** Finds the subscription's endpoint and route and builds the call (credentials included). */
  resolveTarget(subscription: ClaimedDelivery['subscription']): Promise<TargetResult>;
  /** Sends the call; resolves with the HTTP status (the answer body is never kept), rejects on a network error or timeout. */
  send(target: DeliveryTarget, body: string): Promise<{ status: number }>;
  /** The HMAC key a subscription's `signingSecretRef` names. */
  getSecret(ref: string): string | undefined;
  now?(): Date;
  /** Added to every payload so a consumer can tell instances apart. */
  instance?: string;
}

const SAFE_METHODS = new Set(['POST', 'PUT', 'PATCH']);

/** Delivers one claimed event and records the outcome. Never throws for a delivery problem: the result says what happened. */
export async function deliverClaim(claim: ClaimedDelivery, deps: DeliveryDeps): Promise<'delivered' | 'retrying' | 'dead'> {
  const now = deps.now?.() ?? new Date();
  const fail = (error: string, permanent = false) => markFailed(claim.deliveryId, claim.attempts, error, { permanent, now });

  const resolved = await deps.resolveTarget(claim.subscription).catch((e: unknown) => ({ ok: false as const, error: `endpoint lookup failed: ${(e as Error)?.message ?? e}`, permanent: false }));
  if (!resolved.ok) return fail(resolved.error, resolved.permanent);
  const { target } = resolved;
  if (!SAFE_METHODS.has(target.method.toUpperCase())) return fail(`the route uses ${target.method}; an event needs a POST, PUT or PATCH route`, true);

  const body = JSON.stringify(deps.instance ? { ...claim.event.payload, instance: deps.instance } : claim.event.payload);
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const headers: Record<string, string> = {
    ...target.headers,
    'content-type': 'application/json',
    'x-whoobe-event-id': claim.event.id,
    'x-whoobe-event-type': claim.event.type,
    'x-whoobe-timestamp': timestamp,
  };
  if (claim.subscription.signingSecretRef) {
    const secret = deps.getSecret(claim.subscription.signingSecretRef);
    if (!secret) return fail(`the signing secret "${claim.subscription.signingSecretRef}" is not set on this instance`);
    headers['x-whoobe-signature'] = signBody(secret, timestamp, body);
  }

  try {
    const { status } = await deps.send({ ...target, headers }, body);
    if (status >= 200 && status < 300) {
      await markDelivered(claim.deliveryId, now);
      return 'delivered';
    }
    return fail(`the consumer answered HTTP ${status}`);
  } catch (e) {
    return fail(`not delivered: ${(e as Error)?.message ?? e}`);
  }
}
