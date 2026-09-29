import { pgTable, text, jsonb, uuid, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * Instant version history for the whoobe-one-spike editor's two content
 * types (whoobe_pages.content and whoobe_one_snippets.node) - a generic
 * table rather than one per resource type, since both are just an opaque
 * WhoobeElementNode tree snapshot at a point in time. A row is written
 * automatically on every save (manual or autosave) whose content actually
 * changed - see snapshotContentVersion()'s callers in
 * whoobe-pages-records.ts/whoobe-one-snippet-records.ts - capturing the
 * PRE-save state, so the live row itself is always the "current" version
 * and this table holds up to MAX_VERSIONS_PER_RESOURCE (content-versions-
 * records.ts) prior states an editor can browse back to and reload.
 */
export const contentVersions = pgTable(
  'content_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    resourceType: text('resource_type').$type<'page' | 'snippet'>().notNull(),
    resourceId: uuid('resource_id').notNull(),
    content: jsonb('content').notNull(),
    // Denormalized title/name at snapshot time, purely for display in the
    // version-history list - never read back for anything else, so a
    // rename after the fact doesn't need to touch old snapshots.
    label: text('label'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    resourceCreatedIdx: index('content_versions_resource_created_idx').on(
      table.resourceType,
      table.resourceId,
      table.createdAt
    ),
  })
);
