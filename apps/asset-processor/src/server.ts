import express, { Request, Response } from 'express';
import multer from 'multer';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { Readable } from 'node:stream';
import { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  ImageProcessingPipeline,
  AssetMetadataExtractor,
  SupportedImageFormat,
  S3AssetStorageProvider,
  FolderVisibilityManager,
  FolderVisibilityRule,
  ThumbnailGenerator,
  ThumbnailPreset,
  getFileTypeFromFilename,
} from '@whoobe-cms/core';
import {
  requireAuth,
  requirePermission,
  PERMISSIONS,
  listFolders,
  createFolderRecord,
  deleteFolderRecord,
  listAssets,
  getAssetByPath,
  getAssetById,
  upsertAssetRecord,
  deleteAssetRecord,
  updateAssetMetadata,
  loadRootEnv,
} from '@whoobe-cms/core/server';

// Load the repo-root .env (single source of truth for all apps, see
// docs/plans/environment/env-optimization.md) with ${VAR} expansion so
// bucket/endpoint/credentials have a persisted, discoverable place to live
// instead of one-off shell vars. Shell-exported vars win, which is how
// ./dev-cms.sh --hostname overrides WHOOBE_HOSTNAME-derived values.
loadRootEnv();

const app = express();
const port = process.env.PORT || 3002;

// S3/MinIO credentials & bucket config live ONLY on this server (env vars),
// never shipped to the browser. The admin-dashboard SPA talks to this
// service over HTTP and never sees an access key or secret.
const damBaseConfig = {
  bucket: process.env.S3_BUCKET ?? process.env.MINIO_BUCKET ?? 'whoobe-cms',
  region: process.env.S3_REGION ?? 'us-east-1',
  endpoint: process.env.S3_ENDPOINT ?? process.env.MINIO_ENDPOINT ?? 'http://localhost:9000',
  accessKeyId: process.env.S3_ACCESS_KEY_ID ?? process.env.MINIO_ROOT_USER ?? 'minioadmin',
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? process.env.MINIO_ROOT_PASSWORD ?? 'minioadminpassword',
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  publicBaseUrl: process.env.S3_PUBLIC_BASE_URL,
  keyPrefix: process.env.S3_KEY_PREFIX ?? '',
};

function parseFolderRules(raw: unknown): FolderVisibilityRule[] {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r): r is FolderVisibilityRule => !!r && typeof r.pathPrefix === 'string' && typeof r.isPublic === 'boolean')
      .map((r) => ({ pathPrefix: r.pathPrefix, isPublic: r.isPublic }));
  } catch {
    return [];
  }
}

// A fresh provider per request avoids sharing mutable visibilityManager
// state across concurrent requests carrying different folderRules.
function createDamProvider(folderRules: FolderVisibilityRule[]): S3AssetStorageProvider {
  return new S3AssetStorageProvider({
    ...damBaseConfig,
    visibilityManager: new FolderVisibilityManager(folderRules),
  });
}

function deriveFolderPath(pimcorePath: string): string {
  const idx = pimcorePath.lastIndexOf('/');
  return idx <= 0 ? '/' : pimcorePath.substring(0, idx);
}

const FORMAT_MIME: Record<string, string> = {
  webp: 'image/webp',
  avif: 'image/avif',
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  gif: 'image/gif',
};

// Shared by /upload and /transform: writes the object to S3 (with
// thumbnails) and upserts the Postgres record, returning the same response
// shape both endpoints send back to the browser.
async function finalizeAssetUpload(
  provider: S3AssetStorageProvider,
  input: {
    pimcorePath: string;
    buffer: Buffer;
    mimeType: string;
    isPublic: boolean;
    filename: string;
    folderPath: string;
    fileType: string;
    metadata?: any;
  }
) {
  const result = await provider.uploadAsset(input.pimcorePath, input.buffer, input.mimeType, {
    isPublic: input.isPublic,
  });

  const assetRecord = await upsertAssetRecord({
    pimcorePath: input.pimcorePath,
    filename: input.filename,
    folderPath: input.folderPath,
    sizeBytes: input.buffer.length,
    mimeType: input.mimeType,
    fileType: input.fileType,
    s3Key: result.s3Key,
    isPublic: input.isPublic,
    metadata: input.metadata,
  });

  return {
    success: true,
    s3Key: result.s3Key,
    url: result.url,
    thumbnailUrl: result.thumbnails?.thumb ?? '',
    thumbnails: result.thumbnails ?? {},
    asset: {
      ...assetRecord,
      url: result.url,
      thumbnailUrl: result.thumbnails?.thumb ?? '',
      thumbnails: result.thumbnails ?? {},
    },
  };
}

