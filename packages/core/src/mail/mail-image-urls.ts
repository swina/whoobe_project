import { formatS3ObjectKey } from '../dam/storage.js';
import { getAssetById } from '../db/asset-records.js';
import { ImageProcessingPipeline } from '../dam/processing-pipeline.js';

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

/** Like resolveMailImageUrls(), but returns `reference -> data: URI`
 *  (base64-encoded image bytes) instead of a public proxy URL - for a
 *  destination that may not be able to reach this install's own image host
 *  at all. The proxy URL only works if whatever's on the other end (an
 *  ESP's servers building a campaign preview, a recipient's mail client)
 *  can reach it over the public internet - true for a real deployment
 *  (S3_PUBLIC_BASE_URL is a real public origin) but not for a local/dev
 *  install being used as a design tool, where it's localhost or a private
 *  network address no outside service can ever resolve. core-api itself
 *  CAN always reach it (same network as asset-processor either way), so it
 *  fetches each image's bytes at render time and inlines them directly -
 *  the result has zero external image dependencies, at the cost of a
 *  meaningfully larger HTML payload. Prefer resolveMailImageUrls() whenever
 *  the image host is known to be genuinely publicly reachable. */
export async function resolveMailImageDataUris(content: unknown): Promise<Record<string, string>> {
  const urls = await resolveMailImageUrls(content)
  const map: Record<string, string> = {}
  await Promise.all(
    Object.entries(urls).map(async ([ref, url]) => {
      try {
        const res = await fetch(url)
        if (!res.ok) return
        const rawContentType = res.headers.get('content-type') || 'image/png'
        const rawBuffer = Buffer.from(await res.arrayBuffer())
        const { buffer, contentType } = await reencodeForEmail(rawBuffer, rawContentType)
        map[ref] = `data:${contentType};base64,${buffer.toString('base64')}`
      } catch {
        // Leave unresolved - renderer omits the <img>/background, same as
        // resolveMailImageUrls()'s own unresolvable-reference behavior.
      }
    }),
  )
  return map
}

const MAIL_IMAGE_MAX_WIDTH = 1200
const MAIL_IMAGE_JPEG_QUALITY = 82

/** Re-encodes an already-fetched image for email use: capped to
 *  MAIL_IMAGE_MAX_WIDTH wide (email content is never rendered wider than
 *  this, while a DAM original is frequently full camera/design resolution
 *  - several MB before any base64 encoding at all) and re-compressed as
 *  JPEG, which every mail client renders (unlike WebP, which desktop
 *  Outlook doesn't). Without this, resolveMailImageDataUris() inlined the
 *  RAW, unresized original - fine for one small image, but a real page/
 *  snippet with a couple of full-resolution photos produced a multi-MB
 *  request body that got rejected: first by our own infra's size limit,
 *  then - once that was raised - by the ESP's own ingress, surfacing as a
 *  generic "Input must be a valid JSON object" error rather than a clear
 *  size-limit one.
 *
 *  Flattens transparency to white (an acceptable trade-off for email, and
 *  simpler than tracking which format to keep per image) and falls back to
 *  the original buffer/content-type on any processing failure (an unusual
 *  format sharp can't decode, sharp unavailable in this environment) or
 *  for SVG (already tiny, and not something sharp meaningfully "resizes"
 *  down in byte terms) rather than dropping the image entirely. */
async function reencodeForEmail(buffer: Buffer, contentType: string): Promise<{ buffer: Buffer; contentType: string }> {
  if (contentType === 'image/svg+xml') return { buffer, contentType }
  const sharp = await ImageProcessingPipeline.getSharp()
  if (!sharp) return { buffer, contentType }
  try {
    const resized = await sharp(buffer)
      .resize({ width: MAIL_IMAGE_MAX_WIDTH, withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: MAIL_IMAGE_JPEG_QUALITY, progressive: true })
      .toBuffer()
    return { buffer: resized, contentType: 'image/jpeg' }
  } catch {
    return { buffer, contentType }
  }
}
