// Small client-side counterpart to packages/core/src/routing/page-path-
// pattern.ts - whoobe-one-spike has no dependency on packages/core (same
// precedent as data-resolver.ts's own local applyFilters/sortClientSide),
// so pattern logic needed here is duplicated in miniature rather than
// imported. This app never MATCHES a real request path against every
// page (that's core-api's job) - it only ever (a) matches the CURRENT
// document's own pattern against a typed "preview as path" string, for
// testing, and (b) substitutes params into a target page's pattern to
// build a per-record link (list-to-detail linking).

const PLACEHOLDER_RE = /\{([^{}/]*)\}/g;

export function isDynamicSlug(slug: string): boolean {
  return slug.includes('{')
}

export function extractPlaceholderNames(pattern: string): string[] {
  const names: string[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(PLACEHOLDER_RE)
  while ((match = re.exec(pattern))) {
    if (match[1]) names.push(match[1])
  }
  return names
}

/** Matches `path` against `pattern`, returning the extracted params or
 *  null if it doesn't match. Used by DocumentPreview.vue's "preview as
 *  path" input to derive urlParams from a typed path + the current
 *  document's own slug pattern. */
export function matchAgainstPattern(pattern: string, path: string): Record<string, string> | null {
  const escaped = pattern.replace(/[.*+?^$()|[\]\\]/g, '\\$&')
  const source = escaped.replace(PLACEHOLDER_RE, (_m, name) => `(?<${name}>[^/]+)`)
  const match = new RegExp(`^${source}$`).exec(path)
  return match ? { ...(match.groups ?? {}) } : null
}

/** Substitutes params into a pattern for URL construction. Returns null
 *  (rather than throwing) if a required placeholder has no matching
 *  param - callers render a safe fallback ('#') instead of crashing. */
export function substitutePattern(pattern: string, params: Record<string, string>): string | null {
  for (const name of extractPlaceholderNames(pattern)) {
    if (!(name in params)) return null
  }
  return pattern.replace(PLACEHOLDER_RE, (_m, name) => params[name])
}
