import { sharpInput } from './sharp-input.js';
import { ThumbnailPreset } from './storage.js';

export interface ThumbnailDimensions {
  width: number;
  height: number;
  fit: 'cover' | 'inside';
}

export const PRESET_DIMENSIONS: Record<ThumbnailPreset, ThumbnailDimensions> = {
  thumb: { width: 150, height: 150, fit: 'cover' },
  medium: { width: 400, height: 400, fit: 'inside' },
  large: { width: 1024, height: 1024, fit: 'inside' },
};

export class ThumbnailGenerator {
  /**
   * Safely check if running in browser runtime (vs Node.js).
   */
  public static isBrowser(): boolean {
    return (
      typeof window !== 'undefined' ||
      typeof process === 'undefined' ||
      typeof (process as any)?.versions?.node === 'undefined'
    );
  }

  /**
   * Check if a given mimeType supports image thumbnail generation.
   */
  public static isSupportedMimeType(mimeType: string): boolean {
    return [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/svg+xml',
      'image/tiff',
      'image/avif',
    ].includes(mimeType.toLowerCase());
  }

  /**
   * Generate WebP thumbnail buffer using Sharp (Node.js) or HTML5 Canvas (Browser).
   */
  public static async generateThumbnail(
    buffer: Buffer | Uint8Array,
    preset: ThumbnailPreset = 'thumb'
  ): Promise<Buffer | Uint8Array> {
    if (this.isBrowser()) {
      return this.generateThumbnailInBrowser(buffer, preset);
    }

    try {
      // Use Function constructor so Vite AST analyzer never traces or pre-bundles 'sharp' into browser chunks
      const dynamicImport = new Function('mod', 'return import(mod)');
      const sharpModule = await dynamicImport('sharp');
      const sharp = sharpModule.default || sharpModule;
      const dims = PRESET_DIMENSIONS[preset] ?? PRESET_DIMENSIONS.thumb;

      return await sharpInput(sharp, buffer)
        .resize(dims.width, dims.height, {
          fit: dims.fit,
          withoutEnlargement: true,
        })
        .toFormat('webp', { quality: 80, alphaQuality: 100 })
        .toBuffer();
    } catch {
      return buffer;
    }
  }

  /**
   * Browser-native HTML5 Canvas WebP thumbnail generator.
   */
  private static async generateThumbnailInBrowser(
    uint8Data: Uint8Array | Buffer,
    preset: ThumbnailPreset = 'thumb'
  ): Promise<Uint8Array> {
    if (
      typeof Blob === 'undefined' ||
      typeof createImageBitmap === 'undefined' ||
      typeof document === 'undefined'
    ) {
      return uint8Data;
    }

    try {
      const blob = new Blob([new Uint8Array(uint8Data)]);
      const imageBitmap = await createImageBitmap(blob);
      const dims = PRESET_DIMENSIONS[preset] ?? PRESET_DIMENSIONS.thumb;

      let width = imageBitmap.width;
      let height = imageBitmap.height;

      if (dims.fit === 'cover') {
        const scale = Math.max(dims.width / width, dims.height / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      } else {
        const scale = Math.min(dims.width / width, dims.height / height, 1);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = dims.fit === 'cover' ? dims.width : width;
      canvas.height = dims.fit === 'cover' ? dims.height : height;

const ctx = canvas.getContext('2d');
if (!ctx) return uint8Data;

// Clear to transparent so PNG alpha is preserved through the WebP export
ctx.clearRect(0, 0, canvas.width, canvas.height);
ctx.drawImage(imageBitmap, 0, 0, width, height);

      const webpBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/webp', 0.8)
      );

      if (!webpBlob) return uint8Data;

      const arrayBuf = await webpBlob.arrayBuffer();
      return new Uint8Array(arrayBuf);
    } catch {
      return uint8Data;
    }
  }

  /**
   * Generate all standard WebP thumbnail presets (thumb, medium, large).
   */
  public static async generateAllPresets(
    buffer: Buffer | Uint8Array
  ): Promise<Record<ThumbnailPreset, Buffer | Uint8Array>> {
    const presets: ThumbnailPreset[] = ['thumb', 'medium', 'large'];
    const results: Partial<Record<ThumbnailPreset, Buffer | Uint8Array>> = {};

    for (const preset of presets) {
      results[preset] = await this.generateThumbnail(buffer, preset);
    }

    return results as Record<ThumbnailPreset, Buffer | Uint8Array>;
  }
}