// Configure Multer in-memory storage for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max file size
});

app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());
// origin: true reflects the request's own Origin header - required for
// credentialed (cookie-carrying) requests, which "*" cannot support once
// these routes are behind a session (see requireAuth/requirePermission
// below). Lock this to an explicit allowlist before this is exposed beyond
// a trusted network.
app.use(cors({ origin: true, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] }));

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'asset-processor-microservice',
    uptimeSeconds: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Process Image Endpoint (resize, convert format, generate WebP/AVIF variants)
app.post('/api/v1/process', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    let inputBuffer: Buffer;

    if (req.file) {
      inputBuffer = req.file.buffer;
    } else if (req.body?.base64) {
      inputBuffer = Buffer.from(req.body.base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    } else {
      res.status(400).json({ error: 'Missing image file or base64 data' });
      return;
    }

    const mode = req.query.mode || 'transform';

    if (mode === 'variants') {
      const format = (req.query.format as SupportedImageFormat) || 'webp';
      const variants = await ImageProcessingPipeline.generateVariants(inputBuffer, format);

      const responseVariants: Record<string, string> = {};
      for (const [key, buf] of Object.entries(variants)) {
        responseVariants[key] = `data:image/${format};base64,${buf.toString('base64')}`;
      }

      res.json({ success: true, variants: responseVariants });
      return;
    }

    // Default transform
    const width = req.query.width ? parseInt(req.query.width as string, 10) : undefined;
    const height = req.query.height ? parseInt(req.query.height as string, 10) : undefined;
    const format = (req.query.format as SupportedImageFormat) || 'webp';
    const quality = req.query.quality ? parseInt(req.query.quality as string, 10) : 80;

    const processedBuffer = await ImageProcessingPipeline.transform(inputBuffer, {
      resize: width || height ? { width, height, fit: 'inside' } : undefined,
      format,
      quality,
    });

    res.type(`image/${format}`).send(processedBuffer);
  } catch (error: any) {
    console.error('Processing error:', error);
    res.status(500).json({ error: error.message || 'Image processing failed' });
  }
});

// Metadata Extraction Endpoint (EXIF, IPTC, GPS, Camera info)
app.post('/api/v1/metadata', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    let inputBuffer: Buffer;
    let mimeType = 'application/octet-stream';

    if (req.file) {
      inputBuffer = req.file.buffer;
      mimeType = req.file.mimetype;
    } else if (req.body?.base64) {
      inputBuffer = Buffer.from(req.body.base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    } else {
      res.status(400).json({ error: 'Missing file or base64 data' });
      return;
    }

    const metadata = await AssetMetadataExtractor.extractMetadata(inputBuffer, mimeType);
    res.json({ success: true, metadata });
  } catch (error: any) {
    console.error('Metadata extraction error:', error);
    res.status(500).json({ error: error.message || 'Metadata extraction failed' });
  }
});

// Watermark Endpoint
app.post(
  '/api/v1/watermark',
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'watermark', maxCount: 1 },
  ]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      if (!files?.file?.[0] || !files?.watermark?.[0]) {
        res.status(400).json({ error: 'Missing main file or watermark file' });
        return;
      }

      const inputBuffer = files.file[0].buffer;
      const watermarkBuffer = files.watermark[0].buffer;
      const opacity = req.query.opacity ? parseFloat(req.query.opacity as string) : 0.8;
      const format = (req.query.format as SupportedImageFormat) || 'webp';

      const processedBuffer = await ImageProcessingPipeline.transform(inputBuffer, {
        format,
        watermark: {
          watermarkBuffer,
          opacity,
        },
      });

      res.type(`image/${format}`).send(processedBuffer);
    } catch (error: any) {
      console.error('Watermark error:', error);
      res.status(500).json({ error: error.message || 'Watermarking failed' });
    }
  }
);

