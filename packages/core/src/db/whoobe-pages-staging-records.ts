import { eq, desc } from 'drizzle-orm';
import { getDb } from './client.js';
import { whoobePagesStaging } from './whoobe-pages-staging-schema.js';
import type { PageSeo, PageSitemapSettings, PageSearchSettings } from './whoobe-pages-schema.js';

/**
 * Staging-layer records for the Documents → Pages migration - the "land in
 * a temporary table first, review, then promote" workflow (docs/plans/cms/
 * documents-migration.md §3 Phase 1 / Option B). Mirrors whoobe-pages-
 * records.ts's conventions (upsert-by-pimcore_id, never touches publish
 * state) against `whoobe_pages_staging` instead of the live pages table.
 *
 * Promote deliberately goes through the SAME `upsertWhoobePageByPimcoreId`
 * the direct (non-staged) migration path already uses - staging vs. direct
 * migration share one "write a page from a converted document" primitive,
 * the only difference is WHERE the write lands. So a staged-then-promoted
 * page is byte-identical to one migrated straight into `whoobe_pages`.
 */
export interface WhoobePageStagingRecord {
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
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  stagedAt: Date;
}

export async function listStagedWhoobePages(): Promise<WhoobePageStagingRecord[]> {
  const db = getDb();
  return db.select().from(whoobePagesStaging).orderBy(desc(whoobePagesStaging.stagedAt));
}

export async function getStagedWhoobePage(id: string): Promise<WhoobePageStagingRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(whoobePagesStaging).where(eq(whoobePagesStaging.id, id)).limit(1);
  return row ?? null;
}

/**
 * Upsert-by-pimcore_id against the staging table - the staged counterpart
 * of `upsertWhoobePageByPimcoreId`. Same conflict target (pimcore_id unique
 * index), same "never touch published/workflowState" guarantee, landing in
 * `whoobe_pages_staging` instead. `staged_at` is stamped fresh on every
 * write so re-staging refreshes the review order.
 */
export async function upsertStagedWhoobePageByPimcoreId(input: {
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
}): Promise<WhoobePageStagingRecord> {
  const db = getDb();
  const now = new Date();

  const [row] = await db
    .insert(whoobePagesStaging)
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
      stagedAt: now,
    })
    .onConflictDoUpdate({
      target: whoobePagesStaging.pimcoreId,
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
        stagedAt: now,
      },
    })
    .returning();
  return row;
}

export async function deleteStagedWhoobePage(id: string): Promise<void> {
  const db = getDb();
  await db.delete(whoobePagesStaging).where(eq(whoobePagesStaging.id, id));
}

export async function clearStagedWhoobePages(): Promise<number> {
  const db = getDb();
  const rows = await db.select({ id: whoobePagesStaging.id }).from(whoobePagesStaging);
  if (rows.length === 0) return 0;
  await db.delete(whoobePagesStaging);
  return rows.length;
}
