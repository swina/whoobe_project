// DAM image reference resolution (docs/plans/cms/headless-sdk-plan.md §2,
// mirroring packages/core/src/mail/mail-image-urls.ts). The editor stores
// *stable references* - a Pimcore-style path like "/uploads/marketing/hero.
// jpg" (or an asset UUID from a data-object field) - never a resolved URL.
// Paths resolve to the DAM proxy base (e.g. http://host:3002/dam-asset),
// full http(s)/data: URLs pass through; UUIDs have no public lookup and
// resolve to null (documented gap).

const DAM_PATH_RE = /^\/(?!\/)/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True when a string is a DAM reference (raw path or asset UUID) rather
 *  than an already-resolved URL. */
export function looksLikeDamReference(value: string): boolean {
  return DAM_PATH_RE.test(value) || UUID_RE.test(value)
}

/** The S3 object key for a pimcore path, with an optional key prefix -
 *  mirrors formatS3ObjectKey() in packages/core/src/dam/storage.ts. */
export function objectKeyForPath(pimcorePath: string, keyPrefix = ''): string {
  const clean = pimcorePath.replace(/\\/g, '/').replace(/^\/+/, '')
  return keyPrefix ? `${keyPrefix}/${clean}` : clean
}

/** Resolves an image reference to a renderable URL. Returns null when
 *  unresolvable (missing asset base, UUID reference, non-string). */
export function resolveImageUrl(ref: unknown, assetBaseUrl?: string, keyPrefix?: string): string | null {
  if (typeof ref !== 'string' || !ref) return null
  if (/^https?:\/\//i.test(ref) || /^data:/i.test(ref)) return ref
  if (!looksLikeDamReference(ref)) return null
  // Asset UUIDs have no public lookup endpoint - document as unresolvable.
  if (UUID_RE.test(ref)) return null
  const base = (assetBaseUrl ?? '').replace(/\/+$/, '')
  if (!base) return null
  return `${base}/${objectKeyForPath(ref, keyPrefix)}`
}
