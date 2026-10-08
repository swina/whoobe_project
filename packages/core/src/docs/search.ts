// Search over a documentation site (docs/plans/docs-sites/docs-site-plan.md section 6): ONE index, built on the server from the
// rendered documents, serialised as JSON and searched in the browser with MiniSearch - by the live site (the editor
// application) and by the published static site alike. Browser-safe: nothing here imports the Markdown pipeline.
import MiniSearch from 'minisearch';

export interface SearchEntry {
  /** The address inside the site, with "#heading" for a section. */
  id: string;
  /** Page title, or the heading text for a section entry. */
  title: string;
  /** Title of the page a section entry belongs to ('' for a page). */
  page: string;
  /** Titles of the sections that lead to the page ("Guides > Install"). */
  breadcrumb: string;
  description: string;
  /** Headings of the page, joined (only on page entries). */
  headings: string;
  /** Plain text of the page (only on page entries). */
  text: string;
  /** Start of the text, shown under a result. */
  excerpt: string;
}

export interface SearchHit { id: string; route: string; hash: string; title: string; page: string; breadcrumb: string; excerpt: string; score: number }

/** Lower case, accents folded: "Città" finds "citta" and the other way round. */
export function normalizeTerm(term: string): string {
  return term.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

export const SEARCH_OPTIONS = {
  idField: 'id',
  fields: ['title', 'headings', 'description', 'text'],
  storeFields: ['title', 'page', 'breadcrumb', 'excerpt'],
  processTerm: (term: string) => { const t = normalizeTerm(term); return t.length > 0 ? t : null; },
  searchOptions: {
    boost: { title: 6, headings: 3, description: 2 },
    prefix: true,
    fuzzy: (term: string) => (term.length > 4 ? 0.2 : false),
    combineWith: 'AND' as const,
  },
};

export interface PageForSearch {
  route: string;
  title: string;
  description?: string | null;
  breadcrumb: string;
  headings: { depth: number; text: string; id: string }[];
  text: string;
}

const excerptOf = (text: string): string => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 180 ? t.slice(0, 177).trimEnd() + '…' : t;
};

/** Entries of one page: the page itself and one per heading (level 2 and 3), so a result can open the section. */
export function entriesForPage(p: PageForSearch): SearchEntry[] {
  const route = p.route === '' ? '/' : p.route;
  const sections = p.headings.filter((h) => h.depth >= 2 && h.depth <= 3);
  const out: SearchEntry[] = [{
    id: route, title: p.title, page: '', breadcrumb: p.breadcrumb, description: p.description ?? '',
    headings: sections.map((h) => h.text).join(' \n '), text: p.text, excerpt: p.description ? excerptOf(p.description) : excerptOf(p.text),
  }];
  for (const h of sections) {
    out.push({ id: `${route}#${h.id}`, title: h.text, page: p.title, breadcrumb: p.breadcrumb, description: '', headings: '', text: '', excerpt: p.title });
  }
  return out;
}

/** The serialised index (a JSON string) for the given pages. */
export function buildSearchIndex(pages: PageForSearch[]): { json: string; count: number } {
  const ms = new MiniSearch<SearchEntry>(SEARCH_OPTIONS);
  const seen = new Set<string>();
  const entries: SearchEntry[] = [];
  for (const p of pages) for (const e of entriesForPage(p)) { if (!seen.has(e.id)) { seen.add(e.id); entries.push(e); } }
  ms.addAll(entries);
  return { json: JSON.stringify(ms), count: entries.length };
}

export function loadSearchIndex(json: string): MiniSearch<SearchEntry> {
  return MiniSearch.loadJSON<SearchEntry>(json, SEARCH_OPTIONS);
}

export function searchDocs(index: MiniSearch<SearchEntry>, query: string, limit = 12): SearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const results = index.search(q);
  return results.slice(0, limit).map((r) => {
    const id = String(r.id);
    const hashAt = id.indexOf('#');
    return {
      id, route: hashAt === -1 ? id : id.slice(0, hashAt), hash: hashAt === -1 ? '' : id.slice(hashAt + 1),
      title: String(r.title), page: String(r.page ?? ''), breadcrumb: String(r.breadcrumb ?? ''), excerpt: String(r.excerpt ?? ''), score: r.score,
    };
  });
}
