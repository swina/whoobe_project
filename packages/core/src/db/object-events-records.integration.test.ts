import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });

// Needs a DISPOSABLE database (it migrates it and empties tables), see data-objects-records.integration.test.ts for the command.
const url = process.env.PORTABILITY_TEST_DATABASE_URL;

describe.skipIf(!url)('object events outbox: one delivery per matching subscription, written with the event', () => {
  let db: typeof import('./client.js');
  let sql: any;
  let ev: typeof import('./object-events-records.js');
  let pure: typeof import('./object-events.js');
  let schema: typeof import('./object-events-schema.js');
  let objects: typeof import('./data-objects-records.js');
  let classes: typeof import('./data-classes-records.js');
  let classA: string;
  let classB: string;
  let row: import('./data-objects-records.js').DataObjectRecord;

  const sub = async (over: Record<string, unknown> = {}) => {
    const [s] = await db.getDb().insert(schema.objectEventSubscriptions).values({ name: `s-${Math.random()}`, events: ['object.created'], ...over } as any).returning();
    return s;
  };
  const created = (actor?: import('./object-events.js').EventActor) =>
    pure.buildEvent({ type: 'object.created', changed: ['title'] }, { after: row, actor });
  const deliveries = async () => db.getDb().select().from(schema.objectEventDeliveries);

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = await import('./client.js');
    await (await import('./bootstrap.js')).runMigrations();
    sql = (await import('drizzle-orm')).sql;
    ev = await import('./object-events-records.js');
    pure = await import('./object-events.js');
    schema = await import('./object-events-schema.js');
    objects = await import('./data-objects-records.js');
    classes = await import('./data-classes-records.js');
  });
  afterAll(async () => { await db?.closeDb(); });
  beforeEach(async () => {
    for (const t of ['object_event_deliveries', 'object_events', 'object_event_subscriptions', 'data_objects', 'data_classes']) {
      await db.getDb().execute(sql.raw(`TRUNCATE TABLE "${t}" CASCADE`));
    }
    classA = (await classes.createDataClass({ name: 'A', label: 'A', fields: [{ name: 'title', title: 'Title', type: 'text', localized: true }] as any })).id;
    classB = (await classes.createDataClass({ name: 'B', label: 'B', fields: [] })).id;
    row = await objects.createDataObject({ classId: classA, key: 'a', attributes: { title: 'One' } });
  });

  it('stores the event with its envelope and queues one pending delivery for a matching subscription', async () => {
    const s = await sub();
    const e = created({ type: 'user', id: 'u1' });
    expect(await ev.insertEvent(db.getDb(), e)).toBe(1);
    const [stored] = await db.getDb().select().from(schema.objectEvents);
    expect(stored).toMatchObject({ id: e.id, type: 'object.created', classId: classA, objectId: row.id, translationGroupId: row.translationGroupId, locale: 'en', actorType: 'user', actorId: 'u1' });
    expect((stored.payload as any).changed).toEqual(['title']);
    const [d] = await deliveries();
    expect(d).toMatchObject({ eventId: e.id, subscriptionId: s.id, status: 'pending', attempts: 0 });
    expect(d.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('queues nothing for a disabled subscription, another class, another event type or an ignored actor, but still stores the event', async () => {
    await sub({ enabled: false });
    await sub({ classId: classB });
    await sub({ events: ['object.deleted'] });
    await sub({ ignoreActors: ['engine-client'] });
    const e = created({ type: 'api-client', id: 'engine-client' });
    expect(await ev.insertEvent(db.getDb(), e)).toBe(0);
    expect(await deliveries()).toHaveLength(0);
    expect(await db.getDb().select().from(schema.objectEvents)).toHaveLength(1);
  });

  it('matches a subscription for all classes and one for exactly this class; an actor that is not ignored still matches', async () => {
    await sub();
    await sub({ classId: classA, ignoreActors: ['someone-else'] });
    expect(await ev.insertEvent(db.getDb(), created({ type: 'user', id: 'u1' }))).toBe(2);
  });

  it('a repeated insert of the same event changes nothing', async () => {
    await sub();
    const e = created();
    await ev.insertEvent(db.getDb(), e);
    expect(await ev.insertEvent(db.getDb(), e)).toBe(0);
    expect(await db.getDb().select().from(schema.objectEvents)).toHaveLength(1);
    expect(await deliveries()).toHaveLength(1);
  });

  it('a subscription created afterwards does not receive an old event', async () => {
    await ev.insertEvent(db.getDb(), created());
    await sub();
    expect(await deliveries()).toHaveLength(0);
  });

  it('a bulk summary has no object and matches by class', async () => {
    await sub({ events: ['object.bulk'] });
    const e = pure.buildBulkEvent({ classId: classA, kind: 'import', count: 3, ids: [row.id], actor: { type: 'import' } });
    expect(await ev.insertEvent(db.getDb(), e)).toBe(1);
    const [stored] = await db.getDb().select().from(schema.objectEvents);
    expect(stored).toMatchObject({ type: 'object.bulk', objectId: null, locale: null, actorType: 'import' });
  });

  it('rolls back with the surrounding transaction: no event, no delivery', async () => {
    await sub();
    await expect(
      db.getDb().transaction(async (tx) => {
        await ev.insertEvent(tx, created());
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await db.getDb().select().from(schema.objectEvents)).toHaveLength(0);
    expect(await deliveries()).toHaveLength(0);
  });

  it('deleting a subscription removes its deliveries; deleting a class keeps the event (no foreign key)', async () => {
    const s = await sub();
    await ev.insertEvent(db.getDb(), created());
    await classes.deleteDataClass(classA);
    expect(await db.getDb().select().from(schema.objectEvents)).toHaveLength(1);
    await db.getDb().delete(schema.objectEventSubscriptions).where((await import('drizzle-orm')).eq(schema.objectEventSubscriptions.id, s.id));
    expect(await deliveries()).toHaveLength(0);
  });
});
