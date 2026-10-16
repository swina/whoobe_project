import { and, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { getDb } from './client.js';
import { objectEvents, objectEventDeliveries, objectEventSubscriptions } from './object-events-schema.js';
import { getDataClass } from './data-classes-records.js';
import { buildBulkEvent, nextAttemptPlan, objectEventsEnabled, type BulkObjectEvent, type EventActor, type ObjectEvent } from './object-events.js';

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Writes an event and one delivery per matching subscription, using the caller's runner so that it commits (or rolls back) together with
 * the data change (the event is stored only when at least one subscription matches). A subscription matches when it is enabled, is for this class (or all), lists the event type and does not ignore the actor.
 * Returns how many deliveries were queued. Idempotent per event id (a repeated call changes nothing).
 */
export async function insertEvent(runner: Db | Tx, event: ObjectEvent | BulkObjectEvent): Promise<number> {
  if (!objectEventsEnabled()) return 0;
  const actorId = event.actor.id ?? '';
  const matching = await runner
    .select({ id: objectEventSubscriptions.id })
    .from(objectEventSubscriptions)
    .where(
      and(
        eq(objectEventSubscriptions.enabled, true),
        or(isNull(objectEventSubscriptions.classId), eq(objectEventSubscriptions.classId, event.class.id)),
        sql`${event.type} = ANY(${objectEventSubscriptions.events})`,
        sql`NOT (${actorId} <> '' AND ${actorId} = ANY(${objectEventSubscriptions.ignoreActors}))`,
      ),
    );
  // An event nobody listens to is not stored: a subscription created later never receives old events anyway.
  if (!matching.length) return 0;
  const object = 'object' in event ? event.object : null;
  await runner
    .insert(objectEvents)
    .values({
      id: event.id,
      type: event.type,
      occurredAt: new Date(event.occurredAt),
      classId: event.class.id,
      objectId: object?.id ?? null,
      translationGroupId: object?.translationGroupId ?? null,
      locale: object?.locale ?? null,
      actorType: event.actor.type,
      actorId: event.actor.id ?? null,
      payload: event as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing();
  const queued = await runner
    .insert(objectEventDeliveries)
    .values(matching.map((s) => ({ eventId: event.id, subscriptionId: s.id })))
    .onConflictDoNothing()
    .returning({ id: objectEventDeliveries.id });
  return queued.length;
}

/** ONE `object.bulk` summary for a run that wrote with `silent: true` (bundle import, Pimcore migration). Does nothing when `count` is 0. */
export async function emitBulkSummary(input: {
  classId: string;
  kind: BulkObjectEvent['bulk']['kind'];
  count: number;
  ids: string[];
  actor?: EventActor;
}): Promise<number> {
  if (input.count <= 0) return 0;
  const classDef = await getDataClass(input.classId);
  return insertEvent(getDb(), buildBulkEvent({ ...input, className: classDef?.name }));
}

// ---- the delivery queue (used by the worker in the gateway) ----

/** One delivery taken by a worker, with what it needs to send it. */
export interface ClaimedDelivery {
  deliveryId: string;
  attempts: number;
  event: { id: string; type: string; payload: Record<string, unknown> };
  subscription: { id: string; name: string; endpointId: string | null; routeId: string | null; signingSecretRef: string | null; payloadMode: string };
}

/** Longest a worker may keep a delivery before another worker may take it again (a crashed worker's deliveries come back after this). */
export const DELIVERY_LEASE_MS = 2 * 60_000;

/**
 * Takes up to `limit` due deliveries (`pending` or `retrying`, oldest first). Rows are locked with `FOR UPDATE SKIP LOCKED` so two workers never take the
 * same one, and each taken row is leased (its `next_attempt_at` moves forward) instead of holding a transaction open during the HTTP call.
 */
export async function claimDueDeliveries(limit: number, now: Date = new Date()): Promise<ClaimedDelivery[]> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: objectEventDeliveries.id })
      .from(objectEventDeliveries)
      .where(and(inArray(objectEventDeliveries.status, ['pending', 'retrying']), lte(objectEventDeliveries.nextAttemptAt, now)))
      .orderBy(objectEventDeliveries.nextAttemptAt)
      .limit(limit)
      .for('update', { skipLocked: true });
    if (!due.length) return [];
    const ids = due.map((d) => d.id);
    await tx.update(objectEventDeliveries).set({ nextAttemptAt: new Date(now.getTime() + DELIVERY_LEASE_MS) }).where(inArray(objectEventDeliveries.id, ids));
    const rows = await tx
      .select({
        deliveryId: objectEventDeliveries.id,
        attempts: objectEventDeliveries.attempts,
        eventId: objectEvents.id,
        eventType: objectEvents.type,
        payload: objectEvents.payload,
        subId: objectEventSubscriptions.id,
        subName: objectEventSubscriptions.name,
        endpointId: objectEventSubscriptions.endpointId,
        routeId: objectEventSubscriptions.routeId,
        signingSecretRef: objectEventSubscriptions.signingSecretRef,
        payloadMode: objectEventSubscriptions.payloadMode,
      })
      .from(objectEventDeliveries)
      .innerJoin(objectEvents, eq(objectEvents.id, objectEventDeliveries.eventId))
      .innerJoin(objectEventSubscriptions, eq(objectEventSubscriptions.id, objectEventDeliveries.subscriptionId))
      .where(inArray(objectEventDeliveries.id, ids))
      .orderBy(objectEvents.occurredAt);
    return rows.map((r) => ({
      deliveryId: r.deliveryId,
      attempts: r.attempts,
      event: { id: r.eventId, type: r.eventType, payload: r.payload },
      subscription: { id: r.subId, name: r.subName, endpointId: r.endpointId, routeId: r.routeId, signingSecretRef: r.signingSecretRef, payloadMode: r.payloadMode },
    }));
  });
}

const ERROR_MAX = 300;
const clip = (text: string) => text.replace(/\s+/g, ' ').slice(0, ERROR_MAX);

export async function markDelivered(deliveryId: string, now: Date = new Date()): Promise<void> {
  await getDb()
    .update(objectEventDeliveries)
    .set({ status: 'delivered', deliveredAt: now, lastError: null, attempts: sql`${objectEventDeliveries.attempts} + 1` })
    .where(eq(objectEventDeliveries.id, deliveryId));
}

/** A failed attempt: counts it and either schedules the next one (backoff) or ends the delivery as `dead`. `permanent`: no retry can help. */
export async function markFailed(deliveryId: string, attemptsBefore: number, error: string, opts: { permanent?: boolean; now?: Date } = {}): Promise<'retrying' | 'dead'> {
  const now = opts.now ?? new Date();
  const plan = opts.permanent ? { status: 'dead' as const } : nextAttemptPlan(attemptsBefore + 1, now);
  await getDb()
    .update(objectEventDeliveries)
    .set({
      status: plan.status,
      attempts: attemptsBefore + 1,
      lastError: clip(error),
      ...('nextAttemptAt' in plan && plan.nextAttemptAt ? { nextAttemptAt: plan.nextAttemptAt } : {}),
    })
    .where(eq(objectEventDeliveries.id, deliveryId));
  return plan.status;
}
