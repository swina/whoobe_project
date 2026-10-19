import { eq, or, like, sql, inArray, asc } from 'drizzle-orm';
import { getDb } from './client.js';
import { folders, assets } from './dam-schema.js';
import type { ExtractedAssetMetadata } from '../dam/metadata-extractor.js';
import type { CdnMirrorRecord } from '../dam/cdn-mirror.js';
import { indexAsset, deleteIndexedByDocument } from '../search/indexer.js';
import { insertEvent } from './object-events-records.js';
import { buildAssetBulkEvent, buildAssetEvent, summariseAsset, type EventActor } from './object-events.js';

/** Who did it and whether the write ends a flow, for the event the write produces; `silent` writes none (the migration tool, a move done in two steps). */
export interface AssetWriteOptions { actor?: EventActor; endOfFlow?: boolean; silent?: boolean }
const ctxOf = (o: AssetWriteOptions) => ({ actor: o.actor, endOfFlow: o.endOfFlow });

/** Up to this many files deleted with a folder get an `asset.deleted` each; more give ONE `asset.bulk` summary (never an event per file for a big folder). */
export const ASSET_FOLDER_EVENT_LIMIT = 10;

export interface FolderRecord {
  id: string;
  path: string;
  name: string;
  parentPath: string;
  isPublic: boolean | null;
  createdAt: Date;
}

export interface AssetRecord {
  id: string;
  pimcorePath: string;
  filename: string;
  folderPath: string;
  sizeBytes: number;
  mimeType: string;
  fileType: string;
  version: number;
  s3Key: string;
  isPublic: boolean;
  metadata: ExtractedAssetMetadata | null;
  cdnMirrors: Record<string, CdnMirrorRecord>;
  uploadedAt: Date;
  updatedAt: Date;
}

function pathOrDescendant(column: typeof folders.path | typeof assets.folderPath, path: string) {
  return or(eq(column, path), like(column, `${path}/%`));
}

export async function listFolders(): Promise<FolderRecord[]> {
  const db = getDb();
  return db.select().from(folders);
}

/**
 * "mkdir -p": makes sure a folder record exists for `folderPath` and every ancestor ("/a/b/c" -> "/a", "/a/b",
 * "/a/b/c"); the root is never a record. The DAM tree is built from these records, so an asset whose folder has none is
 * in the database and in the store but invisible in the dashboard (it happened to every file of a website import,
 * which uploads straight to the paths of the original installation). Returns how many records it created.
 */
export async function ensureFolderChain(folderPath: string): Promise<number> {
  const parts = folderPath.split('/').filter(Boolean);
  const db = getDb();
  let parent = '/';
  let created = 0;
  for (let i = 0; i < parts.length; i++) {
    const path = '/' + parts.slice(0, i + 1).join('/');
    const rows = await db
      .insert(folders)
      .values({ path, name: parts[i], parentPath: parent, isPublic: null })
      .onConflictDoNothing({ target: folders.path })
      .returning({ id: folders.id });
    created += rows.length;
    parent = path;
  }
  return created;
}

/** Creates the folder records that assets already in the database lack (see ensureFolderChain). */
export async function repairMissingFolders(): Promise<number> {
  const db = getDb();
  const rows = await db.selectDistinct({ folderPath: assets.folderPath }).from(assets);
  let created = 0;
  for (const { folderPath } of rows) created += await ensureFolderChain(folderPath);
  return created;
}

export async function createFolderRecord(input: {
  path: string;
  name: string;
  parentPath: string;
  isPublic?: boolean;
}): Promise<FolderRecord> {
  const db = getDb();
  const [existing] = await db.select().from(folders).where(eq(folders.path, input.path)).limit(1);
  if (existing) {
    throw new Error(`Folder "${input.path}" already exists.`);
  }
  const [row] = await db
    .insert(folders)
    .values({
      path: input.path,
      name: input.name,
      parentPath: input.parentPath,
      isPublic: input.isPublic ?? null,
    })
    .returning();
  return row;
}

/**
 * Deletes a folder and every descendant folder/asset record. Returns the
 * pimcorePaths of deleted assets so the caller can also remove the
 * matching S3 objects - this module only owns the DB rows, not storage.
 */
