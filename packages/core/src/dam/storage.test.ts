import { describe, it, expect } from 'vitest';
import { formatS3ObjectKey, formatThumbnailS3Key } from './storage.js';
import { FolderVisibilityManager } from './visibility-manager.js';
import { S3AssetStorageProvider, createS3ProviderFromEnv } from './s3-provider.js';

describe('DAM Storage Strategy & Visibility (Phase 1)', () => {
  describe('formatS3ObjectKey & formatThumbnailS3Key', () => {
    it('maps pimcore paths to root bucket object keys by default', () => {
      expect(formatS3ObjectKey('/logos/brand-logo.png')).toBe('logos/brand-logo.png');
      expect(formatS3ObjectKey('logos/brand-logo.png')).toBe('logos/brand-logo.png');
      expect(formatS3ObjectKey('\\documents\\pdf\\manual.pdf')).toBe('documents/pdf/manual.pdf');
    });

    it('supports custom key prefixes', () => {
      expect(formatS3ObjectKey('/catalog/item.jpg', 'whoobe-media')).toBe('whoobe-media/catalog/item.jpg');
    });

    it('formats thumbnail keys under .thumbnails namespace correctly', () => {
      expect(formatThumbnailS3Key('/logos/brand-logo.png', 'thumb')).toBe('.thumbnails/logos/brand-logo_thumb.webp');
      expect(formatThumbnailS3Key('/logos/brand-logo.png', 'medium', 'whoobe-media')).toBe('whoobe-media/.thumbnails/logos/brand-logo_medium.webp');
    });
  });

  describe('FolderVisibilityManager', () => {
    it('defaults to PRIVATE for all asset paths', () => {
      const manager = new FolderVisibilityManager();
      expect(manager.isPathPublic('/logos/brand.png')).toBe(false);
      expect(manager.isPathPublic('/downloads/catalog.pdf')).toBe(false);
      expect(manager.isPathPublic('/index.html')).toBe(false);
    });

    it('respects public folder rules', () => {
      const manager = new FolderVisibilityManager();
      manager.setFolderVisibility('/public/logos', true);

      expect(manager.isPathPublic('/public/logos/brand-logo.png')).toBe(true);
      expect(manager.isPathPublic('/public/logos/subfolder/icon.svg')).toBe(true);

      // Other paths remain private
      expect(manager.isPathPublic('/private/secret.pdf')).toBe(false);
      expect(manager.isPathPublic('/public/other/file.png')).toBe(false);
    });

    it('allows overriding subfolder visibility', () => {
      const manager = new FolderVisibilityManager();
      manager.setFolderVisibility('/media', true);
      manager.setFolderVisibility('/media/confidential', false);

      expect(manager.isPathPublic('/media/public-image.png')).toBe(true);
      expect(manager.isPathPublic('/media/confidential/secret-report.pdf')).toBe(false);
    });

    it('supports wildcard path matching (* and **)', () => {
      const manager = new FolderVisibilityManager();
      manager.setFolderVisibility('/public/**', true);
      manager.setFolderVisibility('/uploads/*/marketing/**', true);

      expect(manager.isPathPublic('/public/logos/brand-logo.png')).toBe(true);
      expect(manager.isPathPublic('/uploads/2024/marketing/banner.jpg')).toBe(true);
      expect(manager.isPathPublic('/uploads/2024/private/report.pdf')).toBe(false);
    });
  });

  describe('S3AssetStorageProvider', () => {
    it('generates public asset URLs at root bucket level by default', async () => {
      const visibilityManager = new FolderVisibilityManager();
      visibilityManager.setFolderVisibility('/public-brand', true);

      const provider = new S3AssetStorageProvider({
        bucket: 'my-whoobe-bucket',
        endpoint: 'http://localhost:9000',
        publicBaseUrl: 'https://cdn.example.com/whoobe-assets',
        visibilityManager,
      });

      const publicUrl = await provider.getAssetUrl('/public-brand/logo.png');
      expect(publicUrl).toBe('https://cdn.example.com/whoobe-assets/public-brand/logo.png');

      const thumbUrl = await provider.getThumbnailUrl('/public-brand/logo.png', { preset: 'thumb' });
      expect(thumbUrl).toBe('https://cdn.example.com/whoobe-assets/.thumbnails/public-brand/logo_thumb.webp');
    });

    it('generates presigned URLs for private asset paths at root bucket level', async () => {
      const provider = new S3AssetStorageProvider({
        bucket: 'my-whoobe-bucket',
        endpoint: 'http://localhost:9000',
        accessKeyId: 'minioadmin',
        secretAccessKey: 'minioadmin',
      });

      const privateUrl = await provider.getAssetUrl('/internal/financials.pdf');
      expect(privateUrl).toContain('http://localhost:9000/my-whoobe-bucket/internal/financials.pdf');
      expect(privateUrl).toContain('X-Amz-Signature');
    });

    it('constructs provider using environment variables with root bucket default', () => {
      const provider = createS3ProviderFromEnv({
        S3_BUCKET: 'pimcore-custom-dam',
        S3_ENDPOINT: 'http://localhost:9000',
      });
      expect(provider.getS3Key('/photos/vacation.jpg')).toBe('photos/vacation.jpg');
    });
  });
});
