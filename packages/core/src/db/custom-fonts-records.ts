import { eq, asc } from 'drizzle-orm';
import { getDb } from './client.js';
import { customFonts } from './custom-fonts-schema.js';

export interface CustomFontRecord { id: string; family: string; weight: number; style: string; assetPath: string; createdAt: Date }

export async function listCustomFonts(): Promise<CustomFontRecord[]> {
  return getDb().select().from(customFonts).orderBy(asc(customFonts.family), asc(customFonts.weight), asc(customFonts.style));
}

export async function getCustomFont(id: string): Promise<CustomFontRecord | null> {
  const [row] = await getDb().select().from(customFonts).where(eq(customFonts.id, id)).limit(1);
  return row ?? null;
}

/** Throws a unique-violation (`23505`, index `custom_fonts_face_idx`) when the family already has that weight and style. */
export async function createCustomFont(input: { family: string; weight: number; style: string; assetPath: string }): Promise<CustomFontRecord> {
  const [row] = await getDb().insert(customFonts).values(input).returning();
  return row;
}

export async function deleteCustomFont(id: string): Promise<boolean> {
  const rows = await getDb().delete(customFonts).where(eq(customFonts.id, id)).returning({ id: customFonts.id });
  return rows.length > 0;
}