export async function deleteFolderRecord(path: string, opts: AssetWriteOptions = {}): Promise<{ deletedAssetPaths: string[] }> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const matchingAssets = await tx.select().from(assets).where(pathOrDescendant(assets.folderPath, path));
    const deletedAssetPaths = matchingAssets.map((a) => a.pimcorePath);

    await tx.delete(assets).where(pathOrDescendant(assets.folderPath, path));
    await tx.delete(folders).where(pathOrDescendant(folders.path, path));

    if (!opts.silent && matchingAssets.length) {
      if (matchingAssets.length <= ASSET_FOLDER_EVENT_LIMIT) {
        for (const a of matchingAssets) await insertEvent(tx, buildAssetEvent('asset.deleted', summariseAsset(a), ctxOf(opts)));
      } else {
        await insertEvent(tx, buildAssetBulkEvent(matchingAssets.map((a) => a.id), ctxOf(opts)));
      }
    }
    return { deletedAssetPaths };
  });
}

export async function countAssets(): Promise<number> {
  const [row] = await getDb().select({ n: sql<number>`count(*)::int` }).from(assets);
  return row?.n ?? 0;
}

export async function listAssets(folderPath?: string): Promise<AssetRecord[]> {
  const db = getDb();
  if (folderPath) {
    return db.select().from(assets).where(eq(assets.folderPath, folderPath));
  }
  return db.select().from(assets);
}

/**
 * Like listAssets, but matches the given folder and every descendant
 * folder (e.g. "private/logs/core-api" also matches
 * "private/logs/core-api/2026-09"). Callers should pass the prefix
 * without a trailing slash.
 */
export async function listAssetsUnderFolder(folderPrefix: string): Promise<AssetRecord[]> {
  const db = getDb();
  const normalized = folderPrefix.replace(/\/+$/, '');
  return db.select().from(assets).where(pathOrDescendant(assets.folderPath, normalized));
}

/** The records with these ids (ids that do not exist are simply missing from the result). */
export async function getAssetsByIds(ids: readonly string[]): Promise<AssetRecord[]> {
  if (!ids.length) return [];
  return getDb().select().from(assets).where(inArray(assets.id, [...ids]));
}

/** One page of the assets of a folder and everything below it, in a stable order; `folderPrefix` null means every folder. */
export async function listAssetsPage(folderPrefix: string | null, limit: number, offset: number): Promise<AssetRecord[]> {
  const q = getDb().select().from(assets);
  const filtered = folderPrefix ? q.where(pathOrDescendant(assets.folderPath, folderPrefix.replace(/\/+$/, ''))) : q;
  return filtered.orderBy(asc(assets.pimcorePath)).limit(limit).offset(offset);
}

export async function getAssetByPath(pimcorePath: string): Promise<AssetRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(assets).where(eq(assets.pimcorePath, pimcorePath)).limit(1);
  return row ?? null;
}

export async function getAssetById(id: string): Promise<AssetRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  return row ?? null;
}

/** Records (or replaces) one provider's CDN mirror for an asset -
 *  docs/plans/assets/assets-cdn.md. Merges into the existing `cdnMirrors`
 *  map keyed by `mirror.provider` rather than replacing the whole map, so
 *  mirroring to a second provider later doesn't lose the first's record.
 *  Throws if the asset doesn't exist (callers already have it loaded by
 *  this point - there's no sensible "create" fallback here). */
export async function updateAssetCdnMirror(id: string, mirror: CdnMirrorRecord): Promise<AssetRecord> {
  const db = getDb();
  const existing = await getAssetById(id);
  if (!existing) {
    throw new Error(`Asset not found: ${id}`);
  }
  const cdnMirrors = { ...existing.cdnMirrors, [mirror.provider]: mirror };
  const [row] = await db
    .update(assets)
    .set({ cdnMirrors, updatedAt: new Date() })
    .where(eq(assets.id, id))
    .returning();
  return row;
}

