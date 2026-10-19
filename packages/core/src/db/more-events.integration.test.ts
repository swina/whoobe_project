import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });

// Needs a DISPOSABLE database, see object-events-records.integration.test.ts.
const url = process.env.PORTABILITY_TEST_DATABASE_URL;

describe.skipIf(!url)('events of assets and pages: the outbox, who matches, the loop guard', () => {
  let db: typeof import('./client.js');
  let sql: any;
  let ev: typeof import('./object-events-records.js');
  let pure: typeof import('./object-events.js');
  let schema: typeof import('./object-events-schema.js');
  let assets: typeof import('./asset-records.js');
  let pages: typeof import('./whoobe-pages-records.js');
  let objects: typeof import('./data-objects-records.js');
  let classes: typeof import('./data-classes-records.js');
  let classId = '';
  let n = 0;

  const sub = async (events: string[], over: Record<string, unknown> = {}) => {
    const [s] = await db.getDb().insert(schema.objectEventSubscriptions).values({ name: `s-${Math.random()}`, events, ...over } as any).returning();
    return s;
  };
  const stored = async () => (await db.getDb().select().from(schema.objectEvents)).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const types = async () => (await stored()).map((e) => e.type);
  const file = (path: string, over: Record<string, unknown> = {}) => ({
    pimcorePath: path, filename: path.split('/').pop()!, folderPath: path.slice(0, path.lastIndexOf('/')) || '/', sizeBytes: 10, mimeType: 'text/plain', fileType: 'document', s3Key: `k${path}`, isPublic: false, ...over,
  });
  const actor = { type: 'user' as const, id: 'u1' };

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = await import('./client.js');
    await (await import('./bootstrap.js')).runMigrations();
    sql = (await import('drizzle-orm')).sql;
    ev = await import('./object-events-records.js');
    pure = await import('./object-events.js');
    schema = await import('./object-events-schema.js');
    assets = await import('./asset-records.js');
    pages = await import('./whoobe-pages-records.js');
    objects = await import('./data-objects-records.js');
    classes = await import('./data-classes-records.js');
  });
  afterAll(async () => { await db?.closeDb(); });
  beforeEach(async () => {
    for (const t of ['object_event_deliveries', 'object_events', 'object_event_subscriptions', 'assets', 'folders', 'whoobe_pages', 'data_objects', 'data_classes']) {
      await db.getDb().execute(sql.raw(`TRUNCATE TABLE "${t}" CASCADE`));
    }
    classId = (await classes.createDataClass({ name: 'A', label: 'A', fields: [{ name: 'notes', title: 'Notes', type: 'text' }] as any })).id;
    delete process.env.OBJECT_EVENTS_ENABLED;
  });

  it('a new path is asset.created, a second upload to it asset.updated with the next version; the event is in the outbox with no class', async () => {
    const s = await sub(['asset.created', 'asset.updated']);
    const a = await assets.upsertAssetRecord(file('/docs/a.txt'), { actor });
    const b = await assets.upsertAssetRecord(file('/docs/a.txt', { sizeBytes: 99 }), { actor });
    expect(b.version).toBe(2);
    const events = await stored();
    expect(events.map((e) => e.type)).toEqual(['asset.created', 'asset.updated']);
    expect(events[0]).toMatchObject({ classId: null, subjectType: 'asset', objectId: a.id, actorType: 'user', actorId: 'u1' });
    expect((events[1].payload as any).asset).toMatchObject({ id: a.id, path: '/docs/a.txt', sizeBytes: 99, version: 2 });
    const deliveries = await db.getDb().select().from(schema.objectEventDeliveries);
    expect(deliveries.map((d) => [d.subscriptionId, d.status])).toEqual([[s.id, 'pending'], [s.id, 'pending']]);
  });

  it('is stored only when a subscription wants the type, and never for a silent write', async () => {
    await assets.upsertAssetRecord(file('/docs/none.txt'));
    expect(await types()).toEqual([]);
    await sub(['asset.created']);
    await assets.upsertAssetRecord(file('/docs/b.txt'), { silent: true });
    expect(await types()).toEqual([]);
    await assets.upsertAssetRecord(file('/docs/c.txt'));
    expect(await types()).toEqual(['asset.created']);
    await assets.upsertAssetRecord(file('/docs/c.txt', { sizeBytes: 5 }));   // asset.updated: not listed, so not stored
    expect(await types()).toEqual(['asset.created']);
  });

  it('only a subscription for every class receives it: one pinned to a class gets none, and an asset-only one gets no object event', async () => {
    const pinned = await sub(['object.created'], { classId });
    const all = await sub(['asset.created', 'object.created']);
    const assetsOnly = await sub(['asset.created']);
    await assets.upsertAssetRecord(file('/docs/p.txt'));
    const bySub = async (id: string) => (await db.getDb().select().from(schema.objectEventDeliveries)).filter((d) => d.subscriptionId === id).length;
    expect([await bySub(pinned.id), await bySub(all.id), await bySub(assetsOnly.id)]).toEqual([0, 1, 1]);
    await objects.createDataObject({ classId, key: 'o1', attributes: { notes: 'x' } });
    expect([await bySub(pinned.id), await bySub(all.id), await bySub(assetsOnly.id)]).toEqual([1, 2, 1]);
  });

  it('a move is ONE asset.moved with the old path, not a delete and a create', async () => {
    await sub(['asset.created', 'asset.moved', 'asset.deleted']);
    const a = await assets.upsertAssetRecord(file('/old/m.txt'), { silent: true });
    const moved = await assets.moveAssetRecord('/old/m.txt', file('/new/m.txt'), { actor });
    expect(await types()).toEqual(['asset.moved']);
    expect(((await stored())[0].payload as any)).toMatchObject({ from: { path: '/old/m.txt' }, asset: { path: '/new/m.txt', folder: '/new' } });
    expect(await assets.getAssetByPath('/old/m.txt')).toBeNull();
    expect((await assets.getAssetByPath('/new/m.txt'))?.id).toBe(moved.id);
    expect(a.id).not.toBe(moved.id);
  });

  it('a delete is asset.deleted; a folder of up to ten files gives one each, a bigger folder ONE asset.bulk', async () => {
    await sub(['asset.deleted', 'asset.bulk']);
    await assets.upsertAssetRecord(file('/one/a.txt'), { silent: true });
    await assets.deleteAssetRecord('/one/a.txt', { actor });
    expect(await types()).toEqual(['asset.deleted']);

    for (let i = 0; i < 3; i++) await assets.upsertAssetRecord(file(`/small/f${i}.txt`), { silent: true });
    await assets.deleteFolderRecord('/small', { actor });
    expect((await types()).filter((t) => t === 'asset.deleted')).toHaveLength(4);

    for (let i = 0; i < 11; i++) await assets.upsertAssetRecord(file(`/big/f${i}.txt`), { silent: true });
    await assets.deleteFolderRecord('/big', { actor });
    const bulk = (await stored()).filter((e) => e.type === 'asset.bulk');
    expect(bulk).toHaveLength(1);
    expect((bulk[0].payload as any).bulk).toMatchObject({ kind: 'delete', count: 11 });
    expect((await types()).filter((t) => t === 'asset.deleted')).toHaveLength(4);   // no per-file events for the big one
    expect(bulk[0].objectId).toBeNull();
  });

  it('page.published when the flag turns on, page.unpublished when it turns off, nothing when it does not change or the write is silent', async () => {
    await sub(['page.published', 'page.unpublished']);
    const page = await pages.createWhoobePage({ slug: 'about', title: 'About', content: {} } as any);
    await pages.updateWhoobePage(page.id, { title: 'About us' }, { actor });                 // not the flag
    expect(await types()).toEqual([]);
    await pages.updateWhoobePage(page.id, { published: true }, { actor });
    await pages.updateWhoobePage(page.id, { published: true, title: 'About again' }, { actor });   // already published
    await pages.updateWhoobePage(page.id, { published: false }, { actor });
    await pages.updateWhoobePage(page.id, { published: true }, { silent: true });
    expect(await types()).toEqual(['page.published', 'page.unpublished']);
    const [first] = await stored();
    expect(first).toMatchObject({ classId: null, subjectType: 'page', objectId: page.id, locale: 'en' });
    expect((first.payload as any).page).toMatchObject({ id: page.id, slug: 'about', published: true });
    expect(JSON.stringify(first.payload)).not.toContain('About');
  });

  it('the loop guard counts an API client on a file like on an object: the 6th event is stopped, the end of a flow sends nothing', async () => {
    const s = await sub(['asset.updated']);
    const a = await assets.upsertAssetRecord(file('/loop/a.txt'), { silent: true });
    const summary = pure.summariseAsset(a);
    const client = { type: 'api-client' as const, id: 'c1' };
    const t0 = Date.now() - 10_000;
    const updated = (i: number, endOfFlow = false) => pure.buildAssetEvent('asset.updated', summary, { actor: client, endOfFlow, now: new Date(t0 + i * 1000) });
    for (let i = 0; i < 5; i++) expect(await ev.insertEvent(db.getDb(), updated(i))).toBe(1);
    expect(await ev.insertEvent(db.getDb(), updated(5))).toBe(0);
    const statuses = (await db.getDb().select().from(schema.objectEventDeliveries)).map((d) => d.status).sort();
    expect(statuses).toEqual(['pending', 'pending', 'pending', 'pending', 'pending', 'stopped']);
    // another file is another count; and a write that ends a flow starts nothing
    const other = await assets.upsertAssetRecord(file('/loop/b.txt'), { silent: true });
    expect(await ev.insertEvent(db.getDb(), pure.buildAssetEvent('asset.updated', pure.summariseAsset(other), { actor: client, endOfFlow: true }))).toBe(0);
    const stop = (await db.getDb().select().from(schema.objectEventDeliveries)).find((d) => d.lastError?.includes('X-Whoobe-Flow'));
    expect(stop).toMatchObject({ status: 'stopped', subscriptionId: s.id });
  });

  it('the kill switch stops these events too, and the log lists them with the subject id', async () => {
    const s = await sub(['asset.created']);
    process.env.OBJECT_EVENTS_ENABLED = '0';
    await assets.upsertAssetRecord(file('/off/a.txt'));
    expect(await types()).toEqual([]);
    delete process.env.OBJECT_EVENTS_ENABLED;
    const a = await assets.upsertAssetRecord(file('/on/a.txt'));
    const log = await ev.listDeliveries(s.id);
    expect(log).toHaveLength(1);
    expect(log[0].event).toMatchObject({ type: 'asset.created', objectId: a.id, test: false });
  });

  it('a write that fails leaves no event (same transaction)', async () => {
    await sub(['page.published']);
    const page = await pages.createWhoobePage({ slug: 'tx', title: 'Tx', content: {} } as any);
    await expect(pages.updateWhoobePage(page.id, { published: true, websiteId: '99999999-9999-4999-8999-999999999999' })).rejects.toBeTruthy();
    expect(await types()).toEqual([]);
    expect((await pages.getWhoobePage(page.id))?.published).toBe(false);
  });
});
