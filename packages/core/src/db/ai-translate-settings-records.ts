import { eq } from 'drizzle-orm';
import { getDb } from './client.js';
import { aiTranslateSettings } from './ai-translate-settings-schema.js';

export interface AiTranslateSettingsRecord {
  userId: string;
  provider: string;
  model: string;
  endpoint: string | null;
  apiKey: string | null;
  updatedAt: Date;
}

export async function getAiTranslateSettings(userId: string): Promise<AiTranslateSettingsRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(aiTranslateSettings).where(eq(aiTranslateSettings.userId, userId)).limit(1);
  return row ?? null;
}

export async function upsertAiTranslateSettings(
  userId: string,
  input: {
    provider: string;
    model: string;
    endpoint?: string | null;
    apiKey?: string | null;
  }
): Promise<AiTranslateSettingsRecord> {
  const db = getDb();
  const values = {
    userId,
    provider: input.provider,
    model: input.model,
    endpoint: input.endpoint ?? null,
    apiKey: input.apiKey ?? null,
    updatedAt: new Date(),
  };
  const [row] = await db.insert(aiTranslateSettings).values(values).onConflictDoUpdate({
    target: aiTranslateSettings.userId,
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