export interface AssetRecordInput {
  pimcorePath: string;
  filename: string;
  folderPath: string;
  sizeBytes: number;
  mimeType: string;
  fileType: string;
  s3Key: string;
  isPublic: boolean;
  // undefined = leave whatever metadata already exists untouched (e.g. a
  // new-version upload that doesn't re-extract EXIF); null/value = set it.
  metadata?: ExtractedAssetMetadata | null;
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

/** The insert-or-update itself, on the caller's transaction. `created` is false for a new version of an existing path. */
async function upsertInTx(tx: Tx, input: AssetRecordInput): Promise<{ row: AssetRecord; created: boolean }> {
  const [existing] = await tx.select().from(assets).where(eq(assets.pimcorePath, input.pimcorePath)).limit(1);
  const version = existing ? existing.version + 1 : 1;
  const uploadedAt = existing ? existing.uploadedAt : new Date();
  const metadata = input.metadata !== undefined ? input.metadata : (existing?.metadata ?? null);
  const now = new Date();

  const [row] = await tx
    .insert(assets)
    .values({
      pimcorePath: input.pimcorePath,
      filename: input.filename,
      folderPath: input.folderPath,
      sizeBytes: input.sizeBytes,
      mimeType: input.mimeType,
      fileType: input.fileType,
      version,
      s3Key: input.s3Key,
      isPublic: input.isPublic,
      metadata,
      uploadedAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: assets.pimcorePath,
      set: {
        filename: input.filename,
        folderPath: input.folderPath,
        sizeBytes: input.sizeBytes,
        mimeType: input.mimeType,
        fileType: input.fileType,
        version,
        s3Key: input.s3Key,
        isPublic: input.isPublic,
        metadata,
        updatedAt: now,
      },
    })
    .returning();
  return { row, created: !existing };
}

/**
 * Insert-or-update by pimcorePath: a re-upload to the same path is treated
 * as a new version (incrementing `version`, keeping the original
 * `uploadedAt`), matching the existing versioning behavior in damStore.ts.
 * Writes `asset.created` (a new path) or `asset.updated` (a new version) to the event outbox in the same transaction, unless `silent`.
 */
export async function upsertAssetRecord(input: AssetRecordInput, opts: AssetWriteOptions = {}): Promise<AssetRecord> {
  const { row, created } = await getDb().transaction(async (tx) => {
    const r = await upsertInTx(tx, input);
    if (!opts.silent) await insertEvent(tx, buildAssetEvent(r.created ? 'asset.created' : 'asset.updated', summariseAsset(r.row), ctxOf(opts)));
    return r;
  });
  void created;
  await ensureFolderChain(input.folderPath);
  await indexAsset(row);
  return row;
}

/** A move: the record at the new path, the one at the old path gone, ONE `asset.moved` (with `from`) in the same transaction. */
export async function moveAssetRecord(oldPimcorePath: string, input: AssetRecordInput, opts: AssetWriteOptions = {}): Promise<AssetRecord> {
  const db = getDb();
  const [old] = await db.select().from(assets).where(eq(assets.pimcorePath, oldPimcorePath)).limit(1);
  const row = await db.transaction(async (tx) => {
    const { row: moved } = await upsertInTx(tx, input);
    await tx.delete(assets).where(eq(assets.pimcorePath, oldPimcorePath));
    if (!opts.silent) await insertEvent(tx, buildAssetEvent('asset.moved', summariseAsset(moved), { ...ctxOf(opts), from: oldPimcorePath }));
    return moved;
  });
  await ensureFolderChain(input.folderPath);
  await indexAsset(row);
  if (old) await deleteIndexedByDocument('asset', old.id);
  return row;
}

export async function deleteAssetRecord(pimcorePath: string, opts: AssetWriteOptions = {}): Promise<void> {
  const db = getDb();
  const existing = await db.transaction(async (tx) => {
    const [found] = await tx.select().from(assets).where(eq(assets.pimcorePath, pimcorePath)).limit(1);
    await tx.delete(assets).where(eq(assets.pimcorePath, pimcorePath));
    if (found && !opts.silent) await insertEvent(tx, buildAssetEvent('asset.deleted', summariseAsset(found), ctxOf(opts)));
    return found;
  });
  if (existing) await deleteIndexedByDocument('asset', existing.id);
}

export async function updateAssetMetadata(
  pimcorePath: string,
  metadata: ExtractedAssetMetadata
): Promise<AssetRecord | null> {
  const db = getDb();
  const [row] = await db
    .update(assets)
    .set({ metadata, updatedAt: new Date() })
    .where(eq(assets.pimcorePath, pimcorePath))
    .returning();
  if (row) await indexAsset(row);
  return row ?? null;
}

/** Visibility recorded for the asset behind an S3 key (the original, or one of its `.thumbnails/..._<preset>.webp`
 *  variants). `null` when no asset record matches (e.g. system files such as logs). */
export async function getAssetVisibilityByKey(s3Key: string): Promise<boolean | null> {
  const db = getDb();
  const thumb = /^\.thumbnails\/(.+)_(?:thumb|medium|large)\.webp$/.exec(s3Key);
  if (thumb) {
    const likeBase = thumb[1].replace(/[\\%_]/g, (c) => `\\${c}`);
    const [row] = await db.select({ isPublic: assets.isPublic }).from(assets).where(sql`${assets.pimcorePath} LIKE ${'/' + likeBase + '.%'}`).limit(1);
    return row ? row.isPublic : null;
  }
  const [row] = await db.select({ isPublic: assets.isPublic }).from(assets).where(eq(assets.pimcorePath, '/' + s3Key)).limit(1);
  return row ? row.isPublic : null;
}
