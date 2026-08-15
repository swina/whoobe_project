// List-to-detail URL patterns (docs/plans/website/website-paths.md) - the
// small client-side counterpart of packages/core/src/routing/page-path-
// pattern.ts, ported for the SDK (same duplication precedent the editor's
// own path-pattern.ts sets).

const PLACEHOLDER_RE = /\{([^{}/]*)\}/g

export function extractPlaceholderNames(pattern: string): string[] {
  const names: string[] = []
  const re = new RegExp(PLACEHOLDER_RE)
  let match: RegExpExecArray | null
  while ((match = re.exec(pattern))) {
    if (match[1]) names.push(match[1])
  }
  return names
}

/** Substitutes params into a pattern for URL construction. Returns null
 *  (rather than throwing) if a required placeholder has no matching param. */
export function substitutePattern(pattern: string, params: Record<string, string>): string | null {
  for (const name of extractPlaceholderNames(pattern)) {
    if (!(name in params)) return null
  }
  return pattern.replace(PLACEHOLDER_RE, (_m, name) => params[name])
}

/** Builds a per-record detail path by filling the target page's slug
 *  pattern with a single value (the valueField's resolved value). Matches
 *  the editor's v1 boundary: only the first placeholder is filled. */
export function resolveDynamicLinkPath(pattern: string, value: string): string | null {
  const [name] = extractPlaceholderNames(pattern)
  if (!name) return null
  return substitutePattern(pattern, { [name]: value })
}
