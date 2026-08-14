import { pgTable, text, uuid, boolean, timestamp, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Denormalized full-text search index - the projection of content meant
 * to be searched, never a source of truth (see docs/plans/search-engine/
 * search-engine-plan.md). Populated by the indexer in src/search/indexer.ts
 * through hooks in the whoobe-pages/data-objects/data-classes records
 * layers, plus the explicit reindex path.
 *
 * The `document_tsvector` generated column and the GIN/trigram indexes
 * exist only in migration 0021_search_documents.sql (raw SQL) - drizzle
 * has no tsvector column type, so this table deliberately models just the
 * columns records-layer code touches; tsvector-aware queries go through
 * raw sql fragments (see src/search/query.ts).
 */
export const SEARCH_DOCUMENT_TYPES = ['page', 'object', 'class', 'asset'] as const;
export type SearchDocumentType = (typeof SEARCH_DOCUMENT_TYPES)[number];

export const searchDocuments = pgTable(
  'search_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentType: text('document_type').notNull(),
    documentId: uuid('document_id').notNull(),
    locale: text('locale').notNull().default('en'),
    websiteId: uuid('website_id'),
    published: boolean('published').notNull().default(false),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    title: text('title').notNull().default(''),
    path: text('path').notNull().default(''),
    category: text('category').notNull().default(''),
    keywords: text('keywords').array().notNull().default(sql`ARRAY[]::text[]`),
    body: text('body').notNull().default(''),
    excerpt: text('excerpt').notNull().default(''),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
  },
  (table) => ({
    // Name must match the unique constraint created in migration
    // 0021_search_documents.sql.
    uniqueDoc: uniqueIndex('search_documents_unique').on(table.documentType, table.documentId, table.locale),
  })
);

export type SearchDocumentRecord = typeof searchDocuments.$inferSelect;