// Search index maintenance (docs/plans/search-engine/search-engine-plan.md
// §5): upsert/delete of search_documents rows, called from the records
// layer (single writer) after every page/object/class/asset write, plus the
// explicit full-rebuild path. The index is a projection - it never
// decides truth, and any drift heals via reindexAll().
//
// Every public entry point wraps its work in try/catch: content is opaque
// jsonb (a malformed tree must never break a publish because indexing
// threw), failures are logged and left to reindex.
import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { searchDocuments, type SearchDocumentType } from '../db/search-documents-schema.js';
import { extractPageText, extractObjectText, extractClassDoc, extractAssetDoc, type ExtractedSearchDoc } from './extract.js';
import type { WhoobePageRecord } from '../db/whoobe-pages-records.js';
import type { DataObjectRecord } from '../db/data-objects-records.js';
import type { DataClassRecord } from '../db/data-classes-records.js';
import type { AssetRecord } from '../db/asset-records.js';

function safeIndex(label: string, fn: () => Promise<void>): Promise<void> {
  return fn().catch((err) => {
    console.warn(`[search] failed to index ${label}:`, err instanceof Error ? err.message : err);
  });
}

export function upsertSearchDocument(
  documentType: SearchDocumentType,
  documentId: string,
  doc: ExtractedSearchDoc,
  options: { locale: string; websiteId?: string | null; published: boolean; publishedAt?: Date | null; payload: Record<string, unknown> }
): Promise<void> {
  return safeIndex(`${documentType}:${documentId}:${options.locale}`, async () => {
    const db = getDb();
    await db
      .insert(searchDocuments)
      .values({
        documentType,
        documentId,
        locale: options.locale,
        websiteId: options.websiteId ?? null,
        published: options.published,
        publishedAt: options.publishedAt ?? null,
        title: doc.title,
        path: doc.path,
        category: doc.category,
        keywords: doc.keywords,
        body: doc.body,
        excerpt: doc.excerpt,
        payload: options.payload,
      })
      .onConflictDoUpdate({
        target: [searchDocuments.documentType, searchDocuments.documentId, searchDocuments.locale],
        set: {
          websiteId: options.websiteId ?? null,
          published: options.published,
          publishedAt: options.publishedAt ?? null,
          title: doc.title,
          path: doc.path,
          category: doc.category,
          keywords: doc.keywords,
          body: doc.body,
          excerpt: doc.excerpt,
          payload: options.payload,
          updatedAt: new Date(),
        },
      });
  });
}

export async function indexPage(page: WhoobePageRecord): Promise<void> {
  // `search.indexable === false` means "never surface publicly" - such a
  // page is indexed with published=false so it stays admin-only (the plan's
  // indexable flag semantics: public gate, not index exclusion).
  const published = page.published && page.search?.indexable !== false;
  return upsertSearchDocument('page', page.id, extractPageText(page), {
    locale: page.locale,
    websiteId: page.websiteId,
    published,
    publishedAt: page.publishedAt,
    payload: { slug: page.slug, websiteId: page.websiteId ?? null },
  });
}

export async function indexObject(object: DataObjectRecord, classDef: DataClassRecord): Promise<void> {
  return upsertSearchDocument('object', object.id, extractObjectText(object, classDef), {
    locale: object.locale,
    websiteId: null,
    published: object.published,
    publishedAt: object.publishedAt,
    payload: { classId: object.classId, className: classDef.label || classDef.name, key: object.key, translationGroupId: object.translationGroupId },
  });
}

export async function indexClass(classDef: DataClassRecord): Promise<void> {
  return upsertSearchDocument('class', classDef.id, extractClassDoc(classDef), {
    locale: 'en',
    websiteId: null,
    published: true,
    publishedAt: classDef.createdAt,
    payload: { className: classDef.label || classDef.name },
  });
}

/** DAM asset -> search_documents row. Published mirrors the asset's own
 *  isPublic flag: private assets stay admin-only, matching the public
 *  endpoint's published-only gate. The asset id is the document id (there
 *  is no per-locale split for assets). */
export async function indexAsset(asset: AssetRecord): Promise<void> {
  return upsertSearchDocument('asset', asset.id, extractAssetDoc(asset), {
    locale: 'en',
    websiteId: null,
    published: asset.isPublic,
    publishedAt: asset.updatedAt,
    payload: { pimcorePath: asset.pimcorePath, folderPath: asset.folderPath, filename: asset.filename, mimeType: asset.mimeType, fileType: asset.fileType, isPublic: asset.isPublic },
  });
}

export async function deleteIndexedByDocument(documentType: SearchDocumentType, documentId: string): Promise<void> {
  return safeIndex(`delete ${documentType}:${documentId}`, async () => {
    const db = getDb();
    await db
      .delete(searchDocuments)
      .where(and(eq(searchDocuments.documentType, documentType), eq(searchDocuments.documentId, documentId)));
  });
}

/** Removes every object row of a class - used when a class's objects are
 *  wiped (deleteDataObjectsByClassId) without per-row delete calls. */
export async function deleteIndexedByClass(classId: string): Promise<void> {
  return safeIndex(`delete objects of class ${classId}`, async () => {
    const db = getDb();
    await db.delete(searchDocuments).where(sql`${searchDocuments.documentType} = 'object' AND ${searchDocuments.payload}->>'classId' = ${classId}`);
  });
}

export interface ReindexCounts {
  pages: number;
  objects: number;
  classes: number;
  assets: number;
}

/** Full rebuild from the source tables - idempotent, safe to run while
 *  writes happen (per-document upserts, last-write-wins). */
export async function reindexAll(): Promise<ReindexCounts> {
  const { listPublishedWhoobePages } = await import('../db/whoobe-pages-records.js');
  const { listDataObjects } = await import('../db/data-objects-records.js');
  const { listDataClasses, getDataClass } = await import('../db/data-classes-records.js');
  const { listAssets } = await import('../db/asset-records.js');

  const pages = await listPublishedWhoobePages();
  const classes = await listDataClasses();
  const objects = await listDataObjects();
  const assets = await listAssets();
  const classById = new Map(classes.map((c) => [c.id, c]));

  let pageCount = 0;
  let objectCount = 0;
  let assetCount = 0;
  for (const page of pages) {
    await indexPage(page);
    pageCount++;
  }
  for (const object of objects) {
    const classDef = classById.get(object.classId) ?? (await getDataClass(object.classId));
    if (!classDef) continue;
    await indexObject(object, classDef);
    objectCount++;
  }
  for (const cls of classes) {
    await indexClass(cls);
  }
  for (const asset of assets) {
    await indexAsset(asset);
    assetCount++;
  }

  return { pages: pageCount, objects: objectCount, classes: classes.length, assets: assetCount };
}