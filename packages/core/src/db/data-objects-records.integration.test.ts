import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });

// Characterisation of the data-object write functions BEFORE they get transactions and events (docs/plans/datamodel/object-events-phase0.md,
// step 0): what these tests pin down must stay true afterwards. Needs a DISPOSABLE database (it migrates it and empties tables):
//   docker run -d --rm --name pt -e POSTGRES_PASSWORD=pt -p 55432:5432 postgres:16-alpine
//   PORTABILITY_TEST_DATABASE_URL=postgres://postgres:pt@127.0.0.1:55432/postgres pnpm --filter @whoobe-cms/core exec vitest run --no-file-parallelism src/db/data-objects-records.integration
const url = process.env.PORTABILITY_TEST_DATABASE_URL;

describe.skipIf(!url)('data objects: create / update / delete / bulk (behaviour before object events)', () => {
  let db: typeof import('./client.js');
  let sql: any;
  let rec: typeof import('./data-objects-records.js');
  let classes: typeof import('./data-classes-records.js');
  let classId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = await import('./client.js');
    await (await import('./bootstrap.js')).runMigrations();
    sql = (await import('drizzle-orm')).sql;
    rec = await import('./data-objects-records.js');
    classes = await import('./data-classes-records.js');
  });
  afterAll(async () => { await db?.closeDb(); });
  beforeEach(async () => {
    for (const t of ['data_objects', 'data_classes']) await db.getDb().execute(sql.raw(`TRUNCATE TABLE "${t}" CASCADE`));
    const c = await classes.createDataClass({
      name: 'Article',
      label: 'Article',
      fields: [
        { name: 'title', title: 'Title', type: 'text', localized: true },
        { name: 'sku', title: 'SKU', type: 'text', localized: false, unique: true },
      ] as any,
    });
    classId = c.id;
  });

  it('create stores the row as a draft with the given attributes', async () => {
    const row = await rec.createDataObject({ classId, key: 'a', attributes: { title: 'One', sku: 'S1' } });
    expect(row).toMatchObject({ classId, key: 'a', path: '/', locale: 'en', published: false, workflowState: null, publishedAt: null });
    expect((await rec.getDataObject(row.id))?.attributes).toEqual({ title: 'One', sku: 'S1' });
  });

  it('create refuses a duplicate unique value and stores nothing', async () => {
    await rec.createDataObject({ classId, key: 'a', attributes: { title: 'One', sku: 'S1' } });
    await expect(rec.createDataObject({ classId, key: 'b', attributes: { title: 'Two', sku: 'S1' } })).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' });
    expect(await rec.listDataObjects(classId)).toHaveLength(1);
  });

  it('a new locale joins the group and pushes its non-localized values to the siblings, not the localized ones', async () => {
    const en = await rec.createDataObject({ classId, key: 'a', attributes: { title: 'One', sku: 'S1' } });
    const it_ = await rec.createDataObject({ classId, key: 'a', locale: 'it', translationGroupId: en.translationGroupId, attributes: { title: 'Uno', sku: 'S2' } });
    const rows = await rec.listDataObjectTranslations(en.translationGroupId);
    expect(rows).toHaveLength(2);
    const byLocale = Object.fromEntries(rows.map((r) => [r.locale, r.attributes]));
    expect(byLocale.en).toEqual({ title: 'One', sku: 'S2' }); // sku is shared: the later write wins on the sibling
    expect(byLocale.it).toEqual({ title: 'Uno', sku: 'S2' });
    expect(it_.translationGroupId).toBe(en.translationGroupId);
  });

  it('update changes only what is given, bumps updatedAt and sets publishedAt once', async () => {
    const row = await rec.createDataObject({ classId, key: 'a', attributes: { title: 'One', sku: 'S1' } });
    const renamed = await rec.updateDataObject(row.id, { key: 'b' });
    expect(renamed).toMatchObject({ key: 'b', published: false });
    expect(renamed!.attributes).toEqual({ title: 'One', sku: 'S1' });
    expect(renamed!.updatedAt.getTime()).toBeGreaterThanOrEqual(row.updatedAt.getTime());

    const published = await rec.updateDataObject(row.id, { published: true });
    expect(published!.published).toBe(true);
    const firstAt = published!.publishedAt!;
    expect(firstAt).toBeInstanceOf(Date);
    const again = await rec.updateDataObject(row.id, { published: true, attributes: { title: 'Two', sku: 'S1' } });
    expect(again!.publishedAt!.getTime()).toBe(firstAt.getTime());
    const off = await rec.updateDataObject(row.id, { published: false });
    expect(off!.published).toBe(false);
  });

  it('update stores the workflow state and a unique clash leaves the row as it was', async () => {
    const a = await rec.createDataObject({ classId, key: 'a', attributes: { title: 'One', sku: 'S1' } });
    const b = await rec.createDataObject({ classId, key: 'b', attributes: { title: 'Two', sku: 'S2' } });
    expect((await rec.updateDataObject(a.id, { workflowState: 'review' }))!.workflowState).toBe('review');
    await expect(rec.updateDataObject(b.id, { attributes: { title: 'Two', sku: 'S1' } })).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' });
    expect((await rec.getDataObject(b.id))!.attributes).toEqual({ title: 'Two', sku: 'S2' });
  });

  it('update of an unknown id returns null', async () => {
    expect(await rec.updateDataObject('00000000-0000-4000-8000-000000000000', { key: 'x' })).toBeNull();
  });

  it('delete removes the row; deleting an unknown id is not an error', async () => {
    const row = await rec.createDataObject({ classId, key: 'a', attributes: { title: 'One', sku: 'S1' } });
    await rec.deleteDataObject(row.id);
    expect(await rec.getDataObject(row.id)).toBeNull();
    await expect(rec.deleteDataObject(row.id)).resolves.toBeUndefined();
  });

  it('delete by class removes every row of that class and returns the count', async () => {
    await rec.createDataObject({ classId, key: 'a', attributes: { title: 'One', sku: 'S1' } });
    await rec.createDataObject({ classId, key: 'b', attributes: { title: 'Two', sku: 'S2' } });
    expect(await rec.countDataObjectsByClassId(classId)).toBe(2);
    expect(await rec.deleteDataObjectsByClassId(classId)).toBe(2);
    expect(await rec.countDataObjectsByClassId(classId)).toBe(0);
  });

  it('bulk import creates drafts, skips or updates existing keys and reports unique clashes, all in one chunk', async () => {
    await rec.createDataObject({ classId, key: 'a', attributes: { title: 'Old', sku: 'S1' } });
    const skip = await rec.bulkImportDataObjects(classId, [
      { key: 'a', attributes: { title: 'New', sku: 'S1' } },
      { key: 'b', attributes: { title: 'Two', sku: 'S2' } },
      { key: 'c', attributes: { title: 'Three', sku: 'S2' } }, // clashes with b inside the chunk
    ]);
    expect(skip).toMatchObject({ created: 1, updated: 0, skipped: 1 });
    expect(skip.rejected.map((r) => r.key)).toEqual(['c']);

    const upd = await rec.bulkImportDataObjects(classId, [{ key: 'a', attributes: { title: 'New', sku: 'S1' } }], { onConflict: 'update' });
    expect(upd).toMatchObject({ created: 0, updated: 1 });
    const a = (await rec.listDataObjects(classId)).find((r) => r.key === 'a')!;
    expect(a.attributes.title).toBe('New');
    expect(a.published).toBe(false);
  });

  it('upsert by Pimcore id inserts, then updates the same row without touching published / workflowState', async () => {
    const first = await rec.upsertDataObjectByPimcoreId({ pimcoreId: '42', classId, key: 'p', attributes: { title: 'P', sku: 'P1' } } as any);
    await rec.updateDataObject(first.id, { published: true, workflowState: 'live' });
    const second = await rec.upsertDataObjectByPimcoreId({ pimcoreId: '42', classId, key: 'p', attributes: { title: 'P2', sku: 'P1' } } as any);
    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({ published: true, workflowState: 'live' });
    expect(second.attributes.title).toBe('P2');
  });
});
