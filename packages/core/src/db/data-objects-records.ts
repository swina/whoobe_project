import { eq, desc } from 'drizzle-orm';
import { getDb } from './client.js';
import { dataObjects } from './data-objects-schema.js';

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
  return row ?? null;
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
  attributes: Record<string, unknown>;
}): Promise<DataObjectRecord> {
  const db = getDb();
  const now = new Date();

  const [row] = await db
    .insert(dataObjects)
    .values({
      pimcoreId: input.pimcoreId,
      classId: input.classId,
      key: input.key,
      path: input.path ?? '/',
      locale: input.locale ?? 'en',
      attributes: input.attributes,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: dataObjects.pimcoreId,
      set: {
        classId: input.classId,
        key: input.key,
        path: input.path ?? '/',
        locale: input.locale ?? 'en',
        attributes: input.attributes,
        updatedAt: now,
      },
    })
    .returning();
  return row;
}
