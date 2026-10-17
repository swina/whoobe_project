import { and, desc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { getDb } from './client.js';
import { objectEvents, objectEventDeliveries, objectEventSubscriptions } from './object-events-schema.js';
import { getDataClass } from './data-classes-records.js';
import { buildBulkEvent, countsForLoopGuard, END_OF_FLOW_REASON, loopLimits, loopVerdict, nextAttemptPlan, objectEventsEnabled, type SubscriptionInput, type BulkObjectEvent, type EventActor, type ObjectEvent } from './object-events.js';

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
  const endOfFlow = 'endOfFlow' in event && event.endOfFlow === true;
  // Loop guard (docs/plans/automations/object-events-loop-guard.md): what this actor and the subscriptions saw on this record lately. Only an API
  // client can loop (people, the system and imports are never counted); a write that ends a flow starts nothing, so it is not counted either.
  const limits = loopLimits();
  const since = new Date(new Date(event.occurredAt).getTime() - limits.windowSeconds * 1000);
  const counted = !!object && countsForLoopGuard(event.actor) && !endOfFlow;
  const notEnd = sql`NOT (${objectEvents.payload} ? 'endOfFlow')`;
  let byActor = 0;
  if (counted && limits.perActor > 0) {
    const [r] = await runner
      .select({ n: sql<number>`count(*)::int` })
      .from(objectEvents)
      .where(and(eq(objectEvents.objectId, object!.id), eq(objectEvents.actorType, 'api-client'), eq(objectEvents.actorId, actorId), gt(objectEvents.occurredAt, since), notEnd));
    byActor = r?.n ?? 0;
  }
  const bySub = new Map<string, number>();
  if (counted && limits.perSubscription > 0) {
    const rows = await runner
      .select({ sub: objectEventDeliveries.subscriptionId, n: sql<number>`count(*)::int` })
      .from(objectEventDeliveries)
      .innerJoin(objectEvents, eq(objectEvents.id, objectEventDeliveries.eventId))
      .where(and(inArray(objectEventDeliveries.subscriptionId, matching.map((m) => m.id)), eq(objectEvents.objectId, object!.id), eq(objectEvents.actorType, 'api-client'), gt(objectEvents.occurredAt, since), notEnd))
      .groupBy(objectEventDeliveries.subscriptionId);
    for (const r of rows) bySub.set(r.sub, r.n);
  }
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
  // One delivery per subscription. A stopped one is written too (status `stopped`, with the reason) so that the Delivery Log shows what
  // was not sent and why; the worker only takes `pending` and `retrying`.
  const rows = matching.map((s) => {
    const why = endOfFlow ? END_OF_FLOW_REASON : counted ? loopVerdict({ byActor, bySubscription: bySub.get(s.id) ?? 0 }, limits) : null;
    if (why && !endOfFlow) warnLoopGuard(`${actorId}:${object!.id}:${s.id}`, why, event);
    return { eventId: event.id, subscriptionId: s.id, ...(why ? { status: 'stopped', lastError: why } : {}) };
  });
  const queued = await runner.insert(objectEventDeliveries).values(rows).onConflictDoNothing().returning({ id: objectEventDeliveries.id, status: objectEventDeliveries.status });
  return queued.filter((d) => d.status !== 'stopped').length;
}

const warned = new Map<string, number>();
/** One warning per actor, record and subscription per window, not one per stopped event. */
function warnLoopGuard(key: string, why: string, event: ObjectEvent | BulkObjectEvent): void {
  const now = Date.now();
  const last = warned.get(key);
  if (last !== undefined && now - last < loopLimits().windowSeconds * 1000) return;
  if (warned.size > 500) warned.clear();
  warned.set(key, now);
  console.warn(JSON.stringify({ level: 'warn', msg: '[object-events] loop guard stopped a delivery', why, eventId: event.id, type: event.type, actor: event.actor, object: 'object' in event ? event.object.id : null }));
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

// ---- subscriptions and the delivery log (managed from the dashboard) ----

export type ObjectEventSubscriptionRecord = typeof objectEventSubscriptions.$inferSelect;

export async function listObjectEventSubscriptions(): Promise<ObjectEventSubscriptionRecord[]> {
  return getDb().select().from(objectEventSubscriptions).orderBy(objectEventSubscriptions.name);
}

export async function getObjectEventSubscription(id: string): Promise<ObjectEventSubscriptionRecord | undefined> {
  const [row] = await getDb().select().from(objectEventSubscriptions).where(eq(objectEventSubscriptions.id, id)).limit(1);
  return row;
}

export async function createObjectEventSubscription(input: SubscriptionInput): Promise<ObjectEventSubscriptionRecord> {
  const [row] = await getDb()
    .insert(objectEventSubscriptions)
    .values({ ...input, enabled: input.enabled ?? true })
    .returning();
  return row;
}

export async function updateObjectEventSubscription(id: string, input: Partial<SubscriptionInput>): Promise<ObjectEventSubscriptionRecord | undefined> {
  const [row] = await getDb()
    .update(objectEventSubscriptions)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(objectEventSubscriptions.id, id))
    .returning();
  return row;
}