// Non-secret storage info for the admin UI to display (no credentials).
app.get('/api/v1/dam/info', requireAuth, (_req: Request, res: Response) => {
  res.json({
    bucket: damBaseConfig.bucket,
    endpoint: damBaseConfig.endpoint,
    publicBaseUrl: damBaseConfig.publicBaseUrl ?? '',
    keyPrefix: damBaseConfig.keyPrefix,
  });
});

// Upload an asset to S3/MinIO. Credentials never leave this process.
app.post('/api/v1/dam/upload', requirePermission(PERMISSIONS.ASSETS_UPLOAD), upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    const pimcorePath = req.body?.pimcorePath as string | undefined;
    if (!req.file) {
      res.status(400).json({ error: 'Missing file' });
      return;
    }
    if (!pimcorePath) {
      res.status(400).json({ error: 'Missing pimcorePath' });
      return;
    }

    const isPublic = req.body?.isPublic === 'true';
    const provider = createDamProvider(parseFolderRules(req.body?.folderRules));

    let metadata: any = undefined;
    if (req.body?.metadata) {
      try {
        metadata = JSON.parse(req.body.metadata);
      } catch {
        // Malformed metadata JSON - proceed without it rather than fail the upload.
      }
    }

    const { fileType } = getFileTypeFromFilename(req.file.originalname);
    const response = await finalizeAssetUpload(provider, {
      pimcorePath,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype || 'application/octet-stream',
      isPublic,
      filename: req.file.originalname,
      folderPath: deriveFolderPath(pimcorePath),
      fileType,
      metadata,
    });

    res.json(response);
  } catch (error: any) {
    console.error('DAM upload error:', error);
    res.status(500).json({ error: error.message || 'Asset upload failed' });
  }
});

// Re-transforms an already-uploaded image asset through sharp (server-side
// only - the browser has no way to run sharp) and persists the result,
// either as a new version of the same asset or a new "_edited" copy.
app.post('/api/v1/dam/transform', requirePermission(PERMISSIONS.ASSETS_UPLOAD), async (req: Request, res: Response): Promise<void> => {
  try {
    const { pimcorePath, asNewVersion, options, folderRules } = req.body ?? {};
    if (!pimcorePath || !options?.format) {
      res.status(400).json({ error: 'Missing pimcorePath or options.format' });
      return;
    }

    const sourceRecord = await getAssetByPath(pimcorePath);
    if (!sourceRecord) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }

    const provider = createDamProvider(parseFolderRules(folderRules));
    const sourceUrl = await provider.getAssetUrl(pimcorePath);
    const sourceResponse = await fetch(sourceUrl);
    if (!sourceResponse.ok) {
      res.status(502).json({ error: 'Could not fetch the original asset from storage' });
      return;
    }
    const inputBuffer = Buffer.from(await sourceResponse.arrayBuffer());

    const watermark = options.watermarkText
      ? { text: options.watermarkText as string, gravity: options.watermarkPosition, opacity: options.watermarkOpacity }
      : undefined;

    const transformedBuffer = await ImageProcessingPipeline.transform(inputBuffer, {
      resize: options.width || options.height
        ? { width: options.width, height: options.height, fit: options.fit ?? 'inside' }
        : undefined,
      format: options.format,
      quality: options.quality,
      rotate: options.rotate,
      grayscale: options.grayscale,
      blur: options.blur,
      watermark,
    });

    const mimeType = FORMAT_MIME[options.format] ?? 'application/octet-stream';

    let targetPath = pimcorePath;
    let filename = sourceRecord.filename;
    if (!asNewVersion) {
      const baseName = sourceRecord.filename.replace(/\.[^/.]+$/, '');
      filename = `${baseName}_edited.${options.format}`;
      targetPath = sourceRecord.folderPath === '/' ? `/${filename}` : `${sourceRecord.folderPath}/${filename}`;
    }

    const { fileType } = getFileTypeFromFilename(filename);
    // Resize/rotate can change actual dimensions, so re-extract technical
    // metadata from the transformed bytes rather than reusing the source's
    // (now potentially stale) width/height.
    const transformedMetadata = await AssetMetadataExtractor.extractMetadata(transformedBuffer, mimeType);
    const response = await finalizeAssetUpload(provider, {
      pimcorePath: targetPath,
      buffer: transformedBuffer,
      mimeType,
      isPublic: sourceRecord.isPublic,
      filename,
      folderPath: sourceRecord.folderPath,
      fileType,
      metadata: transformedMetadata,
    });

    res.json(response);
  } catch (error: any) {
    console.error('DAM transform error:', error);
    res.status(500).json({ error: error.message || 'Image transform failed' });
  }
});

