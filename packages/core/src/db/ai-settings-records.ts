import { eq } from 'drizzle-orm';
import { getDb } from './client.js';
import { aiSettings } from './ai-settings-schema.js';

export interface AiSettingsRecord {
  id: string;
  provider: string;
  model: string;
  endpoint: string | null;
  apiKey: string | null;
  updatedAt: Date;
}

/** A single global row (docs/plans/ai/ai-pages-snippets-generator.md) -
 *  `null` until an admin has saved settings once via upsertAiSettings(). */
export async function getAiSettings(): Promise<AiSettingsRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(aiSettings).limit(1);
  return row ?? null;
}

/** True upsert - the caller never needs to know whether settings already
 *  exist. Updates the single existing row if present, otherwise inserts
 *  the first one. */
export async function upsertAiSettings(input: {
  provider: string;
  model: string;
  endpoint?: string | null;
  apiKey?: string | null;
}): Promise<AiSettingsRecord> {
  const db = getDb();
  const existing = await getAiSettings();
  const values = {
    provider: input.provider,
    model: input.model,
    endpoint: input.endpoint ?? null,
    apiKey: input.apiKey ?? null,
    updatedAt: new Date(),
  };
  if (existing) {
    const [row] = await db.update(aiSettings).set(values).where(eq(aiSettings.id, existing.id)).returning();
    return row;
  }
  const [row] = await db.insert(aiSettings).values(values).returning();
  return row;
}