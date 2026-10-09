// An uploaded picture is decoded and written again: whatever else the file carried (metadata, appended data, a script after the
// image end) does not survive, and a file that only starts like an image but cannot be decoded is refused. The pixel cap applies
// (sharp-input.ts), so a decompression bomb is refused too.
import { sharpInput } from '../dam/sharp-input.js';
import { ImageProcessingPipeline } from '../dam/processing-pipeline.js';

export const REENCODED_IMAGE_EXTENSIONS: ReadonlySet<string> = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);

export class UploadContentError extends Error {}

/** The same picture, re-encoded in its own format. Throws UploadContentError when it cannot be decoded. Other extensions pass
 *  through untouched (they are checked by their first bytes, and always served as attachments). */
export async function sanitizeUploadedFile(buffer: Buffer, extension: string): Promise<Buffer> {
  const ext = extension.toLowerCase();
  if (!REENCODED_IMAGE_EXTENSIONS.has(ext)) return buffer;
  const sharp = await ImageProcessingPipeline.getSharp();
  if (!sharp) throw new UploadContentError('Pictures cannot be checked on this server');
  try {
    // rotate() applies the EXIF orientation, then no metadata is written back
    const image = sharpInput(sharp, buffer, ext === 'gif' ? { animated: true } : {}).rotate();
    switch (ext) {
      case 'png': return await image.png().toBuffer();
      case 'webp': return await image.webp({ quality: 90 }).toBuffer();
      case 'gif': return await image.gif().toBuffer();
      default: return await image.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    }
  } catch (err) {
    if (/pixel limit|exceeds .*pixel/i.test(String((err as Error)?.message))) throw new UploadContentError('The picture is too large');
    throw new UploadContentError('The file is not a valid picture');
  }
}
