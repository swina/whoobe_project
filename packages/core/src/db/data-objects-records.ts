import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { getDb } from './client.js';
import { dataObjects } from './data-objects-schema.js';
import { getDataClass, type DataClassRecord } from './data-classes-records.js';
import { indexObject, deleteIndexedByDocument, deleteIndexedByClass } from '../search/indexer.js';
import { insertEvent } from './object-events-records.js';
import { buildBulkEvent, buildEvent, changedFields, classifyUpdate, type EventActor } from './object-events.js';

export interface DataObjectRecord {
  id: string;
  classId: string;
  key: string;
  path: string;
  parentId: string | null;
  translationGroupId: string;
  locale: string;
  published: boolean;
  workflowState: string | null;
  attributes: Record<string, unknown>;
  pimcoreId: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Optionally scoped to one class - ObjectsView.vue's own class filter
 * (see docs/plans/datamodel/advanced-data-modeling-plan.md §6.2). */
export async function listDataObjects(classId?: string): Promise<DataObjectRecord[]> {
  const db = getDb();
  const query = db.select().from(dataObjects).orderBy(desc(dataObjects.createdAt));
  if (classId) return query.where(eq(dataObjects.classId, classId));
  return query;
}

export async function getDataObject(id: string): Promise<DataObjectRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(dataObjects).where(eq(dataObjects.id, id)).limit(1);
  return row ?? null;
}

/**
 * The one, shared place every public-facing query MUST go through - see
 * docs/plans/backend/object-publish-workflow-plan.md §2.2 ("a
 * `publicObjectsQuery()` helper... not left to each resolver to remember
 * individually - a forgotten filter in one resolver is a real data
 * leak"). Never returns an unpublished object, full stop - `core-api`'s
 * own `/public/data-objects*` routes (the only real public surface today)
 * call this and nothing else; any future public-facing consumer of Data
 * Objects must too, not re-derive its own `WHERE published = true`.
 */
export async function listPublishedDataObjects(classId?: string, locale?: string): Promise<DataObjectRecord[]> {
  const db = getDb();
  const conditions = [eq(dataObjects.published, true)];
  if (classId) conditions.push(eq(dataObjects.classId, classId));
  if (locale) conditions.push(eq(dataObjects.locale, locale));
  return db
    .select()
    .from(dataObjects)
    .where(and(...conditions))
    .orderBy(desc(dataObjects.publishedAt));
}

/**
 * Query data objects with optional field-level filters, ordering, offset
 * and limit. Filters/ordering are applied in JS against a fetched-in-full
 * row set (not pushed to SQL) - this avoids building dynamic JSONB SQL for
 * arbitrary attribute fields, matching the same "fetch everything, process
 * in JS" convention apps/admin-dashboard's ObjectsView.vue/AssetsView.vue
 * already use over this same record shape.
 */
export interface DataObjectQueryFilter {
  field: string;
  operator: 'eq' | 'neq' | 'contains' | 'gt' | 'lt';
  value: unknown;
}

export interface DataObjectQueryOrderBy {
  field: string;
  direction: 'asc' | 'desc';
}

export interface DataObjectQueryOptions {
  filters?: DataObjectQueryFilter[];
  orderBy?: DataObjectQueryOrderBy | null;
  offset?: number;
  limit?: number;
  locale?: string;
}

// published/workflowState/updatedAt used to be sort-only (see the removed
// comment this replaced) - promoted to real filter fields too, so Dynamic
// Query's filter-condition picker (DataObjectPicker.vue) can build
// conditions like "workflowState eq published" against actual server-side
// results, not just offer them as inert dropdown options. createdAt/
// publishedAt remain sort-only - nothing in the UI exposes them as
// filter/binding fields, so there's no matching gap to close for those two.
const TOP_LEVEL_FILTER_FIELDS = new Set([
  'key', 'path', 'locale', 'id', 'classId', 'pimcoreId', 'translationGroupId',
  'published', 'workflowState', 'updatedAt',
]);

