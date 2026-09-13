import { pgTable, text, jsonb, uuid, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { PageSeo, PageSitemapSettings, PageSearchSettings } from './whoobe-pages-schema.js';

/**
 * Staging table for the Documents → Pages migration (docs/plans/cms/
 * documents-migration.md §3 Phase 1, the "migrate to a temporary table
 * first, review, then promote" workflow): a structural mirror of
 * `whoobe_pages` where `migrate-documents --staging` lands converted pages
 * WITHOUT touching the real, editable pages table. An editor reviews/
 * validates the staged rows (e.g. via a backend list endpoint or the CLI's
 * promote dry-run), and only an explicit promote step copies them into
 * `whoobe_pages`.
 *
 * Same columns and same unique indexes as `whoobe_pages` - deliberately:
 * a row that would violate `whoobe_pages`'s constraints (duplicate
 * pimcore_id, colliding (locale, slug)) must fail at staging time, not
 * surprise an admin later at promote time. The one extra column,
 * `staged_at`, records when the staged version was written so a reviewer
 * can tell stale staged rows from fresh ones.
 *
 * `published`/`workflowState` are copied across from `whoobe_pages`'s
 * shape but staged rows always land unpublished (`migrate-documents`
 * converts fresh documents; a re-stage refreshes content, never flips
 * publish state). Promote deliberately goes through
 * `upsertWhoobePageByPimcoreId` (whoobe-pages-records.ts), which never
 * touches `published`/`workflowState` on the real table either.
 */
export const whoobePagesStaging = pgTable(
  'whoobe_pages_staging',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    translationGroupId: uuid('translation_group_id').notNull().defaultRandom(),
    locale: text('locale').notNull().default('en'),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    category: text('category').notNull().default(''),
    kind: text('kind').$type<'content' | 'module' | 'app'>().notNull().default('content'),
    published: boolean('published').notNull().default(false),
    workflowState: text('workflow_state'),
    content: jsonb('content').notNull(),
    seo: jsonb('seo').$type<PageSeo>(),
    sitemap: jsonb('sitemap').$type<PageSitemapSettings>(),
    search: jsonb('search').$type<PageSearchSettings>(),
    pimcoreId: text('pimcore_id'),
    path: text('path'),
    websiteId: uuid('website_id'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    stagedAt: timestamp('staged_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    localeSlugIdx: uniqueIndex('whoobe_pages_staging_locale_slug_idx').on(table.locale, table.slug),
    translationGroupLocaleIdx: uniqueIndex('whoobe_pages_staging_translation_group_locale_idx').on(
      table.translationGroupId,
      table.locale
    ),
    pimcoreIdIdx: uniqueIndex('whoobe_pages_staging_pimcore_id_idx').on(table.pimcoreId),
  })
);
