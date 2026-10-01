import { eq, desc, and, or } from 'drizzle-orm';
import { getDb } from './client.js';
import { whoobePages, type PageSeo, type PageSitemapSettings, type PageSearchSettings } from './whoobe-pages-schema.js';
import { indexPage, deleteIndexedByDocument } from '../search/indexer.js';
import { snapshotContentVersion } from './content-versions-records.js';

export interface WhoobePageRecord {
  id: string;
  translationGroupId: string;
  locale: string;
  slug: string;
  title: string;
  category: string;
  kind: 'content' | 'module' | 'app';
  published: boolean;
  workflowState: string | null;
  content: unknown;
  seo: PageSeo | null;
  sitemap: PageSitemapSettings | null;
  search: PageSearchSettings | null;
  pimcoreId: string | null;
  path: string | null;
  websiteId: string | null;
  themeId: string | null;
  thumbnail: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function listWhoobePages(websiteId?: string | null): Promise<WhoobePageRecord[]> {
  const db = getDb();
  const conditions: any[] = [];
  if (websiteId) {
    conditions.push(eq(whoobePages.websiteId, websiteId));
  }
  if (conditions.length) {
    return db.select().from(whoobePages).where(and(...conditions)).orderBy(desc(whoobePages.createdAt));
  }
  return db.select().from(whoobePages).orderBy(desc(whoobePages.createdAt));
}

export async function getWhoobePage(id: string): Promise<WhoobePageRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(whoobePages).where(eq(whoobePages.id, id)).limit(1);
  return row ?? null;
}

/** Every locale variant of the same logical page, for a translations
 * picker/switcher - see the integration plan §4 on why this is a plain
 * query against `translationGroupId` rather than a join table. */
export async function listWhoobePageTranslations(translationGroupId: string): Promise<WhoobePageRecord[]> {
  const db = getDb();
  return db.select().from(whoobePages).where(eq(whoobePages.translationGroupId, translationGroupId));
}

export async function createWhoobePage(input: {
  translationGroupId?: string;
  locale?: string;
  slug: string;
  title: string;
  category?: string;
  kind?: 'content' | 'module' | 'app';
  content: unknown;
  seo?: PageSeo | null;
  sitemap?: PageSitemapSettings | null;
  search?: PageSearchSettings | null;
  pimcoreId?: string | null;
  path?: string | null;
  websiteId?: string | null;
  themeId?: string | null;
}): Promise<WhoobePageRecord> {
  const db = getDb();
  const [row] = await db
    .insert(whoobePages)
    .values({
      // Omitted entirely (not passed as undefined) when the caller has no
      // existing group to join - lets the column's own defaultRandom()
      // generate a fresh id, rather than this function reimplementing
      // that default.
      ...(input.translationGroupId ? { translationGroupId: input.translationGroupId } : {}),
      locale: input.locale ?? 'en',
      slug: input.slug,
      title: input.title,
      category: input.category ?? '',
      kind: input.kind ?? 'content',
      content: input.content,
      seo: input.seo ?? null,
      sitemap: input.sitemap ?? null,
      search: input.search ?? null,
      pimcoreId: input.pimcoreId ?? null,
      path: input.path ?? null,
      websiteId: input.websiteId ?? null,
      themeId: input.themeId ?? null,
    })
    .returning();
  await indexPage(row);
  return row;
}

