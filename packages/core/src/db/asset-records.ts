import { eq, or, like } from 'drizzle-orm';
import { getDb } from './client.js';
import { folders, assets } from './dam-schema.js';
import type { ExtractedAssetMetadata } from '../dam/metadata-extractor.js';

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
export async function deleteFolderRecord(path: string): Promise<{ deletedAssetPaths: string[] }> {
  const db = getDb();
  const matchingAssets = await db
    .select({ pimcorePath: assets.pimcorePath })
    .from(assets)
    .where(pathOrDescendant(assets.folderPath, path));

  const deletedAssetPaths = matchingAssets.map((a) => a.pimcorePath);

  await db.delete(assets).where(pathOrDescendant(assets.folderPath, path));
  await db.delete(folders).where(pathOrDescendant(folders.path, path));

  return { deletedAssetPaths };
}

export async function listAssets(folderPath?: string): Promise<AssetRecord[]> {
  const db = getDb();
  if (folderPath) {
    return db.select().from(assets).where(eq(assets.folderPath, folderPath));
  }
  return db.select().from(assets);
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

/**
 * Insert-or-update by pimcorePath: a re-upload to the same path is treated
 * as a new version (incrementing `version`, keeping the original
 * `uploadedAt`), matching the existing versioning behavior in damStore.ts.
 */
export async function upsertAssetRecord(input: {
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
}): Promise<AssetRecord> {
  const db = getDb();
  const existing = await getAssetByPath(input.pimcorePath);
  const version = existing ? existing.version + 1 : 1;
  const uploadedAt = existing ? existing.uploadedAt : new Date();
  const metadata = input.metadata !== undefined ? input.metadata : (existing?.metadata ?? null);
  const now = new Date();

  const [row] = await db
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
  return row;
}

export async function deleteAssetRecord(pimcorePath: string): Promise<void> {
  const db = getDb();
  await db.delete(assets).where(eq(assets.pimcorePath, pimcorePath));
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
  return row ?? null;
}
