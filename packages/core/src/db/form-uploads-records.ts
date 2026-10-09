import { and, eq, inArray, lt, gte, sql } from 'drizzle-orm';
import { getDb } from './client.js';
import { formUploads } from './form-uploads-schema.js';

export type FormUploadStatus = 'pending' | 'staged' | 'attached' | 'rejected' | 'expired';
export type FormUploadRecord = typeof formUploads.$inferSelect;

/** One row per approved intent. */
export async function createFormUpload(input: {
  websiteId: string;
  formRef: string;
  extension: string;
  originalName: string;
  declaredSize: number;
}): Promise<FormUploadRecord> {
  const [row] = await getDb().insert(formUploads).values({ ...input, status: 'pending' }).returning();
  return row;
}

export async function getFormUpload(id: string): Promise<FormUploadRecord | null> {
  const [row] = await getDb().select().from(formUploads).where(eq(formUploads.id, id)).limit(1);
  return row ?? null;
}

/** Bytes this website has had approved today (UTC day): what the daily quota counts, pending intents included so a visitor cannot
 *  open many intents and fill them later. Refused and expired ones do not count. */
export async function websiteUploadBytesToday(websiteId: string, now = new Date()): Promise<number> {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [row] = await getDb()
    .select({ total: sql<number>`coalesce(sum(${formUploads.declaredSize}), 0)::float8` })
    .from(formUploads)
    .where(and(eq(formUploads.websiteId, websiteId), gte(formUploads.createdAt, dayStart), inArray(formUploads.status, ['pending', 'staged', 'attached'])));
  return Number(row?.total ?? 0);
}

/** The bytes arrived and passed the checks: pending -> staged. Only a pending row moves (a ticket works once). */
export async function markFormUploadStaged(id: string, input: { s3Key: string; size: number }): Promise<boolean> {
  const rows = await getDb().update(formUploads).set({ status: 'staged', s3Key: input.s3Key, size: input.size })
    .where(and(eq(formUploads.id, id), eq(formUploads.status, 'pending'))).returning({ id: formUploads.id });
  return rows.length === 1;
}

export async function markFormUploadRejected(id: string, reason: string): Promise<void> {
  await getDb().update(formUploads).set({ status: 'rejected', rejectedReason: reason.slice(0, 200) })
    .where(and(eq(formUploads.id, id), inArray(formUploads.status, ['pending', 'staged'])));
}

/** staged -> attached, once, for the form it was issued for. Returns false when it was not staged for that website and form. */
export async function markFormUploadAttached(id: string, input: { websiteId: string; formRef: string; s3Key: string; assetId?: string | null; submissionId?: string | null }): Promise<boolean> {
  const rows = await getDb().update(formUploads)
    .set({ status: 'attached', s3Key: input.s3Key, assetId: input.assetId ?? null, submissionId: input.submissionId ?? null, attachedAt: new Date() })
    .where(and(eq(formUploads.id, id), eq(formUploads.status, 'staged'), eq(formUploads.websiteId, input.websiteId), eq(formUploads.formRef, input.formRef)))
    .returning({ id: formUploads.id });
  return rows.length === 1;
}

/** Uploads never attached to a submission within `olderThanMs`: pending ones are marked expired, staged ones are returned (with their
 *  storage key) so the caller deletes the object, then marks them. */
export async function expireStaleFormUploads(olderThanMs: number, now = new Date()): Promise<FormUploadRecord[]> {
  const cutoff = new Date(now.getTime() - olderThanMs);
  return getDb().update(formUploads).set({ status: 'expired' })
    .where(and(inArray(formUploads.status, ['pending', 'staged']), lt(formUploads.createdAt, cutoff))).returning();
}