const TOP_LEVEL_SORT_FIELDS = new Set([
  ...TOP_LEVEL_FILTER_FIELDS,
  'createdAt',
  'publishedAt',
]);

function getFieldValue(obj: DataObjectRecord, field: string): unknown {
  return TOP_LEVEL_FILTER_FIELDS.has(field) ? (obj as any)[field] : (obj.attributes as any)?.[field];
}

export function getSortValue(obj: DataObjectRecord, field: string): unknown {
  return TOP_LEVEL_SORT_FIELDS.has(field) ? (obj as any)[field] : (obj.attributes as any)?.[field];
}

function matchFilter(obj: DataObjectRecord, f: DataObjectQueryFilter): boolean {
  const value = getFieldValue(obj, f.field);
  switch (f.operator) {
    case 'eq': return value === f.value;
    case 'neq': return value !== f.value;
    case 'contains': return String(value ?? '').toLowerCase().includes(String(f.value ?? '').toLowerCase());
    case 'gt': return compareGT(value, f.value);
    case 'lt': return compareLT(value, f.value);
    default: return true;
  }
}

function compareGT(value: unknown, filterValue: unknown): boolean {
  // Numeric comparison
  const nv = Number(value);
  const nf = Number(filterValue);
  if (!isNaN(nv) && !isNaN(nf)) return nv > nf;
  // Date string comparison
  const dv = new Date(value as any);
  const df = new Date(filterValue as any);
  if (!isNaN(dv.getTime()) && !isNaN(df.getTime())) return dv.getTime() > df.getTime();
  return false;
}

function compareLT(value: unknown, filterValue: unknown): boolean {
  const nv = Number(value);
  const nf = Number(filterValue);
  if (!isNaN(nv) && !isNaN(nf)) return nv < nf;
  const dv = new Date(value as any);
  const df = new Date(filterValue as any);
  if (!isNaN(dv.getTime()) && !isNaN(df.getTime())) return dv.getTime() < df.getTime();
  return false;
}

/** Same numeric-then-date-then-string coercion order as compareGT/compareLT,
 *  so "order by X asc/desc" and "filter X gt/lt" agree on what "greater"
 *  means for the same field. */
export function compareSortValues(a: unknown, b: unknown): number {
  const na = Number(a);
  const nb = Number(b);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  const da = new Date(a as any).getTime();
  const db_ = new Date(b as any).getTime();
  if (!isNaN(da) && !isNaN(db_)) return da - db_;
  return String(a).localeCompare(String(b));
}

/** Nulls always sort last regardless of direction. */
export function sortDataObjects(rows: DataObjectRecord[], orderBy: DataObjectQueryOrderBy): DataObjectRecord[] {
  return [...rows].sort((a, b) => {
    const va = getSortValue(a, orderBy.field);
    const vb = getSortValue(b, orderBy.field);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    const cmp = compareSortValues(va, vb);
    return orderBy.direction === 'asc' ? cmp : -cmp;
  });
}

