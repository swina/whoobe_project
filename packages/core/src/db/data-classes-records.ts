import { eq } from 'drizzle-orm';
import { getDb } from './client.js';
import { dataClasses } from './data-classes-schema.js';
import type { ClassFieldDefinition } from '../schema/dynamic.js';

export interface DataClassRecord {
  id: string;
  name: string;
  label: string;
  fields: ClassFieldDefinition[];
  pimcoreId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function listDataClasses(): Promise<DataClassRecord[]> {
  const db = getDb();
  return db.select().from(dataClasses).orderBy(dataClasses.name);
}

export async function getDataClass(id: string): Promise<DataClassRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(dataClasses).where(eq(dataClasses.id, id)).limit(1);
  return row ?? null;
}

/** Looked up by name rather than id wherever the caller only knows the
 * class by its human name - packages/migration-tool's `migrate-objects`
 * (given `--class=<Name>`) and its own relation resolver (a relation
 * field's `relationTarget` is a class name, not an id). */
export async function getDataClassByName(name: string): Promise<DataClassRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(dataClasses).where(eq(dataClasses.name, name)).limit(1);
  return row ?? null;
}

export async function createDataClass(input: {
  name: string;
  label: string;
  fields: ClassFieldDefinition[];
  pimcoreId?: string | null;
}): Promise<DataClassRecord> {
  const db = getDb();
  const [row] = await db
    .insert(dataClasses)
    .values({
      name: input.name,
      label: input.label,
      fields: input.fields,
      pimcoreId: input.pimcoreId ?? null,
    })
    .returning();
  return row;
}

export async function updateDataClass(
  id: string,
  input: { name?: string; label?: string; fields?: ClassFieldDefinition[] }
): Promise<DataClassRecord | null> {
  const db = getDb();

  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) values.name = input.name;
  if (input.label !== undefined) values.label = input.label;
  if (input.fields !== undefined) values.fields = input.fields;

  const [row] = await db.update(dataClasses).set(values).where(eq(dataClasses.id, id)).returning();
  return row ?? null;
}

export async function deleteDataClass(id: string): Promise<void> {
  const db = getDb();
  await db.delete(dataClasses).where(eq(dataClasses.id, id));
}

/** Insert-or-update-by-`pimcoreId` - packages/migration-tool's
 * `migrate-classes` re-run path, same role `upsertWhoobePageByPimcoreId`
 * plays for pages. Relies on `pimcoreIdIdx`'s real unique constraint, not
 * an application-level "check first" race. */
export async function upsertDataClassByPimcoreId(input: {
  pimcoreId: string;
  name: string;
  label: string;
  fields: ClassFieldDefinition[];
}): Promise<DataClassRecord> {
  const db = getDb();
  const now = new Date();

  const [row] = await db
    .insert(dataClasses)
    .values({
      pimcoreId: input.pimcoreId,
      name: input.name,
      label: input.label,
      fields: input.fields,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: dataClasses.pimcoreId,
      set: {
        name: input.name,
        label: input.label,
        fields: input.fields,
        updatedAt: now,
      },
    })
    .returning();
  return row;
}
