import { eq, desc } from 'drizzle-orm';
import { getDb } from './client.js';
import { cmsSnippets } from './snippet-schema.js';
import type { WhoobeBlockNode } from '../cms/block-schema.js';

export interface CmsSnippetRecord {
  id: string;
  name: string;
  icon: string | null;
  node: WhoobeBlockNode;
  createdAt: Date;
  updatedAt: Date;
}

export async function listSnippets(): Promise<CmsSnippetRecord[]> {
  const db = getDb();
  return db.select().from(cmsSnippets).orderBy(desc(cmsSnippets.createdAt));
}

export async function createSnippet(input: {
  name: string;
  icon?: string | null;
  node: WhoobeBlockNode;
}): Promise<CmsSnippetRecord> {
  const db = getDb();
  const [row] = await db
    .insert(cmsSnippets)
    .values({ name: input.name, icon: input.icon ?? null, node: input.node })
    .returning();
  return row;
}

export async function deleteSnippet(id: string): Promise<void> {
  const db = getDb();
  await db.delete(cmsSnippets).where(eq(cmsSnippets.id, id));
}