async function queryDataObjectsInternal(
  classId: string,
  publishedOnly: boolean,
  defaultOrderField: 'createdAt' | 'publishedAt',
  options: DataObjectQueryOptions = {}
): Promise<DataObjectRecord[]> {
  const db = getDb();
  const conditions = [eq(dataObjects.classId, classId)];
  if (publishedOnly) conditions.push(eq(dataObjects.published, true));
  if (options.locale) conditions.push(eq(dataObjects.locale, options.locale));

  // No SQL LIMIT here - deliberately unbounded (matches ObjectsView.vue/
  // AssetsView.vue's own no-cap convention, and data-resolver.ts's query-
  // binding path already called this with no limit before this change, so
  // this isn't a new scaling regression). The SQL ORDER BY below is just a
  // stable base fetch order; the real, authoritative order is always
  // recomputed in JS afterward so it can honor filters/attributes and the
  // caller's own orderBy, which SQL can't see without dynamic JSONB
  // expressions this codebase doesn't otherwise build.
  const rows = await db
    .select()
    .from(dataObjects)
    .where(and(...conditions))
    .orderBy(defaultOrderField === 'createdAt' ? desc(dataObjects.createdAt) : desc(dataObjects.publishedAt));

  const filtered = options.filters && options.filters.length > 0
    ? rows.filter((obj) => options.filters!.every((f) => matchFilter(obj, f)))
    : rows;

  // Always apply an effective order (caller's, or the same default this
  // code already hardcoded before this change) so offset/limit stay
  // deterministic - Postgres gives no row-order guarantee without one.
  const effectiveOrderBy: DataObjectQueryOrderBy = options.orderBy ?? { field: defaultOrderField, direction: 'desc' };
  const sorted = sortDataObjects(filtered, effectiveOrderBy);

  const offset = typeof options.offset === 'number' && options.offset > 0 ? options.offset : 0;
  const limit = typeof options.limit === 'number' && options.limit > 0 ? options.limit : undefined;
  return limit !== undefined ? sorted.slice(offset, offset + limit) : sorted.slice(offset);
}

/** Admin query (no published filter) - used by the editor's data-resolver.
 *  Returns objects regardless of published status. */
export async function queryDataObjects(classId: string, options?: DataObjectQueryOptions): Promise<DataObjectRecord[]> {
  return queryDataObjectsInternal(classId, false, 'createdAt', options);
}

/** Public query - only returns published objects. */
export async function queryPublishedDataObjects(classId: string, options?: DataObjectQueryOptions): Promise<DataObjectRecord[]> {
  return queryDataObjectsInternal(classId, true, 'publishedAt', options);
}

/** Same `published = true` gate as `listPublishedDataObjects` - a single
 * object lookup returns `null` identically whether the id doesn't exist
 * at all or exists but isn't published, so the public API never leaks
 * "this exists but is a draft" through a different error shape. */
export async function getPublishedDataObject(id: string): Promise<DataObjectRecord | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(dataObjects)
    .where(and(eq(dataObjects.id, id), eq(dataObjects.published, true)))
    .limit(1);
  return row ?? null;
}

/** Batch-fetch multiple data objects by id (authenticated, returns
 *  regardless of published status). Used by the batch API endpoint
 *  for efficient multi-binding resolution. */
export async function getDataObjectsByIds(ids: string[]): Promise<DataObjectRecord[]> {
  if (ids.length === 0) return [];
  const db = getDb();
  return db
    .select()
    .from(dataObjects)
    .where(inArray(dataObjects.id, ids))
    .orderBy(desc(dataObjects.createdAt));
}

/** Batch-fetch published data objects by id. Returns only published
 *  objects; missing or unpublished ids are silently omitted (no error,
 *  same policy as getPublishedDataObject). */
export async function getPublishedDataObjectsByIds(ids: string[]): Promise<DataObjectRecord[]> {
  if (ids.length === 0) return [];
  const db = getDb();
  return db
    .select()
    .from(dataObjects)
    .where(and(inArray(dataObjects.id, ids), eq(dataObjects.published, true)))
    .orderBy(desc(dataObjects.publishedAt));
}

/** Every locale variant of the same logical object, for a translations
 * picker/switcher - same role listWhoobePageTranslations plays for pages. */
export async function listDataObjectTranslations(translationGroupId: string): Promise<DataObjectRecord[]> {
  const db = getDb();
  return db.select().from(dataObjects).where(eq(dataObjects.translationGroupId, translationGroupId));
}

/** Looked up by `pimcoreId` alone (globally unique across every class,
 * not just within one - real Pimcore object ids are one global sequence
 * across the whole `objects` tree, confirmed against a live install) -
 * packages/migration-tool's own relation resolver uses this to find
 * whether a relation's target has already been migrated. */
export async function getDataObjectByPimcoreId(pimcoreId: string): Promise<DataObjectRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(dataObjects).where(eq(dataObjects.pimcoreId, pimcoreId)).limit(1);
  return row ?? null;
}

