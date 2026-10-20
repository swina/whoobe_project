import { eq, desc } from 'drizzle-orm';
import { getDb } from './client.js';
import { whoobeOneKits, type KitOrigin } from './whoobe-one-kit-schema.js';

export interface WhoobeOneKitRecord {
  id: string;
  name: string;
  description: string | null;
  category: string;
  templates: any[];
  origin: KitOrigin;
  version: string;
  slug: string | null;
  forkedFrom: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function listWhoobeOneKits(): Promise<WhoobeOneKitRecord[]> {
  const db = getDb();
  return db.select().from(whoobeOneKits).orderBy(desc(whoobeOneKits.createdAt));
}

export async function getWhoobeOneKit(id: string): Promise<WhoobeOneKitRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(whoobeOneKits).where(eq(whoobeOneKits.id, id)).limit(1);
  return row ?? null;
}

/** Idempotency key for the repo-seeded kits (see seed.ts's own
 * seedWhoobeOneKits()) - looked up by name rather than a stable id, since
 * a kit created this way has no equivalent of whoobe-one-snippet-records.
 * ts's caller-supplied ids to key off of. */
export async function getWhoobeOneKitByName(name: string): Promise<WhoobeOneKitRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(whoobeOneKits).where(eq(whoobeOneKits.name, name)).limit(1);
  return row ?? null;
}

export async function createWhoobeOneKit(input: {
  name: string;
  description?: string | null;
  category: string;
  templates: any[];
  origin?: KitOrigin;
  version?: string;
  slug?: string | null;
  forkedFrom?: string | null;
}): Promise<WhoobeOneKitRecord> {
  const db = getDb();
  const [row] = await db
    .insert(whoobeOneKits)
    .values({
      name: input.name,
      description: input.description ?? null,
      category: input.category,
      templates: input.templates,
      origin: input.origin ?? 'user',
      version: input.version ?? '1',
      slug: input.slug ?? null,
      forkedFrom: input.forkedFrom ?? null,
    })
    .returning();
  return row;
}

/** Appends one template entry to an existing kit's `templates` array -
 * read-modify-write at the DB layer (not the client's problem to fetch,
 * mutate, and PATCH the whole array back) since this is the one place
 * that can actually see the current array right before writing it. */
export async function addTemplateToWhoobeOneKit(kitId: string, template: any): Promise<WhoobeOneKitRecord | null> {
  const db = getDb();
  const kit = await getWhoobeOneKit(kitId);
  if (!kit) return null;

  const [row] = await db
    .update(whoobeOneKits)
    .set({ templates: [...kit.templates, template], updatedAt: new Date() })
    .where(eq(whoobeOneKits.id, kitId))
    .returning();
  return row ?? null;
}

export async function getWhoobeOneKitBySlug(slug: string): Promise<WhoobeOneKitRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(whoobeOneKits).where(eq(whoobeOneKits.slug, slug)).limit(1);
  return row ?? null;
}

/** Replaces what a shipped (bundled/catalogue) kit holds with a newer version of it. Only the seed calls this. */
export async function updateWhoobeOneKitContent(
  id: string,
  input: { name: string; description: string | null; category: string; templates: any[]; version: string }
): Promise<void> {
  const db = getDb();
  await db.update(whoobeOneKits).set({ ...input, updatedAt: new Date() }).where(eq(whoobeOneKits.id, id));
}

/** A user copy of any kit: the templates are deep-copied (the kit is a self-contained bundle), the origin is always 'user'. */
/** Rename / describe / re-categorise a kit. The caller refuses a shipped kit (origin other than 'user') first. */
export async function updateWhoobeOneKitMeta(
  id: string,
  input: { name?: string; description?: string | null; category?: string }
): Promise<WhoobeOneKitRecord | null> {
  const db = getDb();
  const [row] = await db.update(whoobeOneKits).set({ ...input, updatedAt: new Date() }).where(eq(whoobeOneKits.id, id)).returning();
  return row ?? null;
}

export async function duplicateWhoobeOneKit(id: string): Promise<WhoobeOneKitRecord | null> {
  const source = await getWhoobeOneKit(id);
  if (!source) return null;
  return createWhoobeOneKit({
    name: `${source.name} (copy)`,
    description: source.description,
    category: source.category,
    templates: JSON.parse(JSON.stringify(source.templates)),
    origin: 'user',
    forkedFrom: source.id,
  });
}

export async function deleteWhoobeOneKit(id: string): Promise<void> {
  const db = getDb();
  await db.delete(whoobeOneKits).where(eq(whoobeOneKits.id, id));
}