// Delete an asset (and its thumbnail variants) from S3/MinIO, plus its DB record.
app.delete('/api/v1/dam/asset', requirePermission(PERMISSIONS.ASSETS_DELETE), async (req: Request, res: Response): Promise<void> => {
  try {
    const pimcorePath = req.body?.pimcorePath as string | undefined;
    if (!pimcorePath) {
      res.status(400).json({ error: 'Missing pimcorePath' });
      return;
    }
    const provider = createDamProvider(parseFolderRules(req.body?.folderRules));
    await provider.deleteAsset(pimcorePath);
    await deleteAssetRecord(pimcorePath);
    res.json({ success: true });
  } catch (error: any) {
    console.error('DAM delete error:', error);
    res.status(500).json({ error: error.message || 'Asset delete failed' });
  }
});

// --- Folder & asset records (Postgres) - the multi-user source of truth
// for what exists, replacing the browser-localStorage-only bookkeeping
// damStore.ts used to do. ---

app.get('/api/v1/dam/folders', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    const folders = await listFolders();
    res.json({ folders });
  } catch (error: any) {
    console.error('DAM list folders error:', error);
    res.status(500).json({ error: error.message || 'Failed to list folders' });
  }
});

app.post('/api/v1/dam/folders', requirePermission(PERMISSIONS.ASSETS_UPLOAD), async (req: Request, res: Response): Promise<void> => {
  try {
    const { path, name, parentPath, isPublic } = req.body ?? {};
    if (!path || !name || !parentPath) {
      res.status(400).json({ error: 'Missing path, name, or parentPath' });
      return;
    }
    const folder = await createFolderRecord({ path, name, parentPath, isPublic });
    res.json({ folder });
  } catch (error: any) {
    console.error('DAM create folder error:', error);
    res.status(400).json({ error: error.message || 'Failed to create folder' });
  }
});

// Deletes the folder + every descendant folder/asset record, and the
// matching S3 objects for every asset that was under it.
app.delete('/api/v1/dam/folders', requirePermission(PERMISSIONS.ASSETS_DELETE), async (req: Request, res: Response): Promise<void> => {
  try {
    const path = req.body?.path as string | undefined;
    if (!path) {
      res.status(400).json({ error: 'Missing path' });
      return;
    }
    const provider = createDamProvider(parseFolderRules(req.body?.folderRules));
    const { deletedAssetPaths } = await deleteFolderRecord(path);

    for (const assetPath of deletedAssetPaths) {
      try {
        await provider.deleteAsset(assetPath);
      } catch (e) {
        console.warn(`Could not delete S3 object for ${assetPath}:`, e);
      }
    }

    res.json({ success: true, deletedAssetCount: deletedAssetPaths.length });
  } catch (error: any) {
    console.error('DAM delete folder error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete folder' });
  }
});

// Returns each asset's persisted record plus freshly-resolved URLs.
// Presigning is a local HMAC computation (no round trip to S3), so doing
// this per-asset is cheap even for a folder with many assets.
app.get('/api/v1/dam/assets', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const folderPath = req.query.folderPath as string | undefined;
    const records = await listAssets(folderPath);
    const provider = createDamProvider(parseFolderRules(req.query.folderRules));

    const withUrls = await Promise.all(
      records.map(async (record) => {
        const [url, thumb, medium, large] = await Promise.all([
          provider.getAssetUrl(record.pimcorePath),
          provider.getThumbnailUrl(record.pimcorePath, { preset: 'thumb' }),
          provider.getThumbnailUrl(record.pimcorePath, { preset: 'medium' }),
          provider.getThumbnailUrl(record.pimcorePath, { preset: 'large' }),
        ]);
        return { ...record, url, thumbnailUrl: thumb, thumbnails: { thumb, medium, large } };
      })
    );

    res.json({ assets: withUrls });
  } catch (error: any) {
    console.error('DAM list assets error:', error);
    res.status(500).json({ error: error.message || 'Failed to list assets' });
  }
});

