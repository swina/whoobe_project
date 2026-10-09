import { eq } from 'drizzle-orm';
import { getDb } from './client.js';
import { encryptIntegrationSecret, decryptIntegrationSecret } from './integration-secrets-crypto.js';
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
  return row ? { ...row, accessToken: decryptIntegrationSecret(row.accessToken) } : null;
}

export async function upsertFigmaSettings(input: {
  accessToken?: string | null;
  teamId?: string | null;
}): Promise<FigmaSettingsRecord> {
  const db = getDb();
  const existing = await getFigmaSettings();
  const values = {
    accessToken: encryptIntegrationSecret(input.accessToken),
    teamId: input.teamId ?? null,
    updatedAt: new Date(),
  };
  if (existing) {
    const [row] = await db.update(figmaSettings).set(values).where(eq(figmaSettings.id, existing.id)).returning();
    return { ...row, accessToken: decryptIntegrationSecret(row.accessToken) };
  }
  const [row] = await db.insert(figmaSettings).values(values).returning();
  return { ...row, accessToken: decryptIntegrationSecret(row.accessToken) };
}