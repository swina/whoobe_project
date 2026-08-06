import { eq } from 'drizzle-orm';
import { getDb } from './client.js';
import { dataComponents } from './data-components-schema.js';
import { dataObjects } from './data-objects-schema.js';
import type { ClassFieldDefinition } from '../schema/dynamic.js';

export interface DataComponentRecord {
  id: string;
  name: string;
  label: string;
  fields: ClassFieldDefinition[];
  createdAt: Date;
  updatedAt: Date;
}

export async function listDataComponents(): Promise<DataComponentRecord[]> {
  const db = getDb();
  return db.select().from(dataComponents).orderBy(dataComponents.name);
}

export async function getDataComponent(id: string): Promise<DataComponentRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(dataComponents).where(eq(dataComponents.id, id)).limit(1);
  return row ?? null;
}

/** Looked up by name - the resolution path a `fieldcollections` field's
 * own `allowedComponentTypes` (a list of names) needs, mirroring
 * `getDataClassByName`'s identical role for class relation targets. */
export async function getDataComponentByName(name: string): Promise<DataComponentRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(dataComponents).where(eq(dataComponents.name, name)).limit(1);
  return row ?? null;
}

export async function createDataComponent(input: {
  name: string;
  label: string;
  fields: ClassFieldDefinition[];
}): Promise<DataComponentRecord> {
  const db = getDb();
  const [row] = await db
    .insert(dataComponents)
    .values({
      name: input.name,
      label: input.label,
      fields: input.fields,
    })
    .returning();
  return row;
}

export async function updateDataComponent(
  id: string,
  input: { name?: string; label?: string; fields?: ClassFieldDefinition[] }
): Promise<DataComponentRecord | null> {
  const db = getDb();

  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) values.name = input.name;
  if (input.label !== undefined) values.label = input.label;
  if (input.fields !== undefined) values.fields = input.fields;

  const [row] = await db.update(dataComponents).set(values).where(eq(dataComponents.id, id)).returning();
  return row ?? null;
}

/**
 * The real in-use check component-fields-plan.md §2.5/Phase 4 called for
 * - genuinely not a foreign-key lookup, since a Component is referenced
 * by *name* from inside an arbitrary `fieldcollections` field's own
 * array-of-`{ collectionType, ...fields }` items in `data_objects
 * .attributes` JSONB, under whatever field name that class happened to
 * give it (there's no fixed column to index or join against).
 *
 * Scans every object's attributes in application code rather than a
 * single deep-JSONB SQL query (`jsonb_each` + `jsonb_array_elements`
 * would work, but is real, separate complexity) - a deliberate choice
 * matched to this system's own actual scale (the real pilot migration
 * this codebase has already run totals 202 objects, per advanced-data-
 * modeling-plan.md's own findings) - not a decision that would hold up
 * unchanged at a much larger scale, stated rather than assumed away.
 */
export async function isDataComponentInUse(componentName: string): Promise<boolean> {
  const db = getDb();
  const rows = await db.select({ attributes: dataObjects.attributes }).from(dataObjects);
  for (const row of rows) {
    for (const value of Object.values(row.attributes)) {
      if (!Array.isArray(value)) continue;
      if (value.some((item) => item && typeof item === 'object' && (item as { collectionType?: unknown }).collectionType === componentName)) {
        return true;
      }
    }
  }
  return false;
}

export async function deleteDataComponent(id: string): Promise<void> {
  const db = getDb();
  await db.delete(dataComponents).where(eq(dataComponents.id, id));
}