// POST variant of /api/v1/dam/assets — avoids URL length limits when
// folderRules is large. Frontend switched to this to fix 431 errors.
app.post('/api/v1/dam/assets', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const folderPath = req.body.folderPath as string | undefined;
    const records = await listAssets(folderPath);
    const provider = createDamProvider(parseFolderRules(req.body.folderRules));

    const withUrls = await Promise.all(
      records.map(async (record) => {
        const [url, thumb, medium, large] = await Promise.all([
          provider.getAssetUrl(record.pimcorePath),
          provider.getThumbnailUrl(record.pimcorePath, { preset: 'thumb' }),
          provider.getThumbnailUrl(record.pimcorePath, { preset: 'medium' }),
          provider.getThumbnailUrl(record.pimcorePath, { preset: 'large' }),
        ]);
        return { ...record, url, thumbnailUrl: thumb, thumbnails: { thumb, medium, large } };
      })
    );

    res.json({ assets: withUrls });
  } catch (error: any) {
    console.error('DAM list assets error:', error);
    res.status(500).json({ error: error.message || 'Failed to list assets' });
  }
});

// Single asset by record id - used to resolve a data object's asset
// reference (stored as { assetId: '<uuid>' }) to a real displayable URL
// at render time. Must be registered BEFORE any more-specific /assets/...
// routes below that might shadow it.
app.get('/api/v1/dam/assets/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const record = await getAssetById(req.params.id);
    if (!record) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }
    const provider = createDamProvider(parseFolderRules(req.query.folderRules));
    const [url, thumb, medium, large] = await Promise.all([
      provider.getAssetUrl(record.pimcorePath),
      provider.getThumbnailUrl(record.pimcorePath, { preset: 'thumb' }),
      provider.getThumbnailUrl(record.pimcorePath, { preset: 'medium' }),
      provider.getThumbnailUrl(record.pimcorePath, { preset: 'large' }),
    ]);
    res.json({ asset: { ...record, url, thumbnailUrl: thumb, thumbnails: { thumb, medium, large } } });
  } catch (error: any) {
    console.error('DAM get asset by id error:', error);
    res.status(500).json({ error: error.message || 'Failed to get asset' });
  }
});

app.patch('/api/v1/dam/assets/metadata', requirePermission(PERMISSIONS.ASSETS_UPLOAD), async (req: Request, res: Response): Promise<void> => {
  try {
    const { pimcorePath, metadata } = req.body ?? {};
    if (!pimcorePath) {
      res.status(400).json({ error: 'Missing pimcorePath' });
      return;
    }
    const updated = await updateAssetMetadata(pimcorePath, metadata ?? null);
    if (!updated) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }
    res.json({ asset: updated });
  } catch (error: any) {
    console.error('DAM update metadata error:', error);
    res.status(500).json({ error: error.message || 'Failed to update metadata' });
  }
});

// Resolve the (public or freshly-presigned) URL and thumbnail URLs for an asset.
app.get('/api/v1/dam/asset-urls', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const pimcorePath = req.query.pimcorePath as string | undefined;
    if (!pimcorePath) {
      res.status(400).json({ error: 'Missing pimcorePath' });
      return;
    }
    const forwardedProto = (req.headers['x-forwarded-proto'] as string) ?? req.protocol
    const forwardedHost = (req.headers['x-forwarded-host'] as string) ?? req.headers.host ?? 'localhost'
    const publicOrigin = `${forwardedProto}://${forwardedHost}`

    const provider = createDamProvider(parseFolderRules(req.query.folderRules));
    const s3Key = provider.getS3Key(pimcorePath);
    const thumbKey = provider.getThumbnailS3Key(pimcorePath, 'thumb');
    const mediumKey = provider.getThumbnailS3Key(pimcorePath, 'medium');
    const largeKey = provider.getThumbnailS3Key(pimcorePath, 'large');

    function proxyUrl(key: string): string {
      return `${publicOrigin}/dam-asset/${key}`
    }

    res.json({
      isPublic: provider.visibilityManager.isPathPublic(pimcorePath),
      url: proxyUrl(s3Key),
      thumbnailUrl: proxyUrl(thumbKey),
      thumbnails: {
        thumb: proxyUrl(thumbKey),
        medium: proxyUrl(mediumKey),
        large: proxyUrl(largeKey),
      }
    });
  } catch (error: any) {
    console.error('DAM asset-urls error:', error);
    res.status(500).json({ error: error.message || 'Failed to resolve asset URL' });
  }
});

