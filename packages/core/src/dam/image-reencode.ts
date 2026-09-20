import { ImageProcessingPipeline } from './processing-pipeline.js';

export interface ReencodeOptions {
  maxWidth?: number;
  quality?: number;
}

const DEFAULT_MAX_WIDTH = 1200;
const DEFAULT_QUALITY = 82;

/** Resizes and re-encodes an image buffer as JPEG for a destination with
 *  tight size constraints - originally written for email (a mail
 *  template's DAM images, base64-embedded for a Brevo campaign: see
 *  packages/core/src/mail/mail-image-urls.ts), reused for CDN mirroring
 *  (docs/plans/assets/assets-cdn.md) since it's the same underlying need:
 *  a DAM original is frequently full camera/design resolution - several MB
 *  before any encoding at all - and the destination either has a hard size
 *  limit (an ESP's JSON payload) or simply shouldn't be paying to store/
 *  transfer a needlessly large file (a CDN mirror).
 *
 *  Uses JPEG specifically for broad compatibility (every mail client
 *  renders it, unlike WebP on desktop Outlook) and flattens transparency
 *  to white - an acceptable trade-off for both use cases, and simpler than
 *  tracking which format to preserve per image. Falls back to the
 *  original buffer/content-type on any processing failure (an unusual
 *  format sharp can't decode, sharp unavailable in this environment) or
 *  for SVG (already tiny, and not something a raster pipeline
 *  meaningfully "resizes" down in byte terms) rather than dropping the
 *  image entirely. */
export async function reencodeImage(
  buffer: Buffer,
  contentType: string,
  options: ReencodeOptions = {},
): Promise<{ buffer: Buffer; contentType: string }> {
  if (contentType === 'image/svg+xml') return { buffer, contentType };
  const sharp = await ImageProcessingPipeline.getSharp();
  if (!sharp) return { buffer, contentType };
  const maxWidth = options.maxWidth ?? DEFAULT_MAX_WIDTH;
  const quality = options.quality ?? DEFAULT_QUALITY;
  try {
    const resized = await sharp(buffer)
      .resize({ width: maxWidth, withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality, progressive: true })
      .toBuffer();
    return { buffer: resized, contentType: 'image/jpeg' };
  } catch {
    return { buffer, contentType };
  }
}
