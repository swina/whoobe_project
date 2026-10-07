import { eq, desc } from 'drizzle-orm';
import { getDb } from './client.js';
import { whoobeOneSnippets } from './whoobe-one-snippet-schema.js';
import { snapshotContentVersion } from './content-versions-records.js';

export interface WhoobeOneSnippetRecord {
  id: string;
  name: string;
  category: string;
  icon: string | null;
  node: unknown;
  themeId: string | null;
  notes: string | null;
  thumbnail: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function listWhoobeOneSnippets(): Promise<WhoobeOneSnippetRecord[]> {
  const db = getDb();
  return db.select().from(whoobeOneSnippets).orderBy(desc(whoobeOneSnippets.createdAt));
}

export async function getWhoobeOneSnippet(id: string): Promise<WhoobeOneSnippetRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(whoobeOneSnippets).where(eq(whoobeOneSnippets.id, id)).limit(1);
  return row ?? null;
}

export async function createWhoobeOneSnippet(input: {
  id?: string;
  name: string;
  category: string;
  icon?: string | null;
  node: unknown;
  themeId?: string | null;
  notes?: string | null;
  thumbnail?: string | null;
}): Promise<WhoobeOneSnippetRecord> {
  const db = getDb();
  const [row] = await db
    .insert(whoobeOneSnippets)
    .values({ ...(input.id ? { id: input.id } : {}), thumbnail: input.thumbnail ?? null, name: input.name, category: input.category, icon: input.icon ?? null, node: input.node, themeId: input.themeId ?? null, notes: input.notes ?? null })
    .returning();
  return row;
}

export async function deleteWhoobeOneSnippet(id: string): Promise<void> {
  const db = getDb();
  await db.delete(whoobeOneSnippets).where(eq(whoobeOneSnippets.id, id));
}

// Overwrites an existing snippet's name/category/icon/node in place -
// lets a minor tweak to an already-saved snippet update it directly
// instead of piling up near-duplicate snippets that only differ slightly.
export async function updateWhoobeOneSnippet(
  id: string,
  input: { name: string; category: string; icon?: string | null; node: unknown; themeId?: string | null; notes?: string | null }
): Promise<WhoobeOneSnippetRecord | null> {
  const db = getDb();

  // Snapshot the PRE-update node as a version before it's overwritten - see
  // content-versions-schema.ts. Skipped when the node is unchanged, so a
  // no-op autosave tick doesn't burn through the 10-slot history.
  const current = await getWhoobeOneSnippet(id);
  if (current && JSON.stringify(current.node) !== JSON.stringify(input.node)) {
    await snapshotContentVersion({ resourceType: 'snippet', resourceId: id, content: current.node, label: current.name });
  }

  const values: Record<string, unknown> = { name: input.name, category: input.category, icon: input.icon ?? null, node: input.node, updatedAt: new Date() };
  if (input.themeId !== undefined) values.themeId = input.themeId;
  if (input.notes !== undefined) values.notes = input.notes;
  const [row] = await db
    .update(whoobeOneSnippets)
    .set(values)
    .where(eq(whoobeOneSnippets.id, id))
    .returning();
  return row ?? null;
}

/** Sets (or clears, with null) a snippet's captured preview thumbnail. Does
 *  not snapshot a content version or bump updatedAt - not a content edit. */
export async function setWhoobeOneSnippetThumbnail(id: string, thumbnail: string | null): Promise<boolean> {
  const db = getDb();
  const rows = await db.update(whoobeOneSnippets).set({ thumbnail }).where(eq(whoobeOneSnippets.id, id)).returning({ id: whoobeOneSnippets.id });
  return rows.length > 0;
}
