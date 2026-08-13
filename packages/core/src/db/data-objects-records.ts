import { eq, and, desc, inArray } from 'drizzle-orm';
import { getDb } from './client.js';
import { dataObjects } from './data-objects-schema.js';
import { getDataClass } from './data-classes-records.js';

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
async function syncNonLocalizedAttributes(row: DataObjectRecord): Promise<void> {
  const dataClass = await getDataClass(row.classId);
  if (!dataClass) return;
  const nonLocalizedNames = dataClass.fields.filter((f) => !f.localized).map((f) => f.name);
  if (nonLocalizedNames.length === 0) return;

  const db = getDb();
  const siblings = await db
    .select()
    .from(dataObjects)
    .where(eq(dataObjects.translationGroupId, row.translationGroupId));

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
      await db.update(dataObjects).set({ attributes: nextAttributes, updatedAt: new Date() }).where(eq(dataObjects.id, sibling.id));
    }
  }
}

export async function createDataObject(input: {
  classId: string;
  key: string;
  path?: string;
  parentId?: string | null;
  translationGroupId?: string;
  locale?: string;
  attributes: Record<string, unknown>;
  pimcoreId?: string | null;
}): Promise<DataObjectRecord> {
  const db = getDb();
  const [row] = await db
    .insert(dataObjects)
    .values({
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
  await syncNonLocalizedAttributes(row);
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
  }
): Promise<DataObjectRecord | null> {
  const db = getDb();

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
    if (input.published) {
      const current = await getDataObject(id);
      if (current && !current.publishedAt) values.publishedAt = new Date();
    }
  }

  const [row] = await db.update(dataObjects).set(values).where(eq(dataObjects.id, id)).returning();
  if (row && input.attributes !== undefined) {
    await syncNonLocalizedAttributes(row);
  }
  return row ?? null;
}

/** Delete all data objects belonging to a class - used by the migration
 * clear-before-import option to reset a class's objects before retrying. */
export async function deleteDataObjectsByClassId(classId: string): Promise<void> {
  const db = getDb();
  await db.delete(dataObjects).where(eq(dataObjects.classId, classId));
}

export async function deleteDataObject(id: string): Promise<void> {
  const db = getDb();
  await db.delete(dataObjects).where(eq(dataObjects.id, id));
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
  return row;
}
