import { eq, asc } from 'drizzle-orm';
import { getDb } from './client.js';
import { wizardPalettes } from './wizard-palettes-schema.js';

export interface WizardPaletteRecord { id: string; name: string; colors: Record<string, string>; createdAt: Date; updatedAt: Date }

export async function listWizardPalettes(): Promise<WizardPaletteRecord[]> {
  return getDb().select().from(wizardPalettes).orderBy(asc(wizardPalettes.name));
}

export async function getWizardPalette(id: string): Promise<WizardPaletteRecord | null> {
  const [row] = await getDb().select().from(wizardPalettes).where(eq(wizardPalettes.id, id)).limit(1);
  return row ?? null;
}

export async function createWizardPalette(input: { name: string; colors: Record<string, string> }): Promise<WizardPaletteRecord> {
  const [row] = await getDb().insert(wizardPalettes).values({ name: input.name, colors: input.colors }).returning();
  return row;
}

export async function updateWizardPalette(id: string, input: { name: string; colors: Record<string, string> }): Promise<WizardPaletteRecord | null> {
  const [row] = await getDb().update(wizardPalettes).set({ name: input.name, colors: input.colors, updatedAt: new Date() }).where(eq(wizardPalettes.id, id)).returning();
  return row ?? null;
}

export async function deleteWizardPalette(id: string): Promise<boolean> {
  const rows = await getDb().delete(wizardPalettes).where(eq(wizardPalettes.id, id)).returning({ id: wizardPalettes.id });
  return rows.length > 0;
}
