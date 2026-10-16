import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { getDb } from './client.js';
import { objectEvents, objectEventDeliveries, objectEventSubscriptions } from './object-events-schema.js';
import { getDataClass } from './data-classes-records.js';
import { buildBulkEvent, objectEventsEnabled, type BulkObjectEvent, type EventActor, type ObjectEvent } from './object-events.js';

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
