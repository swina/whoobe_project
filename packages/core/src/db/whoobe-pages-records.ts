import { eq, desc } from 'drizzle-orm';
import { getDb } from './client.js';
import { whoobePages, type PageSeo, type PageSitemapSettings, type PageSearchSettings } from './whoobe-pages-schema.js';

export interface WhoobePageRecord {
  id: string;
  translationGroupId: string;
  locale: string;
  slug: string;
  title: string;
  category: string;
  published: boolean;
  workflowState: string | null;
  content: unknown;
  seo: PageSeo | null;
  sitemap: PageSitemapSettings | null;
  search: PageSearchSettings | null;
  pimcoreId: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function listWhoobePages(): Promise<WhoobePageRecord[]> {
  const db = getDb();
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
  content: unknown;
  seo?: PageSeo | null;
  sitemap?: PageSitemapSettings | null;
  search?: PageSearchSettings | null;
  pimcoreId?: string | null;
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
      content: input.content,
      seo: input.seo ?? null,
      sitemap: input.sitemap ?? null,
      search: input.search ?? null,
      pimcoreId: input.pimcoreId ?? null,
    })
    .returning();
  return row;
}

export async function updateWhoobePage(
  id: string,
  input: {
    slug?: string;
    title?: string;
    category?: string;
    published?: boolean;
    workflowState?: string | null;
    content?: unknown;
    seo?: PageSeo | null;
    sitemap?: PageSitemapSettings | null;
    search?: PageSearchSettings | null;
  }
): Promise<WhoobePageRecord | null> {
  const db = getDb();

  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (input.slug !== undefined) values.slug = input.slug;
  if (input.title !== undefined) values.title = input.title;
  if (input.category !== undefined) values.category = input.category;
  if (input.workflowState !== undefined) values.workflowState = input.workflowState;
  if (input.content !== undefined) values.content = input.content;
  if (input.seo !== undefined) values.seo = input.seo;
  if (input.sitemap !== undefined) values.sitemap = input.sitemap;
  if (input.search !== undefined) values.search = input.search;

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
  return row ?? null;
}

export async function deleteWhoobePage(id: string): Promise<void> {
  const db = getDb();
  await db.delete(whoobePages).where(eq(whoobePages.id, id));
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
  return row;
}