export async function updateWhoobePage(
  id: string,
  input: {
    slug?: string;
    title?: string;
    category?: string;
    kind?: 'content' | 'module' | 'app';
    published?: boolean;
    workflowState?: string | null;
    content?: unknown;
    locale?: string;
    path?: string | null;
    websiteId?: string | null;
    themeId?: string | null;
    seo?: PageSeo | null;
    sitemap?: PageSitemapSettings | null;
    search?: PageSearchSettings | null;
  }
): Promise<WhoobePageRecord | null> {
  const db = getDb();

  // Snapshot the PRE-update content as a version before it's overwritten -
  // see content-versions-schema.ts. Skipped when the content is unchanged
  // (a no-op autosave tick shouldn't burn through the 10-slot history) or
  // when this update doesn't touch content at all.
  if (input.content !== undefined) {
    const current = await getWhoobePage(id);
    if (current && JSON.stringify(current.content) !== JSON.stringify(input.content)) {
      await snapshotContentVersion({ resourceType: 'page', resourceId: id, content: current.content, label: current.title });
    }
  }

  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (input.slug !== undefined) values.slug = input.slug;
  if (input.title !== undefined) values.title = input.title;
  if (input.category !== undefined) values.category = input.category;
  if (input.kind !== undefined) values.kind = input.kind;
  if (input.workflowState !== undefined) values.workflowState = input.workflowState;
  if (input.content !== undefined) values.content = input.content;
  if (input.seo !== undefined) values.seo = input.seo;
  if (input.sitemap !== undefined) values.sitemap = input.sitemap;
  if (input.search !== undefined) values.search = input.search;
  if (input.locale !== undefined) values.locale = input.locale;
  if (input.path !== undefined) values.path = input.path;
  if (input.websiteId !== undefined) values.websiteId = input.websiteId;
  if (input.themeId !== undefined) values.themeId = input.themeId;

  if (input.published !== undefined) {
    values.published = input.published;
    // First transition into published gets a real publishedAt timestamp;
    // re-saving an already-published page (or unpublishing it) never
    // overwrites it - "when was this page first published" shouldn't
    // silently reset on every later edit.
    if (input.published) {
      const current = await getWhoobePage(id);
      if (current && !current.publishedAt) values.publishedAt = new Date();
    }
  }

  const [row] = await db.update(whoobePages).set(values).where(eq(whoobePages.id, id)).returning();
  if (row) await indexPage(row);
  return row ?? null;
}

export async function deleteWhoobePage(id: string): Promise<void> {
  const db = getDb();
  await db.delete(whoobePages).where(eq(whoobePages.id, id));
  await deleteIndexedByDocument('page', id);
}

/**
 * Public lookup: returns a single published page by locale + slug. Respects
 * the `published` gate - unpublished pages are never returned through this
 * function, regardless of workflowState.
 */
export async function getPublishedWhoobePageBySlug(
  locale: string,
  slug: string,
  websiteId?: string | null
): Promise<WhoobePageRecord | null> {
  const db = getDb();
  const conditions = [
    eq(whoobePages.locale, locale),
    eq(whoobePages.slug, slug),
    eq(whoobePages.published, true),
    // Modules fill website-template slots, never routes.
    or(eq(whoobePages.kind, 'content'), eq(whoobePages.kind, 'app')),
  ];
  if (websiteId) {
    conditions.push(eq(whoobePages.websiteId, websiteId));
  }
  const [row] = await db.select().from(whoobePages).where(and(...conditions)).limit(1);
  return row ?? null;
}

/**
 * Find a published page by slug + websiteId, ignoring locale. Returns the
 * first match — used by the SEO-friendly /{rootPath}/{slug} public endpoint
 * that doesn't require locale in the URL. The caller receives the page's
 * own locale from the record.
 */
export async function getPublishedWhoobePageBySlugAnyLocale(
  slug: string,
  websiteId?: string | null
): Promise<WhoobePageRecord | null> {
  const db = getDb();
  const conditions = [
    eq(whoobePages.slug, slug),
    eq(whoobePages.published, true),
    or(eq(whoobePages.kind, 'content'), eq(whoobePages.kind, 'app')),
  ];
  if (websiteId) {
    conditions.push(eq(whoobePages.websiteId, websiteId));
  }
  const [row] = await db.select().from(whoobePages).where(and(...conditions)).limit(1);
  return row ?? null;
}

/**
 * Promote guard: does a LIVE, PUBLISHED page already exist that promoting
 * this staged row would overwrite? Matches either the same `pimcoreId` (the
 * upsert conflict target of upsertWhoobePageByPimcoreId - the exact case
 * that clobbers an editor's later edits, which is what happened when the
 * staged Pages panel's per-row Promote was mis-wired to the whole-table
 * endpoint) or the same `slug` path (the user-facing "same path" rule -
 * matched regardless of locale deliberately, since migrated rows are still
 * hardcoded `locale: 'en'` today (plan Phase 3) while real published pages
 * may be `it`, so a locale-qualified match would let the overwrite through).
 * Returns null when no published page is at risk.
 *
 * Published-only on purpose: unpublished pages are fair game (they're
 * drafts, and promote's upsert never flips publish state), but a page an
 * editor explicitly published is the one thing a migration re-run must
 * never silently overwrite.
 */
