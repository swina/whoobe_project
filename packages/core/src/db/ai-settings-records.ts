import { eq } from 'drizzle-orm';
import { getDb } from './client.js';
import { aiSettings } from './ai-settings-schema.js';

export interface AiSettingsRecord {
  userId: string;
  provider: string;
  model: string;
  endpoint: string | null;
  apiKey: string | null;
  updatedAt: Date;
}

/** Returns the AI settings for a given user, or null if they haven't
 *  configured them yet. */
export async function getAiSettings(userId: string): Promise<AiSettingsRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(aiSettings).where(eq(aiSettings.userId, userId)).limit(1);
  return row ?? null;
}

/** Upserts AI settings for the given user. If a row already exists for that
 *  user it is updated; otherwise a new row is inserted. */
export async function upsertAiSettings(
  userId: string,
  input: {
    provider: string;
    model: string;
    endpoint?: string | null;
    apiKey?: string | null;
  }
): Promise<AiSettingsRecord> {
  const db = getDb();
  const values = {
    userId,
    provider: input.provider,
    model: input.model,
    endpoint: input.endpoint ?? null,
    apiKey: input.apiKey ?? null,
    updatedAt: new Date(),
  };
  const [row] = await db.insert(aiSettings).values(values).onConflictDoUpdate({
    target: aiSettings.userId,
    set: {
      provider: input.provider,
      model: input.model,
      endpoint: input.endpoint ?? null,
      apiKey: input.apiKey ?? null,
      updatedAt: new Date(),
    },
  }).returning();
  return row;
}