// POST variant — avoids URL length limits from large folderRules.
app.post('/api/v1/dam/asset-urls', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { pimcorePath, folderRules, expiresIn } = req.body ?? {};
    if (!pimcorePath) {
      res.status(400).json({ error: 'Missing pimcorePath' });
      return;
    }

    // Determine the public-facing hostname from forwarded headers (set by
    // Cloudflare etc.) so asset URLs use the same origin as the page,
    // avoiding mixed-content and Chrome Local Network Access blocks when
    // the page is served over HTTPS behind a reverse proxy.
    const forwardedProto = (req.headers['x-forwarded-proto'] as string) ?? req.protocol
    const forwardedHost = (req.headers['x-forwarded-host'] as string) ?? req.headers.host ?? 'localhost'
    const publicOrigin = `${forwardedProto}://${forwardedHost}`

    const provider = createDamProvider(parseFolderRules(folderRules));
    const s3Key = provider.getS3Key(pimcorePath);
    const thumbKey = provider.getThumbnailS3Key(pimcorePath, 'thumb');
    const mediumKey = provider.getThumbnailS3Key(pimcorePath, 'medium');
    const largeKey = provider.getThumbnailS3Key(pimcorePath, 'large');

    function proxyUrl(key: string): string {
      return `${publicOrigin}/dam-asset/${key}`
    }

    res.json({
      isPublic: provider.visibilityManager.isPathPublic(pimcorePath),
      url: proxyUrl(s3Key),
      thumbnailUrl: proxyUrl(thumbKey),
      thumbnails: {
        thumb: proxyUrl(thumbKey),
        medium: proxyUrl(mediumKey),
        large: proxyUrl(largeKey),
      }
    });
  } catch (error: any) {
    console.error('DAM asset-urls error:', error);
    res.status(500).json({ error: error.message || 'Failed to resolve asset URL' });
  }
});

// Check whether an asset already exists in the bucket.
app.get('/api/v1/dam/exists', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const pimcorePath = req.query.pimcorePath as string | undefined;
    if (!pimcorePath) {
      res.status(400).json({ error: 'Missing pimcorePath' });
      return;
    }
    const provider = createDamProvider(parseFolderRules(req.query.folderRules));
    const exists = await provider.existsAsset(pimcorePath);
    res.json({ exists });
  } catch (error: any) {
    console.error('DAM exists error:', error);
    res.status(500).json({ error: error.message || 'Failed to check asset existence' });
  }
});

// POST variant — avoids URL length limits from large folderRules.
app.post('/api/v1/dam/exists', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { pimcorePath, folderRules } = req.body ?? {};
    if (!pimcorePath) {
      res.status(400).json({ error: 'Missing pimcorePath' });
      return;
    }
    const provider = createDamProvider(parseFolderRules(folderRules));
    const exists = await provider.existsAsset(pimcorePath);
    res.json({ exists });
  } catch (error: any) {
    console.error('DAM exists error:', error);
    res.status(500).json({ error: error.message || 'Failed to check asset existence' });
  }
});

// Regenerate thumbnails for one or more assets by pimcorePath.
app.post('/api/v1/dam/regenerate-thumbnails', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { paths, folderRules } = req.body ?? {};
    if (!Array.isArray(paths) || paths.length === 0) {
      res.status(400).json({ error: 'paths[] is required' });
      return;
    }
    const provider = createDamProvider(parseFolderRules(folderRules));
    const results: { pimcorePath: string; success: boolean; error?: string }[] = [];
    for (const pimcorePath of paths) {
      try {
        const thumbnails = await provider.regenerateThumbnails(pimcorePath);
        results.push({ pimcorePath, success: !!thumbnails });
      } catch (e: any) {
        results.push({ pimcorePath, success: false, error: e.message });
      }
    }
    const succeeded = results.filter((r) => r.success).length;
    res.json({ succeeded, failed: results.length - succeeded, results });
  } catch (error: any) {
    console.error('Regenerate thumbnails error:', error);
    res.status(500).json({ error: error.message || 'Failed to regenerate thumbnails' });
  }
});