/** When the loop guard last stopped a delivery, per subscription, within the last 24 hours (for the badge in the list). */
export async function loopGuardFiredBySubscription(now: Date = new Date()): Promise<Map<string, Date>> {
  const since = new Date(now.getTime() - 24 * 3_600_000);
  const rows = await getDb()
    .select({ sub: objectEventDeliveries.subscriptionId, at: sql<Date>`max(${objectEventDeliveries.createdAt})` })
    .from(objectEventDeliveries)
    .where(and(eq(objectEventDeliveries.status, 'stopped'), sql`${objectEventDeliveries.lastError} LIKE 'loop guard:%'`, gt(objectEventDeliveries.createdAt, since)))
    .groupBy(objectEventDeliveries.subscriptionId);
  return new Map(rows.map((r) => [r.sub, new Date(r.at)]));
}

/** Deleting a subscription deletes its deliveries (cascade). */
export async function deleteObjectEventSubscription(id: string): Promise<boolean> {
  const rows = await getDb().delete(objectEventSubscriptions).where(eq(objectEventSubscriptions.id, id)).returning({ id: objectEventSubscriptions.id });
  return rows.length > 0;
}

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Queues a synthetic `object.updated` marked `"test": true` for ONE subscription (whatever its filters say), so an administrator can see the
 * consumer receive something. Not an event of a real object: its object id is the nil UUID.
 */
export async function sendTestObjectEvent(subscriptionId: string, actor: EventActor, now: Date = new Date()): Promise<{ eventId: string; deliveryId: string } | null> {
  const sub = await getObjectEventSubscription(subscriptionId);
  if (!sub) return null;
  const id = crypto.randomUUID();
  const classId = sub.classId ?? NIL_UUID;
  const payload = {
    id,
    type: 'object.updated',
    test: true,
    occurredAt: now.toISOString(),
    class: { id: classId },
    object: { id: NIL_UUID, translationGroupId: NIL_UUID, locale: 'en', key: 'test-event', published: false, workflowState: null, updatedAt: now.toISOString() },
    changed: [],
    actor,
  };
  return getDb().transaction(async (tx) => {
    await tx.insert(objectEvents).values({
      id, type: 'object.updated', occurredAt: now, classId, objectId: null, translationGroupId: null, locale: null,
      actorType: actor.type, actorId: actor.id ?? null, payload,
    });
    const [d] = await tx.insert(objectEventDeliveries).values({ eventId: id, subscriptionId, nextAttemptAt: now }).returning({ id: objectEventDeliveries.id });
    return { eventId: id, deliveryId: d.id };
  });
}

export interface DeliveryLogRow {
  id: string;
  status: string;
  attempts: number;
  nextAttemptAt: Date;
  lastError: string | null;
  deliveredAt: Date | null;
  createdAt: Date;
  event: { id: string; type: string; occurredAt: Date; objectId: string | null; test: boolean };
}

/** Newest first. The log shows what happened to a delivery, never the content of the event or the consumer's answer. */
export async function listDeliveries(subscriptionId: string, opts: { status?: string; limit?: number } = {}): Promise<DeliveryLogRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const rows = await getDb()
    .select({
      id: objectEventDeliveries.id,
      status: objectEventDeliveries.status,
      attempts: objectEventDeliveries.attempts,
      nextAttemptAt: objectEventDeliveries.nextAttemptAt,
      lastError: objectEventDeliveries.lastError,
      deliveredAt: objectEventDeliveries.deliveredAt,
      createdAt: objectEventDeliveries.createdAt,
      eventId: objectEvents.id,
      eventType: objectEvents.type,
      occurredAt: objectEvents.occurredAt,
      objectId: objectEvents.objectId,
      test: sql<boolean>`coalesce((${objectEvents.payload}->>'test')::boolean, false)`,
    })
    .from(objectEventDeliveries)
    .innerJoin(objectEvents, eq(objectEvents.id, objectEventDeliveries.eventId))
    .where(and(eq(objectEventDeliveries.subscriptionId, subscriptionId), opts.status ? eq(objectEventDeliveries.status, opts.status) : undefined))
    .orderBy(desc(objectEventDeliveries.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id, status: r.status, attempts: r.attempts, nextAttemptAt: r.nextAttemptAt, lastError: r.lastError, deliveredAt: r.deliveredAt, createdAt: r.createdAt,
    event: { id: r.eventId, type: r.eventType, occurredAt: r.occurredAt, objectId: r.objectId, test: r.test },
  }));
}

/** Gives a `dead` delivery a fresh start (due now, attempts back to 0). Only a dead one: a delivery still being retried is left alone. */
export async function retryDeadDelivery(deliveryId: string, now: Date = new Date()): Promise<'queued' | 'not-dead' | 'not-found'> {
  const db = getDb();
  const rows = await db
    .update(objectEventDeliveries)
    .set({ status: 'pending', attempts: 0, nextAttemptAt: now, lastError: null })
    .where(and(eq(objectEventDeliveries.id, deliveryId), eq(objectEventDeliveries.status, 'dead')))
    .returning({ id: objectEventDeliveries.id });
  if (rows.length) return 'queued';
  const [exists] = await db.select({ id: objectEventDeliveries.id }).from(objectEventDeliveries).where(eq(objectEventDeliveries.id, deliveryId)).limit(1);
  return exists ? 'not-dead' : 'not-found';
}
