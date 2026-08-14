// Search querying (docs/plans/search-engine/search-engine-plan.md §6):
// tsvector matching with as-you-type prefixing, ts_rank_cd ranking with
// trigram similarity tie-breakers, and a trgm/ILIKE fallback for queries
// that produce no lexemes. The ranking step lives here, isolated, so the
// V2 pgvector RRF fusion slots in as a pluggable module (plan §2
// addendum). All user input reaches SQL only through parameterized
// lexemes - never string-interpolated query text.
import { sql, and, eq, inArray, desc } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { searchDocuments, type SearchDocumentType } from '../db/search-documents-schema.js';

export interface SearchOptions {
  q: string;
  locale?: string;
  websiteId?: string | null;
  /** One type or several (ORed) - the admin search toggles types on/off. */
  type?: SearchDocumentType | SearchDocumentType[] | null;
  classId?: string | null;
  includeUnpublished?: boolean;
  page?: number;
  pageSize?: number;
  sort?: 'relevance' | 'date';
}

export interface SearchResultItem {
  type: SearchDocumentType;
  id: string;
  title: string;
  path: string;
  excerpt: string;
  score: number;
  category: string;
  locale: string;
  publishedAt: Date | null;
  payload: Record<string, unknown>;
}

export interface SearchResults {
  query: string;
  total: number;
  page: number;
  pageSize: number;
  tookMs: number;
  results: SearchResultItem[];
}

export const MAX_PAGE_SIZE = 50;

const TS_CONFIG = 'simple';

/** Turns free-form input into a safe to_tsquery string, or null when there
 *  is nothing to search for (e.g. "c++" - no alpha-numeric lexemes). The
 *  last lexeme gets a `:*` prefix match so "sport" also finds "sports". */
export function buildTsQuery(q: string): string | null {
  const lexemes = q.toLowerCase().match(/[a-z0-9_]{2,}/g);
  if (!lexemes || lexemes.length === 0) return null;
  const parts = lexemes.map((lexeme, i) => `'${lexeme.replace(/'/g, "''")}'${i === lexemes.length - 1 ? ':*' : ''}`);
  return parts.join(' & ');
}

/** Executes a search against search_documents. Public callers pass
 *  includeUnpublished=false; admin callers may include drafts. */
export async function searchContent(options: SearchOptions): Promise<SearchResults> {
  const db = getDb();
  const started = Date.now();
  const q = options.q.trim();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, options.pageSize ?? 20));
  const tsQuery = buildTsQuery(q);
  const locale = options.locale || 'en';

  const conditions: any[] = [eq(searchDocuments.locale, locale)];
  if (!options.includeUnpublished) conditions.push(eq(searchDocuments.published, true));
  if (options.websiteId) conditions.push(eq(searchDocuments.websiteId, options.websiteId));
  if (options.type) {
    if (Array.isArray(options.type)) conditions.push(inArray(searchDocuments.documentType, options.type));
    else conditions.push(eq(searchDocuments.documentType, options.type));
  }
  if (options.classId) conditions.push(sql`${searchDocuments.payload}->>'classId' = ${options.classId}`);

  const where = and(...conditions);

  if (tsQuery) {
    const tsq = sql`to_tsquery(${TS_CONFIG}, ${tsQuery})`;
    const matchCond = sql`"document_tsvector" @@ ${tsq}`;
    const rank = sql<number>`ts_rank_cd("document_tsvector", ${tsq}, 32)`;
    const similarity = sql<number>`similarity(${searchDocuments.title}, ${q})`;
    const headline = sql<string>`ts_headline(${TS_CONFIG}, ${searchDocuments.body}, ${tsq}, 'StartSel=<em>, StopSel=</em>, MaxWords=30, MinWords=10')`;

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(searchDocuments)
      .where(and(where, matchCond));
    const total = Number(count ?? 0);

    const rows = await db
      .select({
        documentType: searchDocuments.documentType,
        documentId: searchDocuments.documentId,
        title: searchDocuments.title,
        path: searchDocuments.path,
        excerpt: searchDocuments.excerpt,
        headline,
        rank,
        similarity,
        category: searchDocuments.category,
        locale: searchDocuments.locale,
        publishedAt: searchDocuments.publishedAt,
        payload: searchDocuments.payload,
      })
      .from(searchDocuments)
      .where(and(where, matchCond))
      .orderBy(options.sort === 'date' ? desc(searchDocuments.updatedAt) : sql`${rank} DESC, ${similarity} DESC, ${searchDocuments.updatedAt} DESC`)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return {
      query: q,
      total,
      page,
      pageSize,
      tookMs: Date.now() - started,
      results: rows.map((row) => ({
        type: row.documentType as SearchDocumentType,
        id: row.documentId,
        title: row.title,
        path: row.path,
        excerpt: row.headline && row.headline.length > 0 ? row.headline : row.excerpt,
        score: Number(row.rank ?? 0),
        category: row.category,
        locale: row.locale,
        publishedAt: row.publishedAt,
        payload: (row.payload ?? {}) as Record<string, unknown>,
      })),
    };
  }

  // No usable lexemes (e.g. "c++" or non-latin scripts with the simple
  // config): fall back to trigram similarity on title/path.
  const trgmMatch = sql`similarity(${searchDocuments.title}, ${q}) > 0.3 OR similarity(${searchDocuments.path}, ${q}) > 0.3`;
  const similarity = sql<number>`similarity(${searchDocuments.title}, ${q})`;
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(searchDocuments)
    .where(and(where, trgmMatch));
  const total = Number(count ?? 0);

  const rows = await db
    .select({
      documentType: searchDocuments.documentType,
      documentId: searchDocuments.documentId,
      title: searchDocuments.title,
      path: searchDocuments.path,
      excerpt: searchDocuments.excerpt,
      similarity,
      category: searchDocuments.category,
      locale: searchDocuments.locale,
      publishedAt: searchDocuments.publishedAt,
      payload: searchDocuments.payload,
    })
    .from(searchDocuments)
    .where(and(where, trgmMatch))
    .orderBy(sql`${similarity} DESC, ${searchDocuments.updatedAt} DESC`)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    query: q,
    total,
    page,
    pageSize,
    tookMs: Date.now() - started,
    results: rows.map((row) => ({
      type: row.documentType as SearchDocumentType,
      id: row.documentId,
      title: row.title,
      path: row.path,
      excerpt: row.excerpt,
      score: Number(row.similarity ?? 0),
      category: row.category,
      locale: row.locale,
      publishedAt: row.publishedAt,
      payload: (row.payload ?? {}) as Record<string, unknown>,
    })),
  };
}