// Ensure the bucket exists and its public-read policy reflects current folder rules.
app.post('/api/v1/dam/ensure-bucket', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const provider = createDamProvider(parseFolderRules(req.body?.folderRules));
    await provider.ensureBucket();
    res.json({ success: true, bucket: damBaseConfig.bucket });
  } catch (error: any) {
    console.error('DAM ensure-bucket error:', error);
    res.status(500).json({ error: error.message || 'Failed to ensure bucket' });
  }
});

// S3 client for the proxy — created once with the same credentials as the
// DAM provider, so the proxy can serve authenticated requests to MinIO.
const s3ClientForProxy = new S3Client({
  region: damBaseConfig.region,
  endpoint: damBaseConfig.endpoint,
  credentials: { accessKeyId: damBaseConfig.accessKeyId, secretAccessKey: damBaseConfig.secretAccessKey },
  forcePathStyle: damBaseConfig.forcePathStyle !== false,
});

const THUMB_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'tiff', 'svg'];

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', avif: 'image/avif',
  tiff: 'image/tiff', svg: 'image/svg+xml',
};

function parseThumbnailKey(thumbKey: string): { basePath: string; preset: ThumbnailPreset } | null {
  if (!thumbKey.startsWith('.thumbnails/')) return null;
  const relativeKey = thumbKey.slice('.thumbnails/'.length);
  const presets: ThumbnailPreset[] = ['thumb', 'medium', 'large'];
  for (const preset of presets) {
    const suffix = `_${preset}.webp`;
    if (relativeKey.endsWith(suffix)) {
      return { basePath: relativeKey.slice(0, -suffix.length), preset };
    }
  }
  return null;
}

async function findOriginalS3Key(basePath: string): Promise<string | null> {
  for (const ext of THUMB_EXTENSIONS) {
    const candidateKey = `${basePath}.${ext}`;
    try {
      await s3ClientForProxy.send(new HeadObjectCommand({ Bucket: damBaseConfig.bucket, Key: candidateKey }));
      return candidateKey;
    } catch { continue; }
  }
  return null;
}

// Proxy endpoint: serves files from S3/MinIO through this server so the
// browser never hits S3/MinIO directly (avoids CORS, presigned URL expiry,
// and cross-host issues). Uses a signed GetObjectCommand so MinIO
// authenticated access works (the bucket is not publicly readable).
app.get('/dam-asset/*', async (req: Request, res: Response): Promise<void> => {
  const s3Key = req.params[0];
  if (!s3Key) { res.status(400).end(); return; }
  try {
    const command = new GetObjectCommand({ Bucket: damBaseConfig.bucket, Key: s3Key });
    const response = await s3ClientForProxy.send(command);
    if (response.Body) {
      res.setHeader('Content-Type', response.ContentType || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      (response.Body as Readable).pipe(res);
    } else {
      res.status(404).end();
    }
  } catch (error: any) {
    if (error.name === 'NoSuchKey') {
      const parsed = parseThumbnailKey(s3Key);
      if (parsed) {
        try {
          const originalKey = await findOriginalS3Key(parsed.basePath);
          if (originalKey) {
            const mimeType = MIME_BY_EXT[originalKey.split('.').pop() ?? ''] ?? 'application/octet-stream';
            const downloadCmd = new GetObjectCommand({ Bucket: damBaseConfig.bucket, Key: originalKey });
            const original = await s3ClientForProxy.send(downloadCmd);
            if (original.Body) {
              const chunks: Uint8Array[] = [];
              for await (const chunk of original.Body as any) {
                chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
              }
              const buffer = Buffer.concat(chunks);
              const thumbBuffer = await ThumbnailGenerator.generateThumbnail(buffer, parsed.preset);
              await s3ClientForProxy.send(new PutObjectCommand({
                Bucket: damBaseConfig.bucket,
                Key: s3Key,
                Body: thumbBuffer,
                ContentType: 'image/webp',
              }));
              res.setHeader('Content-Type', 'image/webp');
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
              res.end(thumbBuffer);
              return;
            }
          }
        } catch { }
      }
      res.status(404).json({ error: 'Asset not found' });
      return;
    }
    console.error('DAM proxy error:', error);
    res.status(500).json({ error: error.message || 'Failed to serve asset' });
  }
});

app.listen(port, () => {
  console.log(`🚀 DAM Asset Processor Microservice listening on port ${port}`);
});
