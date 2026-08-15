import { eq, desc } from 'drizzle-orm';
import { getDb } from './client.js';
import { whoobeOneSnippets } from './whoobe-one-snippet-schema.js';

export interface WhoobeOneSnippetRecord {
  id: string;
  name: string;
  category: string;
  icon: string | null;
  node: unknown;
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
  name: string;
  category: string;
  icon?: string | null;
  node: unknown;
}): Promise<WhoobeOneSnippetRecord> {
  const db = getDb();
  const [row] = await db
    .insert(whoobeOneSnippets)
    .values({ name: input.name, category: input.category, icon: input.icon ?? null, node: input.node })
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
  input: { name: string; category: string; icon?: string | null; node: unknown }
): Promise<WhoobeOneSnippetRecord | null> {
  const db = getDb();
  const [row] = await db
    .update(whoobeOneSnippets)
    .set({ name: input.name, category: input.category, icon: input.icon ?? null, node: input.node, updatedAt: new Date() })
    .where(eq(whoobeOneSnippets.id, id))
    .returning();
  return row ?? null;
}