/**
 * A "not localized" field is supposed to mean one shared value across
 * every locale of the same logical record - but each locale still lives
 * as its own full row (§4.4 of advanced-data-modeling-plan.md), edited
 * and saved independently, so without this a non-localized field's value
 * only ever actually changes in whichever single locale row happened to
 * be open when it was edited, silently drifting from its siblings. Called
 * after a real attribute write (create or update) to push that row's own
 * non-localized field values out to every other row in the same
 * `translationGroupId`, so editing one locale's copy of e.g. a shared
 * `asset`/`image` field is immediately visible in every other locale too.
 *
 * Deliberately NOT called from `upsertDataObjectByPimcoreId` (the
 * migration re-run path) - a real, found-in-practice case documented in
 * advanced-data-modeling-plan.md's own Phase 4 notes is that a "non-
 * localized" *relation* field can legitimately resolve to a different
 * real id per locale during migration (each locale's own resolved
 * sibling target), which this sync would incorrectly stomp back to one
 * shared value. That's a property of how Pimcore's source data resolves
 * through the migration converter, not of what "non-localized" should
 * mean for ongoing admin edits through this system - scoped accordingly.
 */
async function syncNonLocalizedAttributes(
  row: DataObjectRecord,
  runner: Db | Tx = getDb(),
  knownClass?: DataClassRecord | null,
): Promise<{ before: DataObjectRecord; after: DataObjectRecord }[]> {
  const dataClass = knownClass === undefined ? await getDataClass(row.classId) : knownClass;
  if (!dataClass) return [];
  const nonLocalizedNames = dataClass.fields.filter((f) => !f.localized).map((f) => f.name);
  if (nonLocalizedNames.length === 0) return [];

  const siblings = await runner
    .select()
    .from(dataObjects)
    .where(eq(dataObjects.translationGroupId, row.translationGroupId));

  const touched: { before: DataObjectRecord; after: DataObjectRecord }[] = [];
  for (const sibling of siblings) {
    if (sibling.id === row.id) continue;
    const nextAttributes: Record<string, unknown> = { ...sibling.attributes };
    let changed = false;
    for (const name of nonLocalizedNames) {
      if (JSON.stringify(nextAttributes[name]) !== JSON.stringify(row.attributes[name])) {
        nextAttributes[name] = row.attributes[name];
        changed = true;
      }
    }
    if (changed) {
      const [after] = await runner.update(dataObjects).set({ attributes: nextAttributes, updatedAt: new Date() }).where(eq(dataObjects.id, sibling.id)).returning();
      if (after) touched.push({ before: sibling, after });
    }
  }
  return touched;
}

/** Who made a write, for the object events (the loop guard of a subscription ignores some actors). A caller that says nothing is `system`. */
export interface WriteOptions {
  actor?: EventActor;
  /** Emit no event for this write: for a caller that is bulk by nature (a bundle import, the migration) and sends ONE summary itself (`emitBulkSummary`). */
  silent?: boolean;
}

/** The events of one update: its own (updated / transitioned / published) and one `object.updated` per language sibling the non-localized sync touched. */
async function emitUpdateEvents(
  tx: Tx,
  before: DataObjectRecord,
  after: DataObjectRecord,
  touched: { before: DataObjectRecord; after: DataObjectRecord }[],
  actor: EventActor | undefined,
  className: string | undefined,
): Promise<void> {
  for (const draft of classifyUpdate(before, after)) await insertEvent(tx, buildEvent(draft, { after, actor, className }));
  for (const t of touched) {
    for (const draft of classifyUpdate(t.before, t.after)) await insertEvent(tx, buildEvent(draft, { after: t.after, actor: { type: 'system' }, className }));
  }
}

// ---- `unique` fields ----

