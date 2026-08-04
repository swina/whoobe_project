import { eq, desc } from 'drizzle-orm';
import { getDb } from './client.js';
import { whoobeOneTemplates } from './whoobe-one-template-schema.js';

export interface WhoobeOneTemplateRecord {
  id: string;
  name: string;
  category: string;
  path: string;
  description: string | null;
  node: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export async function listWhoobeOneTemplates(): Promise<WhoobeOneTemplateRecord[]> {
  const db = getDb();
  return db.select().from(whoobeOneTemplates).orderBy(desc(whoobeOneTemplates.createdAt));
}

export async function getWhoobeOneTemplate(id: string): Promise<WhoobeOneTemplateRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(whoobeOneTemplates).where(eq(whoobeOneTemplates.id, id)).limit(1);
  return row ?? null;
}

export async function createWhoobeOneTemplate(input: {
  name: string;
  category: string;
  path: string;
  description?: string | null;
  node: unknown;
}): Promise<WhoobeOneTemplateRecord> {
  const db = getDb();
  const [row] = await db
    .insert(whoobeOneTemplates)
    .values({
      name: input.name,
      category: input.category,
      path: input.path,
      description: input.description ?? null,
      node: input.node,
    })
    .returning();
  return row;
}

export async function updateWhoobeOneTemplate(
  id: string,
  input: { name: string; category: string; description?: string | null; node: unknown }
): Promise<WhoobeOneTemplateRecord | null> {
  const db = getDb();
  const [row] = await db
    .update(whoobeOneTemplates)
    .set({
      name: input.name,
      category: input.category,
      description: input.description ?? null,
      node: input.node,
      updatedAt: new Date(),
    })
    .where(eq(whoobeOneTemplates.id, id))
    .returning();
  return row ?? null;
}

export async function deleteWhoobeOneTemplate(id: string): Promise<void> {
  const db = getDb();
  await db.delete(whoobeOneTemplates).where(eq(whoobeOneTemplates.id, id));
}
