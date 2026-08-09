import { FolderVisibilityManager } from './visibility-manager.js';

/**
 * S3 / Asset Storage Engine Interface
 * Maps legacy Pimcore asset paths (e.g. /logos/brand.png) to S3 object keys.
 */

export interface UploadAssetOptions {
  isPublic?: boolean;
  metadata?: Record<string, string>;
}

export type ThumbnailPreset = 'thumb' | 'medium' | 'large';

export interface GetAssetUrlOptions {
  expiresInSeconds?: number;
}

export interface ThumbnailOptions {
  preset?: ThumbnailPreset;
  expiresInSeconds?: number;
}

export interface AssetStorageProvider {
  uploadAsset(
    pimcorePath: string,
    buffer: Buffer,
    mimeType: string,
    options?: UploadAssetOptions
  ): Promise<{ s3Key: string; url: string; thumbnails?: Record<ThumbnailPreset, string> }>;

  getAssetUrl(pimcorePath: string, options?: GetAssetUrlOptions): Promise<string>;

  getThumbnailUrl(pimcorePath: string, options?: ThumbnailOptions): Promise<string>;

  deleteAsset(pimcorePath: string): Promise<void>;

  existsAsset(pimcorePath: string): Promise<boolean>;

  /** Download the original file from storage as a Buffer. */
  downloadAsset(pimcorePath: string): Promise<Buffer | null>;

  /** Regenerate all thumbnail presets for an asset and upload them. */
  regenerateThumbnails(pimcorePath: string): Promise<Record<ThumbnailPreset, string> | null>;

  visibilityManager: FolderVisibilityManager;
}

export function formatS3ObjectKey(pimcorePath: string, prefix: string = ''): string {
  // Normalize slash separators and strip leading slash
  const cleanPath = pimcorePath.replace(/\\/g, '/').replace(/^\/+/, '');
  return prefix ? `${prefix}/${cleanPath}` : cleanPath;
}

export function formatThumbnailS3Key(
  pimcorePath: string,
  preset: ThumbnailPreset = 'thumb',
  prefix: string = ''
): string {
  const cleanPath = pimcorePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const lastDotIdx = cleanPath.lastIndexOf('.');
  const basePathWithoutExt = lastDotIdx > 0 ? cleanPath.substring(0, lastDotIdx) : cleanPath;
  const thumbRelativeKey = `.thumbnails/${basePathWithoutExt}_${preset}.webp`;
  return prefix ? `${prefix}/${thumbRelativeKey}` : thumbRelativeKey;
}
