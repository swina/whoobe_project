import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });

// Needs a DISPOSABLE database, see object-events-records.integration.test.ts.
const url = process.env.PORTABILITY_TEST_DATABASE_URL;

describe.skipIf(!url)('object events loop guard: end of flow header and circuit breaker', () => {
  let db: typeof import('./client.js');
  let sql: any;
  let ev: typeof import('./object-events-records.js');
  let pure: typeof import('./object-events.js');
  let schema: typeof import('./object-events-schema.js');
  let objects: typeof import('./data-objects-records.js');
  let classes: typeof import('./data-classes-records.js');
  let row: import('./data-objects-records.js').DataObjectRecord;
  let t0: number;
  let n = 0;

  const sub = async (over: Record<string, unknown> = {}) => {
    const [s] = await db.getDb().insert(schema.objectEventSubscriptions).values({ name: `s-${Math.random()}`, events: ['object.updated'], ...over } as any).returning();
    return s;
  };
  /** An `object.updated` n seconds after t0, by the given actor, on `row` (or another record). */
  const updated = (actor: import('./object-events.js').EventActor, at: number, after = row, endOfFlow = false) =>
    pure.buildEvent({ type: 'object.updated', changed: ['notes'] }, { after, actor, endOfFlow, now: new Date(t0 + at * 1000) });
  const statuses = async (subId?: string) =>
    (await db.getDb().select().from(schema.objectEventDeliveries)).filter((d) => !subId || d.subscriptionId === subId).map((d) => d.status);
  const client = (id: string) => ({ type: 'api-client' as const, id });

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
    const cls = await classes.createDataClass({ name: 'A', label: 'A', fields: [{ name: 'notes', title: 'Notes', type: 'text' }] as any });
    row = await objects.createDataObject({ classId: cls.id, key: `a${++n}`, attributes: { notes: 'x' } });
    t0 = Date.now() - 10_000;
  });

  it('a write marked end of flow is kept, listed as stopped with the reason, and sends nothing', async () => {
    const s = await sub();
    expect(await ev.insertEvent(db.getDb(), updated(client('c1'), 0, row, true))).toBe(0);
    const [d] = await db.getDb().select().from(schema.objectEventDeliveries);
    expect(d).toMatchObject({ status: 'stopped', subscriptionId: s.id });
    expect(d.lastError).toMatch(/X-Whoobe-Flow: stop/);
    const [stored] = await db.getDb().select().from(schema.objectEvents);
    expect((stored.payload as any).endOfFlow).toBe(true);
    expect(await ev.claimDueDeliveries(10)).toEqual([]);
  });

  it('the 6th event of one API client on one record in the window is stopped, the first five are queued', async () => {
    await sub();
    for (let i = 0; i < 5; i++) expect(await ev.insertEvent(db.getDb(), updated(client('c1'), i))).toBe(1);
    expect(await ev.insertEvent(db.getDb(), updated(client('c1'), 5))).toBe(0);
    expect(await statuses()).toEqual(['pending', 'pending', 'pending', 'pending', 'pending', 'stopped']);
    const stopped = (await db.getDb().select().from(schema.objectEventDeliveries)).find((d) => d.status === 'stopped');
    expect(stopped?.lastError).toMatch(/^loop guard: more than 5 events by this API client/);
  });

  it('events older than the window do not count', async () => {
    await sub();
    for (let i = 0; i < 5; i++) await ev.insertEvent(db.getDb(), updated(client('c1'), -120 + i));
    expect(await ev.insertEvent(db.getDb(), updated(client('c1'), 0))).toBe(1);
  });

  it('another record, another client, a person: never stopped by someone else\'s burst', async () => {
    await sub();
    const other = await objects.createDataObject({ classId: row.classId, key: `b${++n}`, attributes: { notes: 'y' } });
    for (let i = 0; i < 5; i++) await ev.insertEvent(db.getDb(), updated(client('c1'), i));
    expect(await ev.insertEvent(db.getDb(), updated(client('c1'), 5, other))).toBe(1);   // other record
    expect(await ev.insertEvent(db.getDb(), updated(client('c2'), 5))).toBe(1);          // other client
    for (let i = 0; i < 8; i++) expect(await ev.insertEvent(db.getDb(), updated({ type: 'user', id: 'u1' }, 6 + i * 0.1))).toBe(1);   // people are never counted
  });

  it('end-of-flow writes do not use up the budget of the client', async () => {
    await sub();
    for (let i = 0; i < 8; i++) await ev.insertEvent(db.getDb(), updated(client('c1'), i, row, true));
    expect(await ev.insertEvent(db.getDb(), updated(client('c1'), 9))).toBe(1);
  });

  it('several flows answering each other are stopped by the per-subscription counter although each client is under its own limit', async () => {
    const s = await sub();
    let queued = 0;
    for (let i = 0; i < 16; i++) queued += await ev.insertEvent(db.getDb(), updated(client(`c${i % 4}`), i * 0.5));
    expect(queued).toBe(12);
    expect((await statuses(s.id)).filter((x) => x === 'stopped')).toHaveLength(4);
  });

  it('OBJECT_EVENTS_LOOP_MAX=0 switches the per-client counter off', async () => {
    process.env.OBJECT_EVENTS_LOOP_MAX = '0'; process.env.OBJECT_EVENTS_LOOP_SUB_MAX = '0';
    try {
      await sub();
      for (let i = 0; i < 10; i++) expect(await ev.insertEvent(db.getDb(), updated(client('c1'), i))).toBe(1);
    } finally { delete process.env.OBJECT_EVENTS_LOOP_MAX; delete process.env.OBJECT_EVENTS_LOOP_SUB_MAX; }
  });

  it('updateDataObject with endOfFlow keeps the event and starts nothing; without it the subscription is started', async () => {
    await sub();
    await objects.updateDataObject(row.id, { attributes: { notes: 'one' } }, { actor: client('c1'), endOfFlow: true });
    await objects.updateDataObject(row.id, { attributes: { notes: 'two' } }, { actor: client('c1') });
    expect(await statuses()).toEqual(['stopped', 'pending']);
  });
});
