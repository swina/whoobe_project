import { sharpInput } from './sharp-input.js';
import { ThumbnailPreset } from './storage.js';
import { ThumbnailDimensions, PRESET_DIMENSIONS } from './thumbnail-generator.js';

export type SupportedImageFormat = 'webp' | 'avif' | 'png' | 'jpeg' | 'jpg' | 'gif';

export interface ImageResizeOptions {
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain' | 'inside' | 'fill';
  position?: 'center' | 'top' | 'right' | 'bottom' | 'left';
  withoutEnlargement?: boolean;
}

export interface WatermarkOptions {
  watermarkBuffer?: Buffer | Uint8Array;
  text?: string;
  gravity?: 'northwest' | 'northeast' | 'center' | 'southwest' | 'southeast';
  opacity?: number;
}

export interface ImageTransformOptions {
  resize?: ImageResizeOptions;
  format?: SupportedImageFormat;
  quality?: number;
  rotate?: number;
  grayscale?: boolean;
  blur?: number;
  watermark?: WatermarkOptions;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Renders watermark text to a transparent PNG (via SVG) so it can go
// through the same sharp `.composite()` path as an image watermark -
// WatermarkOptions.text was declared but never actually implemented.
function renderTextWatermarkSvg(text: string): Buffer {
  const fontSize = 32;
  const paddingPx = 16;
  const approxCharWidth = fontSize * 0.6;
  const width = Math.max(1, Math.ceil(text.length * approxCharWidth) + paddingPx * 2);
  const height = fontSize + paddingPx * 2;
  const safeText = escapeXml(text);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <text x="${paddingPx}" y="${fontSize + paddingPx / 2}" font-family="sans-serif" font-size="${fontSize}" font-weight="bold" fill="white" stroke="black" stroke-width="1">${safeText}</text>
  </svg>`;

  return Buffer.from(svg);
}

export class ImageProcessingPipeline {
  /**
   * Check if Sharp dynamically loaded or available in current environment.
   */
  public static async getSharp(): Promise<any> {
    try {
      const dynamicImport = new Function('mod', 'return import(mod)');
      const sharpModule = await dynamicImport('sharp');
      return sharpModule.default || sharpModule;
    } catch {
      return null;
    }
  }

  /**
   * Process an image buffer with resize, format conversion, rotation, filters & watermarks.
   */
  public static async transform(
    inputBuffer: Buffer | Uint8Array,
    options: ImageTransformOptions = {}
  ): Promise<Buffer> {
    const sharp = await this.getSharp();
    if (!sharp) {
      return Buffer.from(inputBuffer);
    }

    let pipeline = sharpInput(sharp, inputBuffer);

    // Apply rotation
    if (options.rotate) {
      pipeline = pipeline.rotate(options.rotate);
    }

    // Apply grayscale filter
    if (options.grayscale) {
      pipeline = pipeline.grayscale();
    }

    // Apply blur filter
    if (options.blur && options.blur > 0) {
      pipeline = pipeline.blur(options.blur);
    }

    // Apply resizing
    if (options.resize) {
      const { width, height, fit = 'inside', position = 'center', withoutEnlargement = true } = options.resize;
      pipeline = pipeline.resize({
        width,
        height,
        fit,
        position,
        withoutEnlargement,
      });
    }

    // Apply watermark overlay if provided
    if (options.watermark) {
      const { watermarkBuffer, text, gravity = 'southeast', opacity = 0.8 } = options.watermark;
      const wmInput = watermarkBuffer ?? (text ? renderTextWatermarkSvg(text) : undefined);
      if (wmInput) {
        // sharp's composite() throws if the overlay is larger than the base
        // image, which the text SVG (sized purely from string length) can
        // easily exceed once rotate/resize have shrunk the base. Render the
        // base now so its real post-resize dimensions are known, then
        // constrain the overlay to fit inside them.
        const { data: baseData, info: baseInfo } = await pipeline.clone().toBuffer({ resolveWithObject: true });
        pipeline = sharpInput(sharp, baseData);

        let wmSharp = sharpInput(sharp, wmInput).resize({
          width: Math.max(1, baseInfo.width - 4),
          height: Math.max(1, baseInfo.height - 4),
          fit: 'inside',
          withoutEnlargement: true,
        });
        if (opacity < 1) {
          // Adjust opacity via composite linear modulation
          wmSharp = wmSharp.composite([{
            input: Buffer.from([255, 255, 255, Math.round(opacity * 255)]),
            raw: { width: 1, height: 1, channels: 4 },
            tile: true,
            blend: 'dest-in'
          }]);
        }
        const processedWm = await wmSharp.toBuffer();
        pipeline = pipeline.composite([{ input: processedWm, gravity }]);
      }
    }

    // Convert format & quality
    const format = options.format || 'webp';
    const quality = options.quality ?? 80;

    switch (format.toLowerCase()) {
      case 'avif':
        pipeline = pipeline.toFormat('avif', { quality });
        break;
      case 'png':
        pipeline = pipeline.toFormat('png', { compressionLevel: 8 });
        break;
      case 'jpeg':
      case 'jpg':
        pipeline = pipeline.toFormat('jpeg', { quality, progressive: true });
        break;
      case 'gif':
        pipeline = pipeline.toFormat('gif');
        break;
      case 'webp':
      default:
        pipeline = pipeline.toFormat('webp', { quality });
        break;
    }

    return await pipeline.toBuffer();
  }

  /**
   * Batch generate standard responsive variants (thumb, medium, large, full_hd).
   */
  public static async generateVariants(
    inputBuffer: Buffer | Uint8Array,
    format: SupportedImageFormat = 'webp'
  ): Promise<Record<string, Buffer>> {
    const variants: Record<string, Buffer> = {};

    const dimensions: Record<string, ThumbnailDimensions> = {
      ...PRESET_DIMENSIONS,
      full_hd: { width: 1920, height: 1080, fit: 'inside' },
    };

    for (const [key, dims] of Object.entries(dimensions)) {
      variants[key] = await this.transform(inputBuffer, {
        resize: {
          width: dims.width,
          height: dims.height,
          fit: dims.fit,
        },
        format,
        quality: key === 'thumb' ? 75 : 85,
      });
    }

    return variants;
  }
}
