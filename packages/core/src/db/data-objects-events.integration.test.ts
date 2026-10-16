import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });

// The data-object write functions emit object events inside their transaction (object-events-phase0.md, step 3).
// Needs a DISPOSABLE database, see data-objects-records.integration.test.ts for the command.
const url = process.env.PORTABILITY_TEST_DATABASE_URL;

describe.skipIf(!url)('data objects: object events are written with the change, or not at all', () => {
  let db: typeof import('./client.js');
  let sql: any;
  let eq: any;
  let rec: typeof import('./data-objects-records.js');
  let classes: typeof import('./data-classes-records.js');
  let schema: typeof import('./object-events-schema.js');
  let classId: string;

  const events = async () => {
    const rows = await db.getDb().select().from(schema.objectEvents);
    return rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.type.localeCompare(b.type));
  };
  const types = async () => (await events()).map((e) => e.type);
  const listen = async (over: Record<string, unknown> = {}) =>
    db.getDb().insert(schema.objectEventSubscriptions).values({ name: `s-${Math.random()}`, events: ['object.created', 'object.updated', 'object.published', 'object.unpublished', 'object.deleted', 'object.transitioned', 'object.bulk'], ...over } as any).returning();

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = await import('./client.js');
    await (await import('./bootstrap.js')).runMigrations();
    const orm = await import('drizzle-orm');
    sql = orm.sql;
    eq = orm.eq;
    rec = await import('./data-objects-records.js');
    classes = await import('./data-classes-records.js');
    schema = await import('./object-events-schema.js');
  });
  afterAll(async () => { await db?.closeDb(); });
  beforeEach(async () => {
    for (const t of ['object_event_deliveries', 'object_events', 'object_event_subscriptions', 'data_objects', 'data_classes']) {
      await db.getDb().execute(sql.raw(`TRUNCATE TABLE "${t}" CASCADE`));
    }
    await db.getDb().execute(sql.raw('DROP TRIGGER IF EXISTS fail_delivery ON object_event_deliveries'));
    classId = (await classes.createDataClass({
      name: 'Article', label: 'Article',
      fields: [{ name: 'title', title: 'Title', type: 'text', localized: true }, { name: 'sku', title: 'SKU', type: 'text', localized: false }] as any,
    })).id;
  });

  it('with no subscription nothing is stored and the write is unchanged', async () => {
    await rec.createDataObject({ classId, key: 'a', attributes: { title: 'One' } });
    expect(await events()).toHaveLength(0);
  });

  it('create emits object.created with the actor and a delivery for each subscription', async () => {
    await listen();
    await listen({ events: ['object.created'] });
    const row = await rec.createDataObject({ classId, key: 'a', attributes: { title: 'One', sku: 'S1' } }, { actor: { type: 'api-client', id: 'c1' } });
    const [e] = await events();
    expect(e).toMatchObject({ type: 'object.created', objectId: row.id, classId, actorType: 'api-client', actorId: 'c1' });
    expect((e.payload as any).changed).toEqual(['sku', 'title']);
    expect(await db.getDb().select().from(schema.objectEventDeliveries)).toHaveLength(2);
  });

  it('without an actor the event says system', async () => {
    await listen();
    await rec.createDataObject({ classId, key: 'a', attributes: { title: 'One' } });
    expect((await events())[0]).toMatchObject({ actorType: 'system', actorId: null });
  });

  it('a subscription that ignores the actor gets nothing (loop guard)', async () => {
    await listen({ ignoreActors: ['engine'] });
    const row = await rec.createDataObject({ classId, key: 'a', attributes: { title: 'One' } });
    await rec.updateDataObject(row.id, { attributes: { title: 'Two' } }, { actor: { type: 'api-client', id: 'engine' } });
    expect(await types()).toEqual(['object.created']);
  });

  it('a new locale emits created, plus an update for the sibling whose shared value changed (actor system)', async () => {
    const en = await rec.createDataObject({ classId, key: 'a', attributes: { title: 'One', sku: 'S1' } });
    await listen();
    await rec.createDataObject({ classId, key: 'a', locale: 'it', translationGroupId: en.translationGroupId, attributes: { title: 'Uno', sku: 'S2' } }, { actor: { type: 'user', id: 'u1' } });
    const all = await events();
    expect(all.map((e) => e.type).sort()).toEqual(['object.created', 'object.updated']);
    const upd = all.find((e) => e.type === 'object.updated')!;
    expect(upd).toMatchObject({ objectId: en.id, locale: 'en', actorType: 'system' });
    expect((upd.payload as any).changed).toEqual(['sku']);
  });

  it('update: attributes give object.updated with names; nothing changed gives nothing', async () => {
    const row = await rec.createDataObject({ classId, key: 'a', attributes: { title: 'One', sku: 'S1' } });
    await listen();
    await rec.updateDataObject(row.id, { attributes: { title: 'Two', sku: 'S1' } });
    await rec.updateDataObject(row.id, { attributes: { title: 'Two', sku: 'S1' } });
    const all = await events();
    expect(all.map((e) => e.type)).toEqual(['object.updated']);
    expect((all[0].payload as any).changed).toEqual(['title']);
  });

  it('update: publish, workflow state and unpublish have their own events and not object.updated', async () => {
    const row = await rec.createDataObject({ classId, key: 'a', attributes: { title: 'One' } });
    await listen();
    await rec.updateDataObject(row.id, { published: true });
    await rec.updateDataObject(row.id, { workflowState: 'review' });
    await rec.updateDataObject(row.id, { published: false });
    const all = await events();
    expect(all.map((e) => e.type).sort()).toEqual(['object.published', 'object.transitioned', 'object.unpublished']);
    expect((all.find((e) => e.type === 'object.transitioned')!.payload as any).transition).toEqual({ from: null, to: 'review' });
  });

  it('update of an unknown id returns null and emits nothing', async () => {
    await listen();
    expect(await rec.updateDataObject('00000000-0000-4000-8000-000000000000', { key: 'x' })).toBeNull();
    expect(await events()).toHaveLength(0);
  });

  it('delete emits object.deleted for the row as it was; an unknown id emits nothing', async () => {
    const row = await rec.createDataObject({ classId, key: 'gone', attributes: { title: 'One' } });
    await listen();
    await rec.deleteDataObject(row.id, { actor: { type: 'user', id: 'u1' } });
    await rec.deleteDataObject(row.id);
    const all = await events();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ type: 'object.deleted', objectId: row.id, actorId: 'u1' });
    expect((all[0].payload as any).object.key).toBe('gone');
  });

  it('delete by class and bulk import each emit ONE object.bulk summary', async () => {
    await listen();
    await rec.bulkImportDataObjects(classId, [1, 2, 3].map((n) => ({ key: `k${n}`, attributes: { title: `T${n}` } })), { actor: { type: 'import' } });
    expect(await types()).toEqual(['object.bulk']);
    expect(((await events())[0].payload as any).bulk).toMatchObject({ kind: 'import', count: 3 });
    await db.getDb().delete(schema.objectEvents);
    await rec.deleteDataObjectsByClassId(classId, { actor: { type: 'user', id: 'u1' } });
    const [e] = await events();
    expect(e.type).toBe('object.bulk');
    expect((e.payload as any).bulk).toMatchObject({ kind: 'delete', count: 3 });
  });

  it('a bulk import that changes nothing emits nothing', async () => {
    await listen();
    await rec.bulkImportDataObjects(classId, []);
    expect(await events()).toHaveLength(0);
  });

  it('if the event cannot be written the data change is rolled back (create, update and delete)', async () => {
    const row = await rec.createDataObject({ classId, key: 'a', attributes: { title: 'One' } });
    await listen();
    await db.getDb().execute(sql.raw(`
      CREATE OR REPLACE FUNCTION fail_delivery_fn() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'delivery refused'; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER fail_delivery BEFORE INSERT ON object_event_deliveries FOR EACH ROW EXECUTE FUNCTION fail_delivery_fn();`));
    try {
      await expect(rec.createDataObject({ classId, key: 'b', attributes: { title: 'Two' } })).rejects.toThrow();
      await expect(rec.updateDataObject(row.id, { attributes: { title: 'Changed' } })).rejects.toThrow();
      await expect(rec.deleteDataObject(row.id)).rejects.toThrow();
      await expect(rec.bulkImportDataObjects(classId, [{ key: 'c', attributes: { title: 'C' } }])).rejects.toThrow();
    } finally {
      await db.getDb().execute(sql.raw('DROP TRIGGER fail_delivery ON object_event_deliveries'));
    }
    const rows = await rec.listDataObjects(classId);
    expect(rows.map((r) => r.key)).toEqual(['a']);
    expect(rows[0].attributes).toEqual({ title: 'One' });
    expect(await events()).toHaveLength(0);
  });

  it('OBJECT_EVENTS_ENABLED=0 writes the data and no event', async () => {
    await listen();
    process.env.OBJECT_EVENTS_ENABLED = '0';
    try {
      await rec.createDataObject({ classId, key: 'a', attributes: { title: 'One' } });
    } finally {
      delete process.env.OBJECT_EVENTS_ENABLED;
    }
    expect(await rec.listDataObjects(classId)).toHaveLength(1);
    expect(await events()).toHaveLength(0);
  });
});
