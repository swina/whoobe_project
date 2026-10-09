import { eq } from 'drizzle-orm';
import { getDb } from './client.js';
import { encryptIntegrationSecret, decryptIntegrationSecret } from './integration-secrets-crypto.js';
import { aiImageSettings } from './ai-image-settings-schema.js';

export interface AiImageSettingsRecord {
  userId: string;
  provider: string;
  model: string;
  endpoint: string | null;
  apiKey: string | null;
  updatedAt: Date;
}

export async function getAiImageSettings(userId: string): Promise<AiImageSettingsRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(aiImageSettings).where(eq(aiImageSettings.userId, userId)).limit(1);
  return row ? { ...row, apiKey: decryptIntegrationSecret(row.apiKey) } : null;
}

export async function upsertAiImageSettings(
  userId: string,
  input: {
    provider: string;
    model: string;
    endpoint?: string | null;
    apiKey?: string | null;
  }
): Promise<AiImageSettingsRecord> {
  const db = getDb();
  const storedKey = encryptIntegrationSecret(input.apiKey);
  const values = {
    userId,
    provider: input.provider,
    model: input.model,
    endpoint: input.endpoint ?? null,
    apiKey: storedKey,
    updatedAt: new Date(),
  };
  const [row] = await db.insert(aiImageSettings).values(values).onConflictDoUpdate({
    target: aiImageSettings.userId,
    set: {
      provider: input.provider,
      model: input.model,
      endpoint: input.endpoint ?? null,
      apiKey: storedKey,
      updatedAt: new Date(),
    },
  }).returning();
  return { ...row, apiKey: decryptIntegrationSecret(row.apiKey) };
}