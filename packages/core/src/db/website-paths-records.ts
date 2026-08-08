import { eq, desc } from 'drizzle-orm';
import { getDb } from './client.js';
import { websitePaths, type MenuItem } from './website-paths-schema.js';

export interface WebsitePathRecord {
  id: string;
  websiteId: string;
  name: string;
  items: MenuItem[];
  createdAt: Date;
  updatedAt: Date;
}

export async function listWebsitePaths(websiteId?: string): Promise<WebsitePathRecord[]> {
  const db = getDb();
  const query = db.select().from(websitePaths).orderBy(desc(websitePaths.createdAt));
  if (websiteId) {
    const rows = await query;
    return rows.filter((m) => m.websiteId === websiteId);
  }
  return query;
}

export async function getWebsitePath(id: string): Promise<WebsitePathRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(websitePaths).where(eq(websitePaths.id, id)).limit(1);
  return row ?? null;
}

export async function createWebsitePath(input: {
  websiteId: string;
  name: string;
  items?: MenuItem[];
}): Promise<WebsitePathRecord> {
  const db = getDb();
  const [row] = await db
    .insert(websitePaths)
    .values({
      websiteId: input.websiteId,
      name: input.name,
      items: input.items ?? [],
    })
    .returning();
  return row;
}

export async function updateWebsitePath(
  id: string,
  input: {
    name?: string;
    items?: MenuItem[];
  }
): Promise<WebsitePathRecord | null> {
  const db = getDb();
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) values.name = input.name;
  if (input.items !== undefined) values.items = input.items;
  const [row] = await db.update(websitePaths).set(values).where(eq(websitePaths.id, id)).returning();
  return row ?? null;
}

export async function deleteWebsitePath(id: string): Promise<void> {
  const db = getDb();
  await db.delete(websitePaths).where(eq(websitePaths.id, id));
}