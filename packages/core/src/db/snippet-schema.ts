import { pgTable, text, jsonb, uuid, timestamp } from 'drizzle-orm/pg-core';
import type { WhoobeBlockNode } from '../cms/block-schema.js';

/**
 * A reusable content fragment saved from a document's editor - captures one
 * WhoobeBlockNode subtree (itself + all nested children) so it can be
 * re-inserted elsewhere, distinct from the per-document "Snippets in this
 * Document" outline (packages/migration-tool never writes here; only Whoobe
 * Studio's "Save as Snippet" action does, see apps/whoobe-studio/src/
 * SaveSnippetModal.vue).
 */
export const cmsSnippets = pgTable('cms_snippets', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  icon: text('icon'),
  node: jsonb('node').$type<WhoobeBlockNode>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