export async function findPublishedWhoobePageConflict(
  locale: string,
  slug: string,
  pimcoreId: string
): Promise<WhoobePageRecord | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(whoobePages)
    .where(and(eq(whoobePages.published, true), or(eq(whoobePages.pimcoreId, pimcoreId), eq(whoobePages.slug, slug))))
    .limit(1);
  return row ?? null;
}

/**
 * List all published pages. Used for sitemap generation and public listing.
 * `content`-kind only - modules are excluded (they're not routes and never
 * belong in a sitemap).
 */
export async function listPublishedWhoobePages(websiteId?: string | null): Promise<WhoobePageRecord[]> {
  const db = getDb();
  const conditions = [eq(whoobePages.published, true), or(eq(whoobePages.kind, 'content'), eq(whoobePages.kind, 'app'))];
  if (websiteId) {
    conditions.push(eq(whoobePages.websiteId, websiteId));
  }
  return db.select().from(whoobePages).where(and(...conditions)).orderBy(desc(whoobePages.updatedAt));
}

/** Published `module`-kind pages for a website - what a website template's
 *  header/aside/footer slots are filled with (website-templates.md Phase 4).
 *  Resolved by locale with a defaultLocale fallback so a missing translation
 *  still renders a slot rather than silently dropping it. */
export async function listPublishedModulePages(websiteId: string, locale: string, defaultLocale?: string | null): Promise<WhoobePageRecord[]> {
  const db = getDb();
  const conditions = [eq(whoobePages.websiteId, websiteId), eq(whoobePages.published, true), eq(whoobePages.kind, 'module')];
  const rows = await db.select().from(whoobePages).where(and(...conditions)).orderBy(desc(whoobePages.updatedAt));
  const byLocale = new Map<string, WhoobePageRecord[]>();
  for (const row of rows) {
    const list = byLocale.get(row.locale) ?? [];
    list.push(row);
    byLocale.set(row.locale, list);
  }
  // A slot needs a deterministic page order per locale; the caller maps by id.
  const result = byLocale.get(locale);
  if (result) return result;
  if (defaultLocale) {
    const fallback = byLocale.get(defaultLocale);
    if (fallback) return fallback;
  }
  return rows;
}

/** Insert-or-update-by-`pimcoreId` - the migration importer's own re-run
 * path (packages/migration-tool), same role `upsertDocumentRecord`
 * (cms-records.ts) plays for `cms_documents`. Re-importing the same
 * Pimcore document a second time (content changed at the source, or the
 * importer is just being re-run) updates the existing page in place
 * rather than creating a duplicate - relies on `pimcoreIdIdx`'s real
 * unique constraint (whoobe-pages-schema.ts), not an application-level
 * "check first" race. `published`/`workflowState` are deliberately never
 * touched by this path - a re-import must never silently unpublish (or
 * publish) a page an editor has since made an explicit call about. */
export async function upsertWhoobePageByPimcoreId(input: {
  pimcoreId: string;
  slug: string;
  title: string;
  locale?: string;
  category?: string;
  content: unknown;
  seo?: PageSeo | null;
  sitemap?: PageSitemapSettings | null;
  search?: PageSearchSettings | null;
  websiteId?: string | null;
}): Promise<WhoobePageRecord> {
  const db = getDb();
  const now = new Date();

  const [row] = await db
    .insert(whoobePages)
    .values({
      pimcoreId: input.pimcoreId,
      slug: input.slug,
      title: input.title,
      locale: input.locale ?? 'en',
      category: input.category ?? '',
      content: input.content,
      seo: input.seo ?? null,
      sitemap: input.sitemap ?? null,
      search: input.search ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: whoobePages.pimcoreId,
      set: {
        slug: input.slug,
        title: input.title,
        locale: input.locale ?? 'en',
        category: input.category ?? '',
        content: input.content,
        seo: input.seo ?? null,
        sitemap: input.sitemap ?? null,
        search: input.search ?? null,
        updatedAt: now,
      },
    })
    .returning();
  await indexPage(row);
  return row;
}

/** Sets (or clears, with null) a page's captured preview thumbnail. Touches
 *  only that column - no content version snapshot, no reindex, no updatedAt
 *  bump - since a thumbnail isn't a content edit. */
export async function setWhoobePageThumbnail(id: string, thumbnail: string | null): Promise<boolean> {
  const db = getDb();
  const rows = await db.update(whoobePages).set({ thumbnail }).where(eq(whoobePages.id, id)).returning({ id: whoobePages.id });
  return rows.length > 0;
}
