import { desc } from 'drizzle-orm';
import { getDb } from './client.js';
import { aiGenerated } from './ai-generated-schema.js';

export interface AiGeneratedRecord {
  id: string;
  kind: string;
  prompt: string;
  provider: string | null;
  model: string | null;
  payload: unknown;
  rawResponse: string | null;
  status: string;
  error: string | null;
  createdBy: string | null;
  createdAt: Date;
}

export async function listAiGenerated(limit = 50): Promise<AiGeneratedRecord[]> {
  const db = getDb();
  return db
    .select()
    .from(aiGenerated)
    .orderBy(desc(aiGenerated.createdAt))
    .limit(limit);
}

export async function createAiGenerated(input: {
  kind: string;
  prompt: string;
  provider?: string | null;
  model?: string | null;
  payload?: unknown;
  rawResponse?: string | null;
  status: string;
  error?: string | null;
  createdBy?: string | null;
}): Promise<AiGeneratedRecord> {
  const db = getDb();
  const [row] = await db
    .insert(aiGenerated)
    .values({
      kind: input.kind,
      prompt: input.prompt,
      provider: input.provider ?? null,
      model: input.model ?? null,
      payload: input.payload ?? null,
      rawResponse: input.rawResponse ?? null,
      status: input.status,
      error: input.error ?? null,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return row;
}