/** Thrown when a `unique` field would hold a value another object already has. `code` is checked instead of `instanceof` (several packages). */
export class UniqueViolationError extends Error {
  readonly code = 'UNIQUE_VIOLATION';
  constructor(readonly field: string, readonly title: string, readonly value: unknown) {
    super(`"${title || field}" must be unique: another object already has the value ${JSON.stringify(value)}`);
    this.name = 'UniqueViolationError';
  }
}

/** The `unique` fields of a class that carry a value in these attributes (empty values never clash). */
export function uniqueValuesToCheck(
  fields: { name: string; title?: string; unique?: boolean; localized?: boolean }[],
  attributes: Record<string, unknown>,
): { name: string; title: string; localized: boolean; value: unknown }[] {
  return fields
    .filter((f) => f.unique)
    .map((f) => ({ name: f.name, title: f.title ?? f.name, localized: !!f.localized, value: attributes[f.name] }))
    .filter((f) => f.value !== undefined && f.value !== null && f.value !== '' && !(Array.isArray(f.value) && f.value.length === 0));
}

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Throws UniqueViolationError when another object of the class has the same value in a `unique` field. `except`: the object being saved
 * (by id) and its language siblings (same translationGroupId), which never count as duplicates.
 */
async function assertUniqueValues(
  runner: Db | Tx,
  classDef: DataClassRecord,
  attributes: Record<string, unknown>,
  scope: { locale: string; exceptId?: string; exceptGroupId?: string },
): Promise<void> {
  for (const f of uniqueValuesToCheck(classDef.fields, attributes)) {
    const conditions = [
      eq(dataObjects.classId, classDef.id),
      sql`${dataObjects.attributes} @> ${JSON.stringify({ [f.name]: f.value })}::jsonb`,
    ];
    if (f.localized) conditions.push(eq(dataObjects.locale, scope.locale));
    if (scope.exceptId) conditions.push(sql`${dataObjects.id} <> ${scope.exceptId}`);
    if (scope.exceptGroupId) conditions.push(sql`${dataObjects.translationGroupId} <> ${scope.exceptGroupId}`);
    const [clash] = await runner.select({ id: dataObjects.id }).from(dataObjects).where(and(...conditions)).limit(1);
    if (clash) throw new UniqueViolationError(f.name, f.title, f.value);
  }
}

export async function createDataObject(input: {
  id?: string;
  classId: string;
  key: string;
  path?: string;
  parentId?: string | null;
  translationGroupId?: string;
  locale?: string;
  attributes: Record<string, unknown>;
  pimcoreId?: string | null;
}, opts: WriteOptions = {}): Promise<DataObjectRecord> {
  const db = getDb();
  const classDef = await getDataClass(input.classId);
  // The row, the sync of its language siblings and the events commit together; the search index is updated after the commit.
  const row = await db.transaction(async (tx) => {
    if (classDef) await assertUniqueValues(tx, classDef, input.attributes, { locale: input.locale ?? 'en', exceptGroupId: input.translationGroupId });
    const [row] = await tx
      .insert(dataObjects)
      .values({
        ...(input.id ? { id: input.id } : {}),
        classId: input.classId,
        key: input.key,
        path: input.path ?? '/',
        parentId: input.parentId ?? null,
        // Omitted entirely (not passed as undefined) when the caller has no
        // existing group to join - lets the column's own defaultRandom()
        // generate a fresh id, same convention createWhoobePage uses.
        ...(input.translationGroupId ? { translationGroupId: input.translationGroupId } : {}),
        locale: input.locale ?? 'en',
        attributes: input.attributes,
        pimcoreId: input.pimcoreId ?? null,
      })
      .returning();
    // A brand-new locale row for an object that already has sibling locale
    // rows - push this row's own non-localized values out to them too (the
    // reverse direction, pre-filling this new row from a sibling, is
    // MasterObjectTab.vue's own job client-side, so the admin sees the
    // shared value immediately rather than only after this first save).
    const touched = await syncNonLocalizedAttributes(row, tx, classDef);
    if (!opts.silent) {
      await insertEvent(tx, buildEvent({ type: 'object.created', changed: changedFields(null, row) }, { after: row, actor: opts.actor, className: classDef?.name }));
      for (const t of touched) await emitUpdateEvents(tx, t.before, t.after, [], { type: 'system' }, classDef?.name);
    }
    return row;
  });
  if (classDef) await indexObject(row, classDef);
  return row;
}

export async function updateDataObject(
  id: string,
  input: {
    key?: string;
    path?: string;
    parentId?: string | null;
    published?: boolean;
    workflowState?: string | null;
    attributes?: Record<string, unknown>;
  },
  opts: WriteOptions = {},
): Promise<DataObjectRecord | null> {
  const db = getDb();
  const done = await db.transaction(async (tx) => {
    // The row is locked while it is read, so the events describe exactly the change this call made.
    const [before] = await tx.select().from(dataObjects).where(eq(dataObjects.id, id)).for('update');
    if (!before) return null;
    const classDef = await getDataClass(before.classId);

    if (input.attributes !== undefined && classDef) {
      await assertUniqueValues(tx, classDef, input.attributes, { locale: before.locale, exceptId: before.id, exceptGroupId: before.translationGroupId });
    }

    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (input.key !== undefined) values.key = input.key;
    if (input.path !== undefined) values.path = input.path;
    if (input.parentId !== undefined) values.parentId = input.parentId;
    if (input.workflowState !== undefined) values.workflowState = input.workflowState;
    if (input.attributes !== undefined) values.attributes = input.attributes;

    if (input.published !== undefined) {
      values.published = input.published;
      // First transition into published gets a real publishedAt timestamp;
      // re-saving an already-published object never overwrites it - same
      // rule updateWhoobePage already applies.
      if (input.published && !before.publishedAt) values.publishedAt = new Date();
    }

    const [row] = await tx.update(dataObjects).set(values).where(eq(dataObjects.id, id)).returning();
    const touched = row && input.attributes !== undefined ? await syncNonLocalizedAttributes(row, tx, classDef) : [];
    if (row && !opts.silent) await emitUpdateEvents(tx, before, row, touched, opts.actor, classDef?.name);
    return row ? { row, classDef } : null;
  });
  if (!done) return null;
  if (done.classDef) await indexObject(done.row, done.classDef);
  return done.row;
}

/** Delete all data objects belonging to a class - used by the migration
 * clear-before-import option to reset a class's objects before retrying. */
export async function deleteDataObjectsByClassId(classId: string, opts: WriteOptions = {}): Promise<number> {
  const db = getDb();
  const classDef = await getDataClass(classId);
  const deleted = await db.transaction(async (tx) => {
    const rows = await tx.delete(dataObjects).where(eq(dataObjects.classId, classId)).returning({ id: dataObjects.id });
    if (rows.length && !opts.silent) {
      await insertEvent(tx, buildBulkEvent({ classId, className: classDef?.name, kind: 'delete', count: rows.length, ids: rows.map((r) => r.id), actor: opts.actor }));
    }
    return rows;
  });
  await deleteIndexedByClass(classId);
  return deleted.length;
}

/** How many objects (every locale row) a class has: the number "Empty data" asks the user to confirm. */
export async function countDataObjectsByClassId(classId: string): Promise<number> {
  const db = getDb();
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(dataObjects).where(eq(dataObjects.classId, classId));
  return row?.n ?? 0;
}

export async function deleteDataObject(id: string, opts: WriteOptions = {}): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(dataObjects).where(eq(dataObjects.id, id)).for('update');
    if (!before) return;
    await tx.delete(dataObjects).where(eq(dataObjects.id, id));
    if (opts.silent) return;
    const classDef = await getDataClass(before.classId);
    await insertEvent(tx, buildEvent({ type: 'object.deleted', changed: [] }, { after: before, actor: opts.actor, className: classDef?.name }));
  });
  await deleteIndexedByDocument('object', id);
}

