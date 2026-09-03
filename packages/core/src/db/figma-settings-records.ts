import { eq } from 'drizzle-orm';
import { getDb } from './client.js';
import { figmaSettings } from './figma-settings-schema.js';

export interface FigmaSettingsRecord {
  id: string;
  accessToken: string | null;
  teamId: string | null;
  updatedAt: Date;
}

export async function getFigmaSettings(): Promise<FigmaSettingsRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(figmaSettings).limit(1);
  return row ?? null;
}

export async function upsertFigmaSettings(input: {
  accessToken?: string | null;
  teamId?: string | null;
}): Promise<FigmaSettingsRecord> {
  const db = getDb();
  const existing = await getFigmaSettings();
  const values = {
    accessToken: input.accessToken ?? null,
    teamId: input.teamId ?? null,
    updatedAt: new Date(),
  };
  if (existing) {
    const [row] = await db.update(figmaSettings).set(values).where(eq(figmaSettings.id, existing.id)).returning();
    return row;
  }
  const [row] = await db.insert(figmaSettings).values(values).returning();
  return row;
}