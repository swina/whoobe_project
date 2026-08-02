import { pgTable, text, jsonb, uuid, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { WhoobeBlockNode } from '../cms/block-schema.js';

/**
 * Migrated/authored page content. `pimcoreId` is nullable because not every
 * document originates from a Pimcore import (Whoobe Studio can also author
 * pages from scratch) - when present, it's the natural key a re-run of the
 * migration importer upserts against (see cms-records.ts).
 *
 * `status` intentionally reuses the same 'draft'/'published' vocabulary
 * planned in docs/plans/backend/object-publish-workflow-plan.md rather than
 * inventing a second, competing status concept for documents specifically.
 */
export const cmsDocuments = pgTable(
  'cms_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pimcoreId: text('pimcore_id'),
    title: text('title').notNull(),
    slug: text('slug').notNull().unique(),
    locale: text('locale').notNull().default('en'),
    rootBlock: jsonb('root_block').$type<WhoobeBlockNode>().notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    status: text('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pimcoreIdIdx: uniqueIndex('cms_documents_pimcore_id_idx').on(table.pimcoreId),
  })
);
