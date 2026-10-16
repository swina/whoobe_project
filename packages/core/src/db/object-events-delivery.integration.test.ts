import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });

// The delivery queue and the delivery rules (object-events-phase0.md, step 5), with a fake sender. Needs a DISPOSABLE database,
// see data-objects-records.integration.test.ts for the command.
const url = process.env.PORTABILITY_TEST_DATABASE_URL;

describe.skipIf(!url)('object events: claiming and delivering', () => {
  let db: typeof import('./client.js');
  let sql: any;
  let eq: any;
  let rec: typeof import('./object-events-records.js');
  let del: typeof import('./object-events-delivery.js');
  let pure: typeof import('./object-events.js');
  let schema: typeof import('./object-events-schema.js');
  let objects: typeof import('./data-objects-records.js');
  let classes: typeof import('./data-classes-records.js');
  let row: import('./data-objects-records.js').DataObjectRecord;
  // deliveries are created due at the database's own clock, so the test clock starts a minute after it
  const T0 = new Date(Math.floor(Date.now() / 1000) * 1000 + 60_000);

  const subscribe = async (over: Record<string, unknown> = {}) =>
    (await db.getDb().insert(schema.objectEventSubscriptions).values({ name: `s-${Math.random()}`, events: ['object.created'], ...over } as any).returning())[0];
  const publish = async (changed = ['title']) => {
    const e = pure.buildEvent({ type: 'object.created', changed }, { after: row, actor: { type: 'user', id: 'u1' }, now: T0 });
    await rec.insertEvent(db.getDb(), e);
    return e;
  };
  const delivery = async () => (await db.getDb().select().from(schema.objectEventDeliveries))[0];
  const okTarget = { ok: true as const, target: { url: 'https://engine.example/hook', method: 'POST', headers: { authorization: 'Bearer x' }, timeoutMs: 10_000 } };
  const deps = (over: Partial<import('./object-events-delivery.js').DeliveryDeps> = {}): import('./object-events-delivery.js').DeliveryDeps => ({
    resolveTarget: async () => okTarget,
    send: async () => ({ status: 200 }),
    getSecret: () => undefined,
    now: () => T0,
    ...over,
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = await import('./client.js');
    await (await import('./bootstrap.js')).runMigrations();
    const orm = await import('drizzle-orm');
    sql = orm.sql;
    eq = orm.eq;
    rec = await import('./object-events-records.js');
    del = await import('./object-events-delivery.js');
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
    const c = await classes.createDataClass({ name: 'A', label: 'A', fields: [{ name: 'title', title: 'Title', type: 'text', localized: true }] as any });
    row = await objects.createDataObject({ classId: c.id, key: 'a', attributes: { title: 'One' } });
  });

  it('claims a due delivery with its event and subscription, and leases it so a second claim gets nothing', async () => {
    const s = await subscribe();
    const e = await publish();
    const first = await rec.claimDueDeliveries(10, T0);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ attempts: 0, event: { id: e.id, type: 'object.created' }, subscription: { id: s.id } });
    expect((first[0].event.payload as any).changed).toEqual(['title']);
    expect(await rec.claimDueDeliveries(10, T0)).toHaveLength(0);
    // a worker that crashed: after the lease the delivery is offered again
    expect(await rec.claimDueDeliveries(10, new Date(T0.getTime() + rec.DELIVERY_LEASE_MS + 1000))).toHaveLength(1);
  });

  it('two workers claiming at once never take the same delivery', async () => {
    await subscribe();
    for (let i = 0; i < 6; i++) await publish();
    const [a, b] = await Promise.all([rec.claimDueDeliveries(4, T0), rec.claimDueDeliveries(4, T0)]);
    const ids = [...a, ...b].map((c) => c.deliveryId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(6);
  });

  it('respects the limit, the order and not-yet-due deliveries', async () => {
    await subscribe();
    await publish();
    await db.getDb().update(schema.objectEventDeliveries).set({ nextAttemptAt: new Date(T0.getTime() + 60_000) });
    expect(await rec.claimDueDeliveries(10, T0)).toHaveLength(0);
    expect(await rec.claimDueDeliveries(10, new Date(T0.getTime() + 61_000))).toHaveLength(1);
  });

  it('a 2xx answer marks the delivery delivered; the call carries the headers, the instance and a signature that verifies', async () => {
    process.env.SIGN_KEY_TEST = 'top-secret';
    await subscribe({ signingSecretRef: 'SIGN_KEY_TEST' });
    const e = await publish();
    const [claim] = await rec.claimDueDeliveries(1, T0);
    let seen: { target: any; body: string } | undefined;
    const out = await del.deliverClaim(claim, deps({
      instance: 'dashboard.whoobe.dev',
      getSecret: (ref) => process.env[ref],
      send: async (target, body) => { seen = { target, body }; return { status: 204 }; },
    }));
    expect(out).toBe('delivered');
    const d = await delivery();
    expect(d).toMatchObject({ status: 'delivered', attempts: 1, lastError: null });
    expect(d.deliveredAt).toBeInstanceOf(Date);
    const h = seen!.target.headers;
    expect(h).toMatchObject({ authorization: 'Bearer x', 'content-type': 'application/json', 'x-whoobe-event-id': e.id, 'x-whoobe-event-type': 'object.created' });
    expect(h['x-whoobe-signature']).toBe(pure.signBody('top-secret', h['x-whoobe-timestamp'], seen!.body));
    expect(JSON.parse(seen!.body)).toMatchObject({ id: e.id, type: 'object.created', instance: 'dashboard.whoobe.dev', changed: ['title'] });
    delete process.env.SIGN_KEY_TEST;
  });

  it('a non-2xx answer or a network error retries with the backoff and counts the attempt; the answer body is not kept', async () => {
    await subscribe();
    await publish();
    let [claim] = await rec.claimDueDeliveries(1, T0);
    expect(await del.deliverClaim(claim, deps({ send: async () => ({ status: 503 }) }))).toBe('retrying');
    let d = await delivery();
    expect(d).toMatchObject({ status: 'retrying', attempts: 1, lastError: 'the consumer answered HTTP 503' });
    expect(d.nextAttemptAt.getTime()).toBe(T0.getTime() + 60_000);

    [claim] = await rec.claimDueDeliveries(1, new Date(T0.getTime() + 61_000));
    expect(claim.attempts).toBe(1);
    expect(await del.deliverClaim(claim, deps({ now: () => new Date(T0.getTime() + 61_000), send: async () => { throw new Error('connect ECONNREFUSED'); } }))).toBe('retrying');
    d = await delivery();
    expect(d).toMatchObject({ attempts: 2 });
    expect(d.lastError).toContain('ECONNREFUSED');
    expect(d.nextAttemptAt.getTime()).toBe(T0.getTime() + 61_000 + 300_000);
  });

  it('after the last backoff the delivery is dead and is never claimed again', async () => {
    await subscribe();
    await publish();
    let now = T0;
    let outcome = '';
    for (let i = 0; i < 6; i++) {
      const [claim] = await rec.claimDueDeliveries(1, now);
      expect(claim, `attempt ${i + 1}`).toBeDefined();
      outcome = await del.deliverClaim(claim, deps({ now: () => now, send: async () => ({ status: 500 }) }));
      now = new Date(now.getTime() + 13 * 3_600_000);
    }
    expect(outcome).toBe('dead');
    expect(await delivery()).toMatchObject({ status: 'dead', attempts: 6 });
    expect(await rec.claimDueDeliveries(10, new Date(now.getTime() + 999 * 3_600_000))).toHaveLength(0);
  });

  it('a removed endpoint or route, and a GET route, are dead at once; an inactive endpoint retries', async () => {
    await subscribe();
    await publish();
    let [claim] = await rec.claimDueDeliveries(1, T0);
    expect(await del.deliverClaim(claim, deps({ resolveTarget: async () => ({ ok: false, error: 'the endpoint or the route was removed', permanent: true }) }))).toBe('dead');
    expect((await delivery()).lastError).toBe('the endpoint or the route was removed');

    await db.getDb().update(schema.objectEventDeliveries).set({ status: 'pending', attempts: 0, nextAttemptAt: T0 });
    [claim] = await rec.claimDueDeliveries(1, T0);
    expect(await del.deliverClaim(claim, deps({ resolveTarget: async () => ({ ok: true, target: { ...okTarget.target, method: 'GET' } }) }))).toBe('dead');
    expect((await delivery()).lastError).toContain('POST, PUT or PATCH');

    await db.getDb().update(schema.objectEventDeliveries).set({ status: 'pending', attempts: 0, nextAttemptAt: T0 });
    [claim] = await rec.claimDueDeliveries(1, T0);
    expect(await del.deliverClaim(claim, deps({ resolveTarget: async () => ({ ok: false, error: 'the endpoint is inactive', permanent: false }) }))).toBe('retrying');
  });

  it('a signing secret that is not set fails the attempt without sending anything', async () => {
    await subscribe({ signingSecretRef: 'NOT_SET_ANYWHERE' });
    await publish();
    const [claim] = await rec.claimDueDeliveries(1, T0);
    const send = vi.fn(async () => ({ status: 200 }));
    expect(await del.deliverClaim(claim, deps({ send }))).toBe('retrying');
    expect(send).not.toHaveBeenCalled();
    expect((await delivery()).lastError).toContain('NOT_SET_ANYWHERE');
  });

  it('a very long error is cut, and a lookup that throws becomes a retry', async () => {
    await subscribe();
    await publish();
    const [claim] = await rec.claimDueDeliveries(1, T0);
    expect(await del.deliverClaim(claim, deps({ send: async () => { throw new Error('x'.repeat(5000)); } }))).toBe('retrying');
    expect((await delivery()).lastError!.length).toBeLessThanOrEqual(300);
    await db.getDb().update(schema.objectEventDeliveries).set({ status: 'pending', attempts: 0, nextAttemptAt: T0 });
    const [again] = await rec.claimDueDeliveries(1, T0);
    expect(await del.deliverClaim(again, deps({ resolveTarget: async () => { throw new Error('db down'); } }))).toBe('retrying');
    expect((await delivery()).lastError).toContain('db down');
  });
});
