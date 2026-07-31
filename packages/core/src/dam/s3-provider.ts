import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  DeleteBucketPolicyCommand,
  S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  AssetStorageProvider,
  GetAssetUrlOptions,
  UploadAssetOptions,
  ThumbnailOptions,
  ThumbnailPreset,
  formatS3ObjectKey,
  formatThumbnailS3Key,
} from './storage.js';
import { FolderVisibilityManager } from './visibility-manager.js';
import { ThumbnailGenerator } from './thumbnail-generator.js';

export interface S3StorageConfig {
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
  publicBaseUrl?: string;
  keyPrefix?: string;
  visibilityManager?: FolderVisibilityManager;
}

export class S3AssetStorageProvider implements AssetStorageProvider {
  private client: S3Client;
  private bucket: string;
  private publicBaseUrl?: string;
  private keyPrefix: string;
  public visibilityManager: FolderVisibilityManager;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.publicBaseUrl = config.publicBaseUrl;
    this.keyPrefix = config.keyPrefix ?? ''; // Default to root bucket (no prefix)
    this.visibilityManager = config.visibilityManager ?? new FolderVisibilityManager();

    const clientConfig: S3ClientConfig = {
      region: config.region ?? 'us-east-1',
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle ?? true, // Default to true for MinIO compatibility
    };

    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      };
    }

    this.client = new S3Client(clientConfig);
  }

  public getS3Key(pimcorePath: string): string {
    return formatS3ObjectKey(pimcorePath, this.keyPrefix);
  }

  public getThumbnailS3Key(pimcorePath: string, preset: ThumbnailPreset = 'thumb'): string {
    return formatThumbnailS3Key(pimcorePath, preset, this.keyPrefix);
  }

  public async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      } catch (e) {
        console.warn(`Could not create bucket ${this.bucket}:`, e);
      }
    }

    await this.updateBucketPolicy();
  }

  public async updateBucketPolicy(): Promise<void> {
    const rules = this.visibilityManager.getRules();
    const publicRules = rules.filter((r) => r.isPublic);

    const resources: string[] = [
      `arn:aws:s3:::${this.bucket}/.thumbnails/*`
    ];

    for (const rule of publicRules) {
      let prefix = rule.pathPrefix.replace(/^\/+/, '').replace(/\/\*\*?$/, '');
      if (prefix && prefix !== '*') {
        resources.push(`arn:aws:s3:::${this.bucket}/${prefix}/*`);
        resources.push(`arn:aws:s3:::${this.bucket}/${prefix}`);
      } else if (prefix === '' || prefix === '*') {
        resources.push(`arn:aws:s3:::${this.bucket}/*`);
      }
    }

    const uniqueResources = Array.from(new Set(resources));

    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'SelectivePublicRead',
          Effect: 'Allow',
          Principal: '*',
          Action: ['s3:GetObject'],
          Resource: uniqueResources
        }
      ]
    };

    try {
      await this.client.send(
        new PutBucketPolicyCommand({
          Bucket: this.bucket,
          Policy: JSON.stringify(policy)
        })
      );
    } catch (e) {
      console.warn(`Could not set selective public bucket policy on ${this.bucket}:`, e);
    }
  }

  public async uploadAsset(
    pimcorePath: string,
    buffer: Buffer,
    mimeType: string,
    options: UploadAssetOptions = {}
  ): Promise<{ s3Key: string; url: string; thumbnails?: Record<ThumbnailPreset, string> }> {
    await this.ensureBucket();
    const s3Key = this.getS3Key(pimcorePath);
    const isPublic = options.isPublic ?? this.visibilityManager.isPathPublic(pimcorePath);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      Body: buffer,
      ContentType: mimeType,
      ACL: isPublic ? 'public-read' : 'private',
      Metadata: options.metadata,
    });

    await this.client.send(command);
    const url = await this.getAssetUrl(pimcorePath);
    const thumbnails: Partial<Record<ThumbnailPreset, string>> = {};

    // Generate and upload WebP thumbnails if image
    if (ThumbnailGenerator.isSupportedMimeType(mimeType)) {
      try {
        const thumbBuffers = await ThumbnailGenerator.generateAllPresets(buffer);
        const presets: ThumbnailPreset[] = ['thumb', 'medium', 'large'];

        for (const preset of presets) {
          const thumbKey = this.getThumbnailS3Key(pimcorePath, preset);
          await this.client.send(
            new PutObjectCommand({
              Bucket: this.bucket,
              Key: thumbKey,
              Body: thumbBuffers[preset],
              ContentType: 'image/webp',
              ACL: isPublic ? 'public-read' : 'private',
            })
          );
          thumbnails[preset] = await this.getThumbnailUrl(pimcorePath, { preset });
        }
      } catch (err) {
        console.warn('Failed to generate thumbnails for asset:', pimcorePath, err);
      }
    }

    return { s3Key, url, thumbnails: thumbnails as Record<ThumbnailPreset, string> };
  }

  public async getAssetUrl(pimcorePath: string, options: GetAssetUrlOptions = {}): Promise<string> {
    const s3Key = this.getS3Key(pimcorePath);
    return this.resolveS3Url(s3Key, pimcorePath, options.expiresInSeconds);
  }

  public async getThumbnailUrl(pimcorePath: string, options: ThumbnailOptions = {}): Promise<string> {
    const preset = options.preset ?? 'thumb';
    const thumbKey = this.getThumbnailS3Key(pimcorePath, preset);
    return this.resolveS3Url(thumbKey, pimcorePath, options.expiresInSeconds);
  }

  private async resolveS3Url(s3Key: string, pimcorePath: string, expiresInSeconds?: number): Promise<string> {
    const isPublic = this.visibilityManager.isPathPublic(pimcorePath);

    if (isPublic) {
      if (this.publicBaseUrl) {
        const cleanBase = this.publicBaseUrl.replace(/\/+$/, '');
        return `${cleanBase}/${s3Key}`;
      }
      const endpoint = await this.client.config.endpoint?.();
      if (endpoint) {
        const protocol = endpoint.protocol ?? 'http:';
        const hostname = endpoint.hostname;
        const port = endpoint.port ? `:${endpoint.port}` : '';
        return `${protocol}//${hostname}${port}/${this.bucket}/${s3Key}`;
      }
      return `https://${this.bucket}.s3.amazonaws.com/${s3Key}`;
    }

    // Private asset -> Generate Presigned URL
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
    });

    const expiresIn = expiresInSeconds ?? 3600; // Default 1 hour
    return getSignedUrl(this.client, command, { expiresIn });
  }

  public async deleteAsset(pimcorePath: string): Promise<void> {
    const s3Key = this.getS3Key(pimcorePath);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: s3Key }));

    // Delete thumbnail variants if present
    const presets: ThumbnailPreset[] = ['thumb', 'medium', 'large'];
    for (const preset of presets) {
      const thumbKey = this.getThumbnailS3Key(pimcorePath, preset);
      try {
        await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: thumbKey }));
      } catch {
        // Ignore errors if thumbnail variant doesn't exist
      }
    }
  }

  public async existsAsset(pimcorePath: string): Promise<boolean> {
    const s3Key = this.getS3Key(pimcorePath);
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
      });
      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Helper to construct S3AssetStorageProvider using environment variables.
 * Defaults keyPrefix to '' (root of bucket) unless S3_KEY_PREFIX is set.
 */
export function createS3ProviderFromEnv(
  env: Record<string, string | undefined> = process.env,
  visibilityManager?: FolderVisibilityManager
): S3AssetStorageProvider {
  return new S3AssetStorageProvider({
    bucket: env.S3_BUCKET ?? env.MINIO_BUCKET ?? 'whoobe-cms',
    endpoint: env.S3_ENDPOINT ?? env.MINIO_ENDPOINT ?? 'http://localhost:9000',
    region: env.S3_REGION ?? 'us-east-1',
    accessKeyId: env.S3_ACCESS_KEY_ID ?? env.MINIO_ROOT_USER ?? 'minioadmin',
    secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? env.MINIO_ROOT_PASSWORD ?? 'minioadminpassword',
    publicBaseUrl: env.S3_PUBLIC_BASE_URL,
    keyPrefix: env.S3_KEY_PREFIX ?? '', // Root bucket by default
    forcePathStyle: env.S3_FORCE_PATH_STYLE !== 'false',
    visibilityManager,
  });
}