/** Insert-or-update-by-`pimcoreId` - packages/migration-tool's
 * `migrate-objects` re-run path, same role `upsertWhoobePageByPimcoreId`
 * plays for pages. `published`/`workflowState` are deliberately never
 * touched by this path - a re-import must never silently unpublish (or
 * publish) an object an editor has since made an explicit call about. */
export async function upsertDataObjectByPimcoreId(input: {
  pimcoreId: string;
  classId: string;
  key: string;
  path?: string;
  locale?: string;
  translationGroupId?: string;
  attributes: Record<string, unknown>;
  /** Pimcore's own real `o_creationDate`/`o_modificationDate` (packages/
   *  migration-tool's PimcoreObjectSummary) - a migration run always
   *  carries these through rather than stamping "now" on data that's
   *  really years old, and included in the conflict-update set (not just
   *  the insert) so a re-run also corrects a value stamped wrong before
   *  this was wired up. Falls back to `now` only for a caller that
   *  genuinely has no source timestamp (e.g. the fixture adapter). This
   *  function has exactly one real caller today (runObjectMigration,
   *  packages/migration-tool/src/cli.ts) - safe to always apply both
   *  fields on conflict for that reason. */
  createdAt?: Date;
  updatedAt?: Date;
}): Promise<DataObjectRecord> {
  const db = getDb();
  const now = new Date();
  const createdAt = input.createdAt ?? now;
  const updatedAt = input.updatedAt ?? now;

  const [row] = await db
    .insert(dataObjects)
    .values({
      pimcoreId: input.pimcoreId,
      classId: input.classId,
      key: input.key,
      path: input.path ?? '/',
      locale: input.locale ?? 'en',
      // Omitted entirely (not passed as undefined) when the caller has no
      // existing group to join - lets the column's own defaultRandom()
      // generate a fresh id, same convention createDataObject/
      // createWhoobePage already use.
      ...(input.translationGroupId ? { translationGroupId: input.translationGroupId } : {}),
      attributes: input.attributes,
      createdAt,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: dataObjects.pimcoreId,
      set: {
        classId: input.classId,
        key: input.key,
        path: input.path ?? '/',
        locale: input.locale ?? 'en',
        ...(input.translationGroupId ? { translationGroupId: input.translationGroupId } : {}),
        attributes: input.attributes,
        createdAt,
        updatedAt,
      },
    })
    .returning();
  const classDef = await getDataClass(row.classId);
  if (classDef) await indexObject(row, classDef);
  return row;
}

// ---- Bulk import (docs/plans/datamodel: class from a file / an Integration) ----

export interface BulkImportRow {
  /** The object's key; one is made when absent. With `onConflict` it is what identifies an existing object. */
  key?: string;
  attributes: Record<string, unknown>;
}

export interface BulkImportPlan {
  inserts: { key: string; attributes: Record<string, unknown> }[];
  updates: { id: string; attributes: Record<string, unknown> }[];
  skipped: number;
}

/**
 * Decides what a chunk of rows does, given the objects of the class that already hold one of its keys (key -> id): a new key is an
 * insert; a key that exists is skipped or updated, per `onConflict`. A key repeated inside the chunk counts once (the last row wins).
 */
export function planBulkImport(
  rows: BulkImportRow[],
  existingByKey: Map<string, string>,
  onConflict: 'skip' | 'update',
  makeKey: () => string,
): BulkImportPlan {
  const byKey = new Map<string, Record<string, unknown>>();
  for (const row of rows) byKey.set(row.key?.trim() || makeKey(), row.attributes);
  const plan: BulkImportPlan = { inserts: [], updates: [], skipped: 0 };
  for (const [key, attributes] of byKey) {
    const id = existingByKey.get(key);
    if (id === undefined) plan.inserts.push({ key, attributes });
    else if (onConflict === 'update') plan.updates.push({ id, attributes });
    else plan.skipped++;
  }
  return plan;
}

/**
 * Creates (and, when asked, updates) a chunk of objects of one class in ONE transaction: all of the chunk or none of it. Objects are
 * created as drafts, in the default locale; attributes the class has no field for are dropped. The search index is updated after the
 * commit (an indexing failure never undoes the import).
 */
