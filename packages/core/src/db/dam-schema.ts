import { pgTable, text, boolean, integer, timestamp, jsonb, uuid } from 'drizzle-orm/pg-core';
import type { ExtractedAssetMetadata } from '../dam/metadata-extractor.js';

/**
 * DAM records: which assets/folders exist and their metadata. This is the
 * multi-user source of truth - the admin-dashboard used to keep this in
 * browser localStorage, which meant two admins (or two browsers) never saw
 * the same asset list. The actual file bytes still live in S3/MinIO; these
 * tables never store URLs (public links are stable but presigned private
 * links expire in ~1h, so they're always resolved fresh - see
 * apps/asset-processor's /api/v1/dam/asset-urls).
 */

export const folders = pgTable('folders', {
  id: uuid('id').primaryKey().defaultRandom(),
  path: text('path').notNull().unique(), // e.g. /logos
  name: text('name').notNull(),
  parentPath: text('parent_path').notNull(), // e.g. /
  // Nullable: null means "no explicit override for this folder", which
  // falls through to the wildcard folderRules config - see damStore.ts's
  // isPathPublic(). Only `true`/`false` short-circuits that fallback.
  isPublic: boolean('is_public'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  pimcorePath: text('pimcore_path').notNull().unique(),
  filename: text('filename').notNull(),
  folderPath: text('folder_path').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  mimeType: text('mime_type').notNull(),
  fileType: text('file_type').notNull(),
  version: integer('version').notNull().default(1),
  s3Key: text('s3_key').notNull(),
  isPublic: boolean('is_public').notNull().default(false),
  metadata: jsonb('metadata').$type<ExtractedAssetMetadata | null>(),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
