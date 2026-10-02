import { sharpInput } from './sharp-input.js';
export interface AssetTechnicalMetadata {
  width?: number;
  height?: number;
  aspectRatio?: string;
  format?: string;
  mimeType?: string;
  colorSpace?: string;
  hasAlpha?: boolean;
  channels?: number;
  sizeBytes?: number;
  density?: number;
}

export interface AssetCameraMetadata {
  make?: string;
  model?: string;
  lens?: string;
  focalLength?: string;
  fNumber?: number;
  iso?: number;
  exposureTime?: string;
  flash?: string;
}

export interface AssetGpsMetadata {
  latitude?: number;
  longitude?: number;
  altitude?: number;
}

export interface AssetRightsMetadata {
  artist?: string;
  copyright?: string;
  createDate?: string;
  modifyDate?: string;
  software?: string;
}

export interface ExtractedAssetMetadata {
  technical: AssetTechnicalMetadata;
  camera?: AssetCameraMetadata;
  gps?: AssetGpsMetadata;
  rights?: AssetRightsMetadata;
  raw?: Record<string, any>;
}

export class AssetMetadataExtractor {
  /**
   * Safely check if running in browser runtime.
   */
  public static isBrowser(): boolean {
    return (
      typeof window !== 'undefined' ||
      typeof process === 'undefined' ||
      typeof (process as any)?.versions?.node === 'undefined'
    );
  }

  /**
   * Dynamically import exiftool-vendor if available in Node environment.
   */
  private static async getExifTool(): Promise<any> {
    if (this.isBrowser()) return null;
    try {
      const dynamicImport = new Function('mod', 'return import(mod)');
      const exifModule = await dynamicImport('exiftool-vendored');
      return exifModule.exiftool || exifModule.default?.exiftool;
    } catch {
      return null;
    }
  }

  /**
   * Dynamically import Sharp if available.
   */
  private static async getSharp(): Promise<any> {
    if (this.isBrowser()) return null;
    try {
      const dynamicImport = new Function('mod', 'return import(mod)');
      const sharpModule = await dynamicImport('sharp');
      return sharpModule.default || sharpModule;
    } catch {
      return null;
    }
  }

  /**
   * Extract comprehensive metadata from an image buffer or file path.
   */
  public static async extractMetadata(
    input: Buffer | Uint8Array | string,
    mimeType?: string
  ): Promise<ExtractedAssetMetadata> {
    const isBuffer = typeof input !== 'string';
    const uint8Data = isBuffer ? (input as Uint8Array) : null;
    const nodeBuffer = isBuffer && typeof Buffer !== 'undefined' ? Buffer.from(input as Uint8Array) : null;

    const metadata: ExtractedAssetMetadata = {
      technical: {
        sizeBytes: uint8Data ? uint8Data.byteLength || uint8Data.length : undefined,
        mimeType: mimeType || 'application/octet-stream',
      },
    };

    // 1. Browser-native technical metadata extraction
    if (this.isBrowser() && uint8Data && typeof Blob !== 'undefined' && typeof createImageBitmap !== 'undefined') {
      try {
        const blob = new Blob([new Uint8Array(uint8Data)], { type: mimeType || 'image/png' });
        const bmp = await createImageBitmap(blob);
        metadata.technical.width = bmp.width;
        metadata.technical.height = bmp.height;
        if (bmp.width && bmp.height) {
          const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
          const divisor = gcd(bmp.width, bmp.height);
          metadata.technical.aspectRatio = `${bmp.width / divisor}:${bmp.height / divisor}`;
        }
      } catch (e) {
        console.warn('Browser image metadata extraction warning:', e);
      }
    }

    // 2. Technical metadata extraction via Sharp (Node.js)
    const sharp = await this.getSharp();
    if (sharp && nodeBuffer) {
      try {
        const image = sharpInput(sharp, nodeBuffer);
        const meta = await image.metadata();

        metadata.technical.width = meta.width;
        metadata.technical.height = meta.height;
        if (meta.width && meta.height) {
          const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
          const divisor = gcd(meta.width, meta.height);
          metadata.technical.aspectRatio = `${meta.width / divisor}:${meta.height / divisor}`;
        }
        metadata.technical.format = meta.format;
        metadata.technical.colorSpace = meta.space;
        metadata.technical.hasAlpha = meta.hasAlpha;
        metadata.technical.channels = meta.channels;
        metadata.technical.density = meta.density;
      } catch (e) {
        console.warn('Sharp metadata extraction warning:', e);
      }
    }

    // 3. Deep EXIF/IPTC/GPS metadata extraction via ExifTool (if available)
    const exiftool = await this.getExifTool();
    if (exiftool) {
      try {
        const rawExif = isBuffer ? await exiftool.read(nodeBuffer) : await exiftool.read(input as string);

        if (rawExif) {
          metadata.raw = rawExif;

          // Camera metadata
          if (rawExif.Make || rawExif.Model || rawExif.LensModel) {
            metadata.camera = {
              make: rawExif.Make ? String(rawExif.Make) : undefined,
              model: rawExif.Model ? String(rawExif.Model) : undefined,
              lens: rawExif.LensModel ? String(rawExif.LensModel) : undefined,
              focalLength: rawExif.FocalLength ? String(rawExif.FocalLength) : undefined,
              fNumber: typeof rawExif.FNumber === 'number' ? rawExif.FNumber : undefined,
              iso: typeof rawExif.ISO === 'number' ? rawExif.ISO : undefined,
              exposureTime: rawExif.ExposureTime ? String(rawExif.ExposureTime) : undefined,
              flash: rawExif.Flash ? String(rawExif.Flash) : undefined,
            };
          }

          // Geolocation
          if (typeof rawExif.GPSLatitude === 'number' && typeof rawExif.GPSLongitude === 'number') {
            metadata.gps = {
              latitude: rawExif.GPSLatitude,
              longitude: rawExif.GPSLongitude,
              altitude: typeof rawExif.GPSAltitude === 'number' ? rawExif.GPSAltitude : undefined,
            };
          }

          // Rights & Timestamps
          if (rawExif.Artist || rawExif.Copyright || rawExif.CreateDate) {
            metadata.rights = {
              artist: rawExif.Artist ? String(rawExif.Artist) : undefined,
              copyright: rawExif.Copyright ? String(rawExif.Copyright) : undefined,
              createDate: rawExif.CreateDate ? String(rawExif.CreateDate) : undefined,
              modifyDate: rawExif.ModifyDate ? String(rawExif.ModifyDate) : undefined,
              software: rawExif.Software ? String(rawExif.Software) : undefined,
            };
          }
        }
      } catch (e) {
        console.warn('ExifTool metadata extraction warning:', e);
      }
    }

    return metadata;
  }
}
