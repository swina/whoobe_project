import { eq } from 'drizzle-orm';
import { getDb } from './client.js';
import { cmsDocuments } from './cms-schema.js';
import type { WhoobeBlockNode } from '../cms/block-schema.js';

export interface CmsDocumentRecord {
  id: string;
  pimcoreId: string | null;
  title: string;
  slug: string;
  locale: string;
  rootBlock: WhoobeBlockNode;
  metadata: Record<string, unknown> | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function listDocuments(): Promise<CmsDocumentRecord[]> {
  const db = getDb();
  return db.select().from(cmsDocuments);
}

export async function getDocumentBySlug(slug: string): Promise<CmsDocumentRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(cmsDocuments).where(eq(cmsDocuments.slug, slug)).limit(1);
  return row ?? null;
}

export async function getDocumentById(id: string): Promise<CmsDocumentRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(cmsDocuments).where(eq(cmsDocuments.id, id)).limit(1);
  return row ?? null;
}

export async function getDocumentByPimcoreId(pimcoreId: string): Promise<CmsDocumentRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(cmsDocuments).where(eq(cmsDocuments.pimcoreId, pimcoreId)).limit(1);
  return row ?? null;
}

/**
 * Insert-or-update keyed by pimcoreId - re-running an import against the
 * same source document updates the existing row instead of duplicating it,
 * matching upsertAssetRecord's re-upload-by-pimcorePath behavior.
 */
export async function upsertDocumentRecord(input: {
  pimcoreId: string;
  title: string;
  slug: string;
  locale: string;
  rootBlock: WhoobeBlockNode;
  metadata?: Record<string, unknown> | null;
  status?: string;
}): Promise<CmsDocumentRecord> {
  const db = getDb();
  const now = new Date();

  const [row] = await db
    .insert(cmsDocuments)
    .values({
      pimcoreId: input.pimcoreId,
      title: input.title,
      slug: input.slug,
      locale: input.locale,
      rootBlock: input.rootBlock,
      metadata: input.metadata ?? null,
      status: input.status ?? 'draft',
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: cmsDocuments.pimcoreId,
      set: {
        title: input.title,
        slug: input.slug,
        locale: input.locale,
        rootBlock: input.rootBlock,
        metadata: input.metadata ?? null,
        updatedAt: now,
      },
    })
    .returning();
  return row;
}

export async function deleteDocumentRecord(slug: string): Promise<void> {
  const db = getDb();
  await db.delete(cmsDocuments).where(eq(cmsDocuments.slug, slug));
}

/**
 * Updates an existing document's editable content by id - what Whoobe
 * Studio's save flow calls, as opposed to upsertDocumentRecord's
 * insert-or-update-by-pimcoreId (the migration importer's re-run path).
 * Only rootBlock/title/status are ever edited here; slug/locale/pimcoreId
 * aren't exposed to the editor. `status` is optional and left untouched
 * when omitted - the editor's autosave loop never sends it, only the
 * explicit Save as Draft/Save and Publish actions do (see
 * apps/core-api/src/server.ts's PATCH /documents/:id).
 */
export async function updateDocumentContent(
  id: string,
  input: { title: string; rootBlock: WhoobeBlockNode; status?: string }
): Promise<CmsDocumentRecord | null> {
  const db = getDb();
  const [row] = await db
    .update(cmsDocuments)
    .set({
      title: input.title,
      rootBlock: input.rootBlock,
      updatedAt: new Date(),
      ...(input.status !== undefined ? { status: input.status } : {}),
    })
    .where(eq(cmsDocuments.id, id))
    .returning();
  return row ?? null;
}
