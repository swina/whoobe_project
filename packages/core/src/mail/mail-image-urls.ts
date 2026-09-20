import { formatS3ObjectKey } from '../dam/storage.js';
import { getAssetById, getAssetByPath } from '../db/asset-records.js';
import { reencodeImage } from '../dam/image-reencode.js';
import type { CdnMirrorRecord } from '../dam/cdn-mirror.js';

// Email images and the DAM (docs/plans/forms/mail-templates.md): the
// editor stores a *stable reference*, never a resolved URL, when an admin
// picks an image from the DAM - a Pimcore-style path (e.g.
// "/uploads/marketing/hero.jpg") or an asset-record UUID when referenced
// from a data object field. Presigned URLs for private assets expire (~1h),
// which is useless inside an email that's read later. So references
// resolve to, in priority order:
//  1. A CDN mirror (docs/plans/assets/assets-cdn.md), if the asset has one
//     - a stable, permanent, genuinely public URL an admin explicitly
//     opted this asset into by mirroring it. Always preferred when present:
//     mirroring an asset already is the opt-in signal, so there's no
//     separate "use CDN" toggle to also check.
//  2. The asset-processor's public `/dam-asset/*` proxy (S3_PUBLIC_BASE_URL
//     + the object key), which serves objects directly from S3 regardless
//     of visibility and never expires - but only actually reachable by an
//     external destination (an ESP, a recipient's mail client) when this
//     install itself has a genuinely public origin.
//  3. A base64-embedded, re-encoded copy (resolveMailImageDataUris() only)
//     - the fallback of last resort for a reference with neither of the above.

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

/** Picks a mirror to use when an asset has more than one provider mirrored
 *  - no per-provider preference exists yet (realistically only one
 *  provider is configured at a time today), so this just takes whichever
 *  entry comes first. Revisit once a second provider is actually in use. */
function pickCdnMirrorUrl(mirrors: Record<string, CdnMirrorRecord> | null | undefined): string | null {
  if (!mirrors) return null
  const first = Object.values(mirrors)[0]
  return first?.url ?? null
}

interface ResolvedImageRef {
  url: string
  /** True when `url` is already a CDN mirror - callers that would
   *  otherwise base64-embed the image can skip that entirely, since a
   *  mirror URL is already stable and publicly reachable on its own. */
  isCdnMirror: boolean
}

async function resolveImageRef(ref: string): Promise<ResolvedImageRef | null> {
  const record = UUID_RE.test(ref) ? await getAssetById(ref) : await getAssetByPath(ref)
  const cdnUrl = pickCdnMirrorUrl(record?.cdnMirrors)
  if (cdnUrl) return { url: cdnUrl, isCdnMirror: true }

  const path = UUID_RE.test(ref) ? record?.pimcorePath ?? null : ref
  if (!path) return null
  const url = damPathToProxyUrl(path)
  return url ? { url, isCdnMirror: false } : null
}

function collectImageRefs(content: unknown): Set<string> {
  const refs = new Set<string>()
  const walk = (node: any): void => {
    if (!node || typeof node !== 'object') return
    const url = node.image?.url
    if (typeof url === 'string' && looksLikeDamReference(url)) refs.add(url)
    if (Array.isArray(node.blocks)) node.blocks.forEach(walk)
  }
  walk(content)
  return refs
}

/** Walks an Element tree and resolves every DAM image reference to a stable
 *  public URL - a CDN mirror when the asset has one, otherwise the DAM's
 *  own public proxy. Returns a `reference -> URL` map (unresolvable
 *  references - no mirror, no proxy base configured, missing asset record -
 *  are left out, and the renderer then omits the `<img>` rather than emit a
 *  broken src). */
export async function resolveMailImageUrls(content: unknown): Promise<Record<string, string>> {
  const refs = collectImageRefs(content)
  const map: Record<string, string> = {}
  await Promise.all(
    [...refs].map(async (ref) => {
      try {
        const resolved = await resolveImageRef(ref)
        if (resolved) map[ref] = resolved.url
      } catch {
        // Leave unresolved - renderer omits the <img>.
      }
    }),
  )
  return map
}

// Email-specific re-encode caps (docs/plans/assets/assets-cdn.md) - passed
// explicitly rather than relying on reencodeImage()'s own generic
// defaults, so this call site's choice is visible here and doesn't
// silently drift if that function's defaults ever change for some other
// caller (e.g. CDN mirroring, which deliberately does NOT cap - see
// asset-processor's mirror-cdn endpoint). Only ever applied to a reference
// with no CDN mirror and no reachable local proxy - a mirrored image skips
// this (and base64 entirely) via resolveMailImageDataUris()'s own check.
const EMAIL_IMAGE_MAX_WIDTH = 1200
const EMAIL_IMAGE_JPEG_QUALITY = 82

/** Like resolveMailImageUrls(), but for a reference with neither a CDN
 *  mirror nor a reachable local proxy, returns a `data:` URI (base64-
 *  encoded, resized/re-encoded for email) instead - for a destination that
 *  may not be able to reach this install's own image host at all. A
 *  mirrored reference is returned as-is (the CDN URL itself): it's already
 *  stable and publicly reachable, so there's nothing to embed - this is
 *  what actually removes the size/quality trade-off base64 embedding
 *  otherwise forces once an asset has been mirrored (docs/plans/assets/
 *  assets-cdn.md). */
export async function resolveMailImageDataUris(content: unknown): Promise<Record<string, string>> {
  const refs = collectImageRefs(content)
  const map: Record<string, string> = {}
  await Promise.all(
    [...refs].map(async (ref) => {
      try {
        const resolved = await resolveImageRef(ref)
        if (!resolved) return
        if (resolved.isCdnMirror) {
          map[ref] = resolved.url
          return
        }
        const res = await fetch(resolved.url)
        if (!res.ok) return
        const rawContentType = res.headers.get('content-type') || 'image/png'
        const rawBuffer = Buffer.from(await res.arrayBuffer())
        // Without this re-encode, a DAM original (often full camera/design
        // resolution - several MB) went straight to base64 - fine for one
        // small image, but a real page/snippet with a couple of full-
        // resolution photos produced a multi-MB request body that got
        // rejected: first by our own infra's size limit, then - once that
        // was raised - by the ESP's own ingress, surfacing as a generic
        // "Input must be a valid JSON object" error rather than a clear
        // size-limit one.
        const { buffer, contentType } = await reencodeImage(rawBuffer, rawContentType, {
          maxWidth: EMAIL_IMAGE_MAX_WIDTH,
          quality: EMAIL_IMAGE_JPEG_QUALITY,
        })
        map[ref] = `data:${contentType};base64,${buffer.toString('base64')}`
      } catch {
        // Leave unresolved - renderer omits the <img>/background, same as
        // resolveMailImageUrls()'s own unresolvable-reference behavior.
      }
    }),
  )
  return map
}
