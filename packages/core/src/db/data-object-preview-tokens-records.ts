import { randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { getDb } from './client.js';
import { dataObjectPreviewTokens } from './data-objects-schema.js';

export interface PreviewTokenRecord {
  token: string;
  objectId: string;
  expiresAt: Date;
  createdBy: string | null;
  createdAt: Date;
  revokedAt: Date | null;
  viewCount: number;
}

/** Whether a token is still usable *right now* - not expired, not
 * revoked. A plain function (not a DB query) so `core-api`'s preview
 * route and any other future caller check the exact same rule, matching
 * the "one shared place" discipline this plan's public-visibility gate
 * already established (§2.2) for `published`. */
export function isPreviewTokenValid(token: PreviewTokenRecord): boolean {
  return token.revokedAt === null && token.expiresAt.getTime() > Date.now();
}

export async function createPreviewToken(input: {
  objectId: string;
  createdBy?: string | null;
  expiresInDays?: number;
}): Promise<PreviewTokenRecord> {
  const db = getDb();
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + (input.expiresInDays ?? 7) * 24 * 60 * 60 * 1000);
  const [row] = await db
    .insert(dataObjectPreviewTokens)
    .values({ token, objectId: input.objectId, expiresAt, createdBy: input.createdBy ?? null })
    .returning();
  return row;
}

export async function getPreviewToken(token: string): Promise<PreviewTokenRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(dataObjectPreviewTokens).where(eq(dataObjectPreviewTokens.token, token)).limit(1);
  return row ?? null;
}

export async function listPreviewTokensForObject(objectId: string): Promise<PreviewTokenRecord[]> {
  const db = getDb();
  return db.select().from(dataObjectPreviewTokens).where(eq(dataObjectPreviewTokens.objectId, objectId));
}

export async function revokePreviewToken(token: string): Promise<void> {
  const db = getDb();
  await db.update(dataObjectPreviewTokens).set({ revokedAt: new Date() }).where(eq(dataObjectPreviewTokens.token, token));
}

export async function incrementPreviewTokenViewCount(token: string): Promise<void> {
  const db = getDb();
  await db
    .update(dataObjectPreviewTokens)
    .set({ viewCount: sql`${dataObjectPreviewTokens.viewCount} + 1` })
    .where(eq(dataObjectPreviewTokens.token, token));
}
