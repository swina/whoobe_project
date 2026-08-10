// Dynamic slug pattern parsing/matching for whoobe_pages.slug - see
// docs/plans/website/website-paths.md. A slug is "dynamic" iff it contains
// '{'; each `{fieldName}` placeholder matches exactly one non-'/' path
// segment. No new column/flag - the '{' in the existing slug string IS the
// whole signal, same convention DataBindingFilter's value substitution
// (apps/whoobe-one-spike/src/scripts/data-resolver.ts) mirrors client-side.
import type { WhoobePageRecord } from '../db/whoobe-pages-records.js';

export interface MatchedPagePath {
  page: WhoobePageRecord;
  params: Record<string, string>;
}

const PLACEHOLDER_RE = /\{([^{}/]*)\}/g;

export function isDynamicSlug(slug: string): boolean {
  return slug.includes('{');
}

/** Extracts placeholder names in order of appearance, e.g.
 *  '/it/{category}/{slug}' -> ['category', 'slug']. Throws on malformed
 *  patterns: unbalanced braces, an empty placeholder name, or a
 *  placeholder containing '/'. */
export function extractPlaceholderNames(pattern: string): string[] {
  if ((pattern.match(/\{/g)?.length ?? 0) !== (pattern.match(/\}/g)?.length ?? 0)) {
    throw new Error(`Malformed path pattern (unbalanced braces): "${pattern}"`);
  }
  const names: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(PLACEHOLDER_RE);
  while ((match = re.exec(pattern))) {
    const name = match[1];
    if (!name) throw new Error(`Malformed path pattern (empty placeholder name): "${pattern}"`);
    names.push(name);
  }
  return names;
}

/** Builds a full-string-anchored RegExp with one named capture group per
 *  placeholder. '/it/news/{slug}' -> /^\/it\/news\/(?<slug>[^/]+)$/ */
export function compilePagePathPattern(pattern: string): RegExp {
  extractPlaceholderNames(pattern); // validate, throws on malformed input
  // '{'/'}' are deliberately excluded from the escape charset below - they
  // need to survive as plain characters so the placeholder substitution
  // regex (which matches unescaped '{name}') can still find them.
  const escaped = pattern.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  const source = escaped.replace(PLACEHOLDER_RE, (_m, name) => `(?<${name}>[^/]+)`);
  return new RegExp(`^${source}$`);
}

/** Tries each dynamic-slug page's compiled pattern against `requestPath`.
 *  `pages` should already be filtered to dynamic-slug pages for the
 *  relevant locale/website by the caller (this function does not filter
 *  by locale/website itself). Deterministic ordering: fewer placeholders
 *  (more specific) wins on ambiguous overlap, then slug string ascending -
 *  stable across requests, not DB-row-order-dependent. Returns null if
 *  nothing matches. */
export function matchPagePath(pages: WhoobePageRecord[], requestPath: string): MatchedPagePath | null {
  // Malformed patterns sort last (Infinity) rather than throwing here - the
  // match loop below skips them safely too, so a single bad slug elsewhere
  // in the table never breaks matching for every other page.
  const placeholderCount = (slug: string): number => {
    try {
      return extractPlaceholderNames(slug).length;
    } catch {
      return Infinity;
    }
  };
  const candidates = [...pages].sort((a, b) => {
    const diff = placeholderCount(a.slug) - placeholderCount(b.slug);
    return diff !== 0 ? diff : a.slug.localeCompare(b.slug);
  });
  for (const page of candidates) {
    let regex: RegExp;
    try {
      regex = compilePagePathPattern(page.slug);
    } catch {
      continue; // skip malformed patterns rather than failing the whole lookup
    }
    const match = regex.exec(requestPath);
    if (match) {
      return { page, params: { ...(match.groups ?? {}) } };
    }
  }
  return null;
}

/** Substitutes params into a pattern for URL construction:
 *  ('/it/news/{slug}', { slug: 'my-article' }) -> '/it/news/my-article'.
 *  Throws if a required placeholder has no corresponding param. */
export function buildPathFromPattern(pattern: string, params: Record<string, string>): string {
  const names = extractPlaceholderNames(pattern);
  for (const name of names) {
    if (!(name in params)) throw new Error(`Missing param "${name}" for path pattern "${pattern}"`);
  }
  return pattern.replace(PLACEHOLDER_RE, (_m, name) => params[name]);
}
