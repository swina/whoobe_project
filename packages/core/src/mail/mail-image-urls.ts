import { formatS3ObjectKey } from '../dam/storage.js';
import { getAssetById } from '../db/asset-records.js';

// Email images and the DAM (docs/plans/forms/mail-templates.md): the
// editor stores a *stable reference*, never a resolved URL, when an admin
// picks an image from the DAM - a Pimcore-style path (e.g.
// "/uploads/marketing/hero.jpg") or an asset-record UUID when referenced
// from a data object field. Presigned URLs for private assets expire (~1h),
// which is useless inside an email that's read later. So references are
// resolved to the asset-processor's public `/dam-asset/*` proxy
// (S3_PUBLIC_BASE_URL + the object key), which serves objects directly
// from S3 regardless of visibility and never expires.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True when a string is a DAM reference (raw Pimcore path or asset UUID)
 *  rather than an already-resolved http(s)/data: URL. */
export function looksLikeDamReference(value: string): boolean {
  return (value.startsWith('/') && !value.startsWith('//')) || UUID_RE.test(value)
}

function damPathToProxyUrl(pimcorePath: string): string {
  const publicBaseUrl = (process.env.S3_PUBLIC_BASE_URL ?? '').replace(/\/+$/, '')
  if (!publicBaseUrl) return ''
  const keyPrefix = process.env.S3_KEY_PREFIX ?? ''
  return `${publicBaseUrl}/${formatS3ObjectKey(pimcorePath, keyPrefix)}`
}

/** Walks an Element tree and resolves every DAM image reference to a stable
 *  public URL. Returns a `reference -> URL` map (unresolvable references -
 *  no proxy base configured, missing asset record - are left out, and the
 *  renderer then omits the `<img>` rather than emit a broken src). */
export async function resolveMailImageUrls(content: unknown): Promise<Record<string, string>> {
  const refs = new Set<string>()
  const walk = (node: any): void => {
    if (!node || typeof node !== 'object') return
    const url = node.image?.url
    if (typeof url === 'string' && looksLikeDamReference(url)) refs.add(url)
    if (Array.isArray(node.blocks)) node.blocks.forEach(walk)
  }
  walk(content)

  const map: Record<string, string> = {}
  await Promise.all(
    [...refs].map(async (ref) => {
      try {
        let path: string | null = null
        if (UUID_RE.test(ref)) {
          const record = await getAssetById(ref)
          path = record?.pimcorePath ?? null
        } else {
          path = ref
        }
        if (path) {
          const url = damPathToProxyUrl(path)
          if (url) map[ref] = url
        }
      } catch {
        // Leave unresolved - renderer omits the <img>.
      }
    }),
  )
  return map
}
