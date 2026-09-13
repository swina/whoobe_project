import { eq, desc } from 'drizzle-orm';
import { getDb } from './client.js';
import { pwaSubscriptions } from './pwa-subscriptions-schema.js';

export interface PwaSubscriptionRecord {
  id: string;
  websiteId: string;
  provider: string;
  endpoint: string;
  keys: Record<string, string> | null;
  userAgent: string | null;
  createdAt: Date;
}

export async function listSubscriptions(websiteId: string): Promise<PwaSubscriptionRecord[]> {
  const db = getDb();
  return db
    .select()
    .from(pwaSubscriptions)
    .where(eq(pwaSubscriptions.websiteId, websiteId))
    .orderBy(desc(pwaSubscriptions.createdAt));
}

export async function createSubscription(input: {
  websiteId: string;
  provider?: string;
  endpoint: string;
  keys?: Record<string, string>;
  userAgent?: string | null;
}): Promise<PwaSubscriptionRecord> {
  const db = getDb();
  const [row] = await db
    .insert(pwaSubscriptions)
    .values({
      websiteId: input.websiteId,
      provider: input.provider ?? 'self',
      endpoint: input.endpoint,
      keys: input.keys ?? {},
      userAgent: input.userAgent ?? null,
    })
    .returning();
  return row;
}

export async function deleteSubscription(id: string): Promise<void> {
  const db = getDb();
  await db.delete(pwaSubscriptions).where(eq(pwaSubscriptions.id, id));
}

export async function deleteAllSubscriptions(websiteId: string): Promise<void> {
  const db = getDb();
  await db.delete(pwaSubscriptions).where(eq(pwaSubscriptions.websiteId, websiteId));
}