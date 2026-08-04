import { pgTable, text, jsonb, uuid, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * The CMS's real, published website pages - see docs/plans/cms/whoobe-one-
 * editor-integration-plan.md §4 for the design this implements (Phase 0,
 * confirmed). Distinct from whoobe_one_templates (whoobe-one-template-
 * schema.ts), which stays a separate, unaffected concept: a reusable
 * starting-point document, not a real page with SEO/sitemap/publish state.
 *
 * `published`/`workflowState` deliberately reuse the exact shape
 * docs/plans/backend/object-publish-workflow-plan.md already designed for
 * Data Objects (§2.1 there) rather than a third, competing status
 * vocabulary: `published` is the hard public-API-visibility gate,
 * `workflowState` is editorial/organizational only and never gates
 * visibility except through an explicit future workflow-transition
 * side-effect. A page with no workflow configured just gets plain
 * Draft/Published toggling for free (`workflowState` stays null).
 *
 * `content` stays untyped jsonb - the `Element` tree shape it holds lives
 * in apps/whoobe-one-spike (a frontend app), not this backend package,
 * same treatment whoobe_one_templates.node already gets and for the same
 * reason. `seo`/`sitemap`/`search`, by contrast, don't depend on any
 * frontend-only type, so they get real, checked shapes below instead of
 * an untyped catch-all.
 */
export interface PageSeo {
  metaTitle?: string | null;
  metaDescription?: string | null;
  canonicalUrl?: string | null;
  robots?: { index: boolean; follow: boolean } | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
  structuredData?: Record<string, unknown> | null; // JSON-LD, verbatim
}

export interface PageSitemapSettings {
  included: boolean;
  priority?: number | null; // 0.0-1.0, sitemap.xml's own convention
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never' | null;
}

export interface PageSearchSettings {
  indexable: boolean;
  keywords?: string[] | null;
}

export const whoobePages = pgTable(
  'whoobe_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Links sibling-locale pages together as the "same" logical page -
    // always populated (defaults alongside `id`, never left null), so a
    // page with no translations yet still has a real group id a later
    // translation can attach to without a backfill migration.
    translationGroupId: uuid('translation_group_id').notNull().defaultRandom(),
    locale: text('locale').notNull().default('en'),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    category: text('category').notNull().default(''),
    published: boolean('published').notNull().default(false),
    workflowState: text('workflow_state'),
    content: jsonb('content').notNull(),
    seo: jsonb('seo').$type<PageSeo>(),
    sitemap: jsonb('sitemap').$type<PageSitemapSettings>(),
    search: jsonb('search').$type<PageSearchSettings>(),
    // Provenance for pages that arrived via the Pimcore migration plugin
    // (see the integration plan §3) - nullable, since most pages won't
    // have one; the natural key a re-run of the migration importer would
    // upsert against, same role cms_documents.pimcoreId already plays.
    pimcoreId: text('pimcore_id'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // (locale, slug), not slug alone - two different locales can
    // legitimately reuse the same slug string.
    localeSlugIdx: uniqueIndex('whoobe_pages_locale_slug_idx').on(table.locale, table.slug),
    // Doubles as the "all translations of this page" lookup index (its own
    // leading column), so no separate plain index on translationGroupId
    // alone is needed.
    translationGroupLocaleIdx: uniqueIndex('whoobe_pages_translation_group_locale_idx').on(
      table.translationGroupId,
      table.locale
    ),
    // Nullable-unique, same pattern cms-schema.ts's own pimcoreId already
    // uses - Postgres allows multiple NULLs through a unique index, which
    // is exactly right here (most pages won't have one at all).
    pimcoreIdIdx: uniqueIndex('whoobe_pages_pimcore_id_idx').on(table.pimcoreId),
  })
);