export async function bulkImportDataObjects(
  classId: string,
  rows: BulkImportRow[],
  options: { onConflict?: 'skip' | 'update'; locale?: string; actor?: EventActor; silent?: boolean } = {},
): Promise<{ created: number; updated: number; skipped: number; rejected: { key: string; message: string }[] }> {
  const classDef = await getDataClass(classId);
  if (!classDef) throw new Error('Class not found');
  const locale = options.locale ?? 'en';
  const names = new Set(classDef.fields.map((f) => f.name));
  const clean = rows.map((r) => ({
    key: r.key,
    attributes: Object.fromEntries(Object.entries(r.attributes ?? {}).filter(([k]) => names.has(k))),
  }));

  const db = getDb();
  const saved: DataObjectRecord[] = [];
  let plan: BulkImportPlan = { inserts: [], updates: [], skipped: 0 };
  const rejected: { key: string; message: string }[] = [];
  await db.transaction(async (tx) => {
    const keys = clean.map((r) => r.key?.trim()).filter((k): k is string => !!k);
    const existing = keys.length
      ? await tx.select({ id: dataObjects.id, key: dataObjects.key }).from(dataObjects)
          .where(and(eq(dataObjects.classId, classId), eq(dataObjects.locale, locale), inArray(dataObjects.key, keys)))
      : [];
    plan = planBulkImport(clean, new Map(existing.map((e) => [e.key, e.id])), options.onConflict ?? 'skip', () => crypto.randomUUID());
    // `unique` fields: a row whose value another object (or an earlier row of this chunk) already has is left out and reported
    const seen = new Map<string, Set<string>>();
    const accept = async (key: string, attributes: Record<string, unknown>, exceptId?: string): Promise<boolean> => {
      try {
        await assertUniqueValues(tx, classDef, attributes, { locale, exceptId });
        for (const f of uniqueValuesToCheck(classDef.fields, attributes)) {
          const v = JSON.stringify(f.value);
          if (seen.get(f.name)?.has(v)) throw new UniqueViolationError(f.name, f.title, f.value);
        }
      } catch (err) {
        if (err instanceof UniqueViolationError) { rejected.push({ key, message: err.message }); return false; }
        throw err;
      }
      for (const f of uniqueValuesToCheck(classDef.fields, attributes)) {
        if (!seen.has(f.name)) seen.set(f.name, new Set());
        seen.get(f.name)!.add(JSON.stringify(f.value));
      }
      return true;
    };
    if (classDef.fields.some((f) => f.unique)) {
      const inserts: typeof plan.inserts = [];
      for (const i of plan.inserts) if (await accept(i.key, i.attributes)) inserts.push(i);
      const updates: typeof plan.updates = [];
      for (const u of plan.updates) if (await accept(u.id, u.attributes, u.id)) updates.push(u);
      plan = { ...plan, inserts, updates };
    }
    if (plan.inserts.length) {
      saved.push(...(await tx.insert(dataObjects).values(plan.inserts.map((i) => ({ classId, key: i.key, path: '/', locale, attributes: i.attributes }))).returning()));
    }
    for (const u of plan.updates) {
      const [row] = await tx.update(dataObjects).set({ attributes: u.attributes, updatedAt: new Date() }).where(eq(dataObjects.id, u.id)).returning();
      if (row) saved.push(row);
    }
    // One summary for the whole chunk, in the same transaction (never one event per row).
    if (saved.length && !options.silent) {
      await insertEvent(tx, buildBulkEvent({ classId, className: classDef.name, kind: 'import', count: saved.length, ids: saved.map((r) => r.id), actor: options.actor }));
    }
  });
  for (const row of saved) {
    try { await indexObject(row, classDef); } catch { /* the index is rebuilt by a reindex; the data is saved */ }
  }
  return { created: plan.inserts.length, updated: plan.updates.length, skipped: plan.skipped, rejected };
}
