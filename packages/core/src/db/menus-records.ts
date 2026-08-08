import { eq, desc } from 'drizzle-orm';
import { getDb } from './client.js';
import { menus, type MenuItem } from './menus-schema.js';

export interface MenuRecord {
  id: string;
  websiteId: string;
  name: string;
  items: MenuItem[];
  createdAt: Date;
  updatedAt: Date;
}

export async function listMenus(websiteId?: string): Promise<MenuRecord[]> {
  const db = getDb();
  const query = db.select().from(menus).orderBy(desc(menus.createdAt));
  if (websiteId) {
    const rows = await query;
    return rows.filter((m) => m.websiteId === websiteId);
  }
  return query;
}

export async function getMenu(id: string): Promise<MenuRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(menus).where(eq(menus.id, id)).limit(1);
  return row ?? null;
}

export async function createMenu(input: {
  websiteId: string;
  name: string;
  items?: MenuItem[];
}): Promise<MenuRecord> {
  const db = getDb();
  const [row] = await db
    .insert(menus)
    .values({
      websiteId: input.websiteId,
      name: input.name,
      items: input.items ?? [],
    })
    .returning();
  return row;
}

export async function updateMenu(
  id: string,
  input: {
    name?: string;
    items?: MenuItem[];
  }
): Promise<MenuRecord | null> {
  const db = getDb();
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) values.name = input.name;
  if (input.items !== undefined) values.items = input.items;
  const [row] = await db.update(menus).set(values).where(eq(menus.id, id)).returning();
  return row ?? null;
}

export async function deleteMenu(id: string): Promise<void> {
  const db = getDb();
  await db.delete(menus).where(eq(menus.id, id));
}