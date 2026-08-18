import { eq, desc } from 'drizzle-orm';
import { getDb } from './client.js';
import { themes } from './themes-schema.js';

export interface ThemeRecord {
  id: string;
  name: string;
  colors: { name: string; hex: string }[];
  fonts: string[];
  styles: string;
  tailwindClasses: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function listThemes(): Promise<ThemeRecord[]> {
  const db = getDb();
  return db.select().from(themes).orderBy(desc(themes.createdAt));
}

export async function getTheme(id: string): Promise<ThemeRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(themes).where(eq(themes.id, id)).limit(1);
  return row ?? null;
}

export async function createTheme(input: {
  name: string;
  colors?: { name: string; hex: string }[];
  fonts?: string[];
  styles?: string;
  tailwindClasses?: string;
}): Promise<ThemeRecord> {
  const db = getDb();
  const [row] = await db
    .insert(themes)
    .values({
      name: input.name,
      colors: input.colors ?? [],
      fonts: input.fonts ?? [],
      styles: input.styles ?? '',
      tailwindClasses: input.tailwindClasses ?? '',
    })
    .returning();
  return row;
}

export async function updateTheme(
  id: string,
  input: {
    name?: string;
    colors?: { name: string; hex: string }[];
    fonts?: string[];
    styles?: string;
    tailwindClasses?: string;
  }
): Promise<ThemeRecord | null> {
  const db = getDb();
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) values.name = input.name;
  if (input.colors !== undefined) values.colors = input.colors;
  if (input.fonts !== undefined) values.fonts = input.fonts;
  if (input.styles !== undefined) values.styles = input.styles;
  if (input.tailwindClasses !== undefined) values.tailwindClasses = input.tailwindClasses;
  const [row] = await db.update(themes).set(values).where(eq(themes.id, id)).returning();
  return row ?? null;
}

export async function deleteTheme(id: string): Promise<void> {
  const db = getDb();
  await db.delete(themes).where(eq(themes.id, id));
}