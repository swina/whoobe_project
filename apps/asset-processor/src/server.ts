import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { timingSafeEqual } from 'node:crypto';
import cookieParser from 'cookie-parser';
import { Readable } from 'node:stream';
import { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
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
  isSandbox,
  assetMaxFileBytes,
  assetMaxCount,
} from '@whoobe-cms/core';
import {
  requireAuth,
  requirePermission,
  PERMISSIONS,
  listFolders,
  createFolderRecord,
  deleteFolderRecord,
  listAssets,
  countAssets,
  getAssetByPath,
  getAssetById,
  upsertAssetRecord,
  deleteAssetRecord,
  updateAssetMetadata,
  updateAssetCdnMirror,
  loadRootEnv,
  isLoggingEnabled,
  corsPolicy,
  securityHeaders,
  sanitizeServerErrors,
  validateSessionToken,
  SESSION_COOKIE_NAME,
  getAssetVisibilityByKey,
} from '@whoobe-cms/core/server';
import { createLogger, attachLoggingToggle } from '@whoobe-cms/logger';

const logger = await createLogger('asset-processor', {
  file: true,
  damUpload: true,
});

// Load the repo-root .env (single source of truth for all apps, see
// docs/plans/environment/env-optimization.md) with ${VAR} expansion so
// bucket/endpoint/credentials have a persisted, discoverable place to live
// instead of one-off shell vars. Shell-exported vars win, which is how
// ./dev-cms.sh --hostname overrides WHOOBE_HOSTNAME-derived values.
loadRootEnv();

// Wired up after loadRootEnv() so the first poll's DB connection has its
// env vars (DB_HOST etc.) in place.
attachLoggingToggle(logger, isLoggingEnabled);

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
// Built-in rule: everything under /public (sub-folders included) is public. It has the lowest priority, so a
// rule sent by the client for the same or a more specific path wins.
const DEFAULT_FOLDER_RULES: FolderVisibilityRule[] = [{ pathPrefix: '/public/**', isPublic: true }];

function createDamProvider(folderRules: FolderVisibilityRule[]): S3AssetStorageProvider {
  return new S3AssetStorageProvider({
    ...damBaseConfig,
    visibilityManager: new FolderVisibilityManager([...DEFAULT_FOLDER_RULES, ...folderRules]),
  });
}

// A configured S3_PUBLIC_BASE_URL isn't necessarily reachable from OUTSIDE
// this install - a local/dev setup commonly points it at 'localhost' (or a
// bare Docker service name, or a private-network address), which only
// ever means "loopback of whoever's asking," never "this Whoobe server,"
// to an external caller like Cloudinary. Handing that URL to an ESP/CDN
// for it to fetch itself fails - not always cleanly (a connection refused/
// timeout on Cloudinary's own end can surface as a generic upstream 403 or
// 400 rather than an obvious DNS/network error). This is a best-effort
// heuristic (hostname shape only, no actual reachability probe), not a
// substitute for a genuinely public origin in production.
function isPubliclyReachableUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(hostname)) return false;
    if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false;
    // No dot at all (a bare Docker Compose service name like
    // 'asset-processor') is never a real, externally-resolvable domain.
    if (!hostname.includes('.')) return false;
    return true;
  } catch {
    return false;
  }
}

function forwardOrigin(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string) ?? req.protocol;
  const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host ?? 'localhost';
  return `${proto}://${host}`;
}

function proxyUrl(key: string, origin: string): string {
  return `${origin}/dam-asset/${key}`;
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
  },
  origin: string
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

  const k = result.s3Key;
  const thumbKey = provider.getThumbnailS3Key(input.pimcorePath, 'thumb');
  const mediumKey = provider.getThumbnailS3Key(input.pimcorePath, 'medium');
  const largeKey = provider.getThumbnailS3Key(input.pimcorePath, 'large');

  return {
    success: true,
    s3Key: k,
    url: proxyUrl(k, origin),
    thumbnailUrl: proxyUrl(thumbKey, origin),
    thumbnails: { thumb: proxyUrl(thumbKey, origin), medium: proxyUrl(mediumKey, origin), large: proxyUrl(largeKey, origin) },
    asset: { ...assetRecord, url: proxyUrl(k, origin), thumbnailUrl: proxyUrl(thumbKey, origin), thumbnails: { thumb: proxyUrl(thumbKey, origin), medium: proxyUrl(mediumKey, origin), large: proxyUrl(largeKey, origin) } },
  };
}

// Query-parameter bounds for the stateless image endpoints (a request must not be able to ask for a
// multi-gigapixel output).
const MAX_OUTPUT_DIMENSION = 8192;
const IMAGE_FORMATS: SupportedImageFormat[] = ['webp', 'avif', 'png', 'jpeg', 'jpg', 'gif'];

function parseImageFormat(v: unknown): SupportedImageFormat | null {
  if (v === undefined || v === '') return 'webp';
  return typeof v === 'string' && (IMAGE_FORMATS as string[]).includes(v) ? (v as SupportedImageFormat) : null;
}

/** undefined when absent, the integer when within [min, max], null when present but invalid. */
function boundedInt(v: unknown, min: number, max: number): number | undefined | null {
  if (v === undefined || v === '') return undefined;
  if (typeof v !== 'string' || !/^\d{1,6}$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
}

// Asset paths become S3 object keys: no `..` segments, no control characters, no NUL.
function isSafeAssetPath(p: string): boolean {
  // eslint-disable-next-line no-control-regex
  return p.length <= 1024 && !/[\u0000-\u001f]/.test(p) && !p.split(/[\\/]+/).includes('..');
}

// sharp refuses images over the pixel cap (ASSET_MAX_INPUT_PIXELS, see packages/core/src/dam/sharp-input.ts): that
// is the caller's problem (413), not a server fault.
function isPixelLimitError(error: unknown): boolean {
  return /pixel limit|exceeds .*pixel/i.test(String((error as { message?: string } | null)?.message ?? ''));
}

// Configure Multer in-memory storage for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: assetMaxFileBytes() }, // ASSET_MAX_FILE_BYTES, 50MB by default
});

// ASSET_MAX_COUNT: a new asset (not an overwrite of an existing path) is refused once the limit is reached.
async function assetQuotaExceeded(pimcorePath: string): Promise<boolean> {
  const max = assetMaxCount();
  if (max === null) return false;
  if (await getAssetByPath(pimcorePath)) return false;
  return (await countAssets()) >= max;
}

app.use(express.json({ limit: isSandbox() ? '1mb' : '50mb' }));
app.use(cookieParser());
// Credentialed CORS only for an allowlist (WHOOBE_HOSTNAME, CORS_ALLOWED_HOSTS, CORS_ALLOWED_ORIGINS;
// localhost too outside production). Asset delivery routes answer any origin without credentials.
app.disable('x-powered-by');
app.use(securityHeaders());
app.use(corsPolicy({ publicPathPrefixes: ['/dam-asset/', '/health', '/public/'], methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] }));
app.use(sanitizeServerErrors());
app.use('/api/v1/dam', (req: Request, res: Response, next: NextFunction): void => {
  for (const source of [req.query, req.body]) {
    for (const [k, v] of Object.entries((source ?? {}) as Record<string, unknown>)) {
      if (/path/i.test(k) && typeof v === 'string' && !isSafeAssetPath(v)) {
        res.status(400).json({ error: `Invalid ${k}` });
        return;
      }
    }
  }
  next();
});

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
app.post('/api/v1/process', serviceTokenAuth, upload.single('file'), async (req: Request, res: Response): Promise<void> => {
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
    const format = parseImageFormat(req.query.format);
    if (!format) {
      res.status(400).json({ error: `format must be one of ${IMAGE_FORMATS.join(', ')}` });
      return;
    }

    if (mode === 'variants') {
      const variants = await ImageProcessingPipeline.generateVariants(inputBuffer, format);

      const responseVariants: Record<string, string> = {};
      for (const [key, buf] of Object.entries(variants)) {
        responseVariants[key] = `data:image/${format};base64,${buf.toString('base64')}`;
      }

      res.json({ success: true, variants: responseVariants });
      return;
    }

    // Default transform
    const width = boundedInt(req.query.width, 1, MAX_OUTPUT_DIMENSION);
    const height = boundedInt(req.query.height, 1, MAX_OUTPUT_DIMENSION);
    const qualityParam = boundedInt(req.query.quality, 1, 100);
    const quality = qualityParam === undefined ? 80 : qualityParam;
    if (width === null || height === null || quality === null) {
      res.status(400).json({ error: `width/height must be 1-${MAX_OUTPUT_DIMENSION}, quality 1-100` });
      return;
    }

    const processedBuffer = await ImageProcessingPipeline.transform(inputBuffer, {
      resize: width || height ? { width, height, fit: 'inside' } : undefined,
      format,
      quality,
    });

    res.type(`image/${format}`).send(processedBuffer);
  } catch (error: any) {
    logger.error({ err: error }, 'Processing error');
    if (isPixelLimitError(error)) { res.status(413).json({ error: 'Image dimensions exceed the allowed maximum' }); return; }
    res.status(500).json({ error: error.message || 'Image processing failed' });
  }
});

// Metadata Extraction Endpoint (EXIF, IPTC, GPS, Camera info)
app.post('/api/v1/metadata', serviceTokenAuth, upload.single('file'), async (req: Request, res: Response): Promise<void> => {
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
    logger.error({ err: error }, 'Metadata extraction error');
    if (isPixelLimitError(error)) { res.status(413).json({ error: 'Image dimensions exceed the allowed maximum' }); return; }
    res.status(500).json({ error: error.message || 'Metadata extraction failed' });
  }
});

// Watermark Endpoint
app.post(
  '/api/v1/watermark',
  serviceTokenAuth,
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
      const opacityRaw = req.query.opacity ? parseFloat(req.query.opacity as string) : 0.8;
      const format = parseImageFormat(req.query.format);
      if (!format || !Number.isFinite(opacityRaw) || opacityRaw < 0 || opacityRaw > 1) {
        res.status(400).json({ error: `format must be one of ${IMAGE_FORMATS.join(', ')}; opacity 0-1` });
        return;
      }
      const opacity = opacityRaw;

      const processedBuffer = await ImageProcessingPipeline.transform(inputBuffer, {
        format,
        watermark: {
          watermarkBuffer,
          opacity,
        },
      });

      res.type(`image/${format}`).send(processedBuffer);
    } catch (error: any) {
      logger.error({ err: error }, 'Watermark error');
      if (isPixelLimitError(error)) { res.status(413).json({ error: 'Image dimensions exceed the allowed maximum' }); return; }
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

// Service-to-service auth for log uploads: if the DAM_SERVICE_TOKEN env var
// is set and the request carries a matching Bearer token, skip session auth
// (server-to-server, no browser session). If the token is absent or wrong,
// fall through to requirePermission (backward-compatible with browser users).
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function serviceTokenAuth(req: Request, res: Response, next: any): void {
  const token = process.env.DAM_SERVICE_TOKEN;
  if (token) {
    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && safeEqual(authHeader, `Bearer ${token}`)) {
      next();
      return;
    }
  }
  requirePermission(PERMISSIONS.ASSETS_UPLOAD)(req, res, next);
}

// Upload an asset to S3/MinIO. Credentials never leave this process.
app.post('/api/v1/dam/upload', serviceTokenAuth, upload.single('file'), async (req: Request, res: Response): Promise<void> => {
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
    // multipart fields are only parsed after the generic /api/v1/dam guard, so check here too
    if (typeof pimcorePath !== 'string' || !isSafeAssetPath(pimcorePath) || !isSafeAssetPath(req.file.originalname)) {
      res.status(400).json({ error: 'Invalid pimcorePath or file name' });
      return;
    }
    if (req.file.size === 0) {
      res.status(400).json({ error: 'Empty file' });
      return;
    }

    if (await assetQuotaExceeded(pimcorePath)) {
      res.status(409).json({ error: `Asset limit reached (${assetMaxCount()})` });
      return;
    }

    const provider = createDamProvider(parseFolderRules(req.body?.folderRules));
    // an explicit flag from the client wins; without one the folder rules decide (/public/** is built in)
    const flag = req.body?.isPublic;
    const isPublic = flag === 'true' ? true : flag === 'false' ? false : provider.visibilityManager.isPathPublic(pimcorePath);

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
    }, forwardOrigin(req));

    res.json(response);
  } catch (error: any) {
    logger.error({ err: error }, 'DAM upload error');
    if (isPixelLimitError(error)) { res.status(413).json({ error: 'Image dimensions exceed the allowed maximum' }); return; }
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

    if (await assetQuotaExceeded(targetPath)) {
      res.status(409).json({ error: `Asset limit reached (${assetMaxCount()})` });
      return;
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
    }, forwardOrigin(req));

    res.json(response);
  } catch (error: any) {
    logger.error({ err: error }, 'DAM transform error');
    if (isPixelLimitError(error)) { res.status(413).json({ error: 'Image dimensions exceed the allowed maximum' }); return; }
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
    logger.error({ err: error }, 'DAM delete error');
    res.status(500).json({ error: error.message || 'Asset delete failed' });
  }
});

// Moves an asset to a different folder: server-side S3 copy + delete (no
// bytes round-trip through this process), then replaces the Postgres row -
// pimcorePath is unique, so a move is a new row at the destination path
// plus deletion of the row at the old one, not an in-place update.
app.post('/api/v1/dam/assets/move', requirePermission(PERMISSIONS.ASSETS_UPLOAD), async (req: Request, res: Response): Promise<void> => {
  try {
    const pimcorePath = req.body?.pimcorePath as string | undefined;
    const targetFolderPath = req.body?.targetFolderPath as string | undefined;
    if (!pimcorePath || !targetFolderPath) {
      res.status(400).json({ error: 'Missing pimcorePath or targetFolderPath' });
      return;
    }

    const existing = await getAssetByPath(pimcorePath);
    if (!existing) {
      res.status(404).json({ error: `Asset not found: ${pimcorePath}` });
      return;
    }

    const cleanTarget = targetFolderPath === '/' ? '/' : targetFolderPath.replace(/\/+$/, '');
    const newPimcorePath = cleanTarget === '/' ? `/${existing.filename}` : `${cleanTarget}/${existing.filename}`;

    if (newPimcorePath === pimcorePath) {
      res.status(400).json({ error: 'Asset is already in that folder' });
      return;
    }
    if (await getAssetByPath(newPimcorePath)) {
      res.status(409).json({ error: `An asset named "${existing.filename}" already exists in ${cleanTarget}` });
      return;
    }

    const provider = createDamProvider(parseFolderRules(req.body?.folderRules));
    const newIsPublic = provider.visibilityManager.isPathPublic(newPimcorePath);
    const { s3Key } = await provider.moveAsset(pimcorePath, newPimcorePath, newIsPublic);

    const assetRecord = await upsertAssetRecord({
      pimcorePath: newPimcorePath,
      filename: existing.filename,
      folderPath: cleanTarget,
      sizeBytes: existing.sizeBytes,
      mimeType: existing.mimeType,
      fileType: existing.fileType,
      s3Key,
      isPublic: newIsPublic,
      metadata: existing.metadata,
    });
    await deleteAssetRecord(pimcorePath);

    const origin = forwardOrigin(req);
    const thumbKey = provider.getThumbnailS3Key(newPimcorePath, 'thumb');
    const mediumKey = provider.getThumbnailS3Key(newPimcorePath, 'medium');
    const largeKey = provider.getThumbnailS3Key(newPimcorePath, 'large');
    const thumbnails = { thumb: proxyUrl(thumbKey, origin), medium: proxyUrl(mediumKey, origin), large: proxyUrl(largeKey, origin) };

    res.json({
      success: true,
      asset: { ...assetRecord, url: proxyUrl(s3Key, origin), thumbnailUrl: proxyUrl(thumbKey, origin), thumbnails },
    });
  } catch (error: any) {
    logger.error({ err: error }, 'DAM move error');
    res.status(500).json({ error: error.message || 'Asset move failed' });
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
    logger.error({ err: error }, 'DAM list folders error');
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
    logger.error({ err: error }, 'DAM create folder error');
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
        logger.warn({ err: e }, `Could not delete S3 object for ${assetPath}`);
      }
    }

    res.json({ success: true, deletedAssetCount: deletedAssetPaths.length });
  } catch (error: any) {
    logger.error({ err: error }, 'DAM delete folder error');
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
    const origin = forwardOrigin(req);

    const withUrls = records.map((record) => {
      const k = provider.getS3Key(record.pimcorePath);
      const t = provider.getThumbnailS3Key(record.pimcorePath, 'thumb');
      const m = provider.getThumbnailS3Key(record.pimcorePath, 'medium');
      const l = provider.getThumbnailS3Key(record.pimcorePath, 'large');
      return { ...record, url: proxyUrl(k, origin), thumbnailUrl: proxyUrl(t, origin), thumbnails: { thumb: proxyUrl(t, origin), medium: proxyUrl(m, origin), large: proxyUrl(l, origin) } };
    });

    res.json({ assets: withUrls });
  } catch (error: any) {
    logger.error({ err: error }, 'DAM list assets error');
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
    const origin = forwardOrigin(req);

    const withUrls = records.map((record) => {
      const k = provider.getS3Key(record.pimcorePath);
      const t = provider.getThumbnailS3Key(record.pimcorePath, 'thumb');
      const m = provider.getThumbnailS3Key(record.pimcorePath, 'medium');
      const l = provider.getThumbnailS3Key(record.pimcorePath, 'large');
      return { ...record, url: proxyUrl(k, origin), thumbnailUrl: proxyUrl(t, origin), thumbnails: { thumb: proxyUrl(t, origin), medium: proxyUrl(m, origin), large: proxyUrl(l, origin) } };
    });

    res.json({ assets: withUrls });
  } catch (error: any) {
    logger.error({ err: error }, 'DAM list assets error');
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
    const origin = forwardOrigin(req);
    const k = provider.getS3Key(record.pimcorePath);
    const t = provider.getThumbnailS3Key(record.pimcorePath, 'thumb');
    const m = provider.getThumbnailS3Key(record.pimcorePath, 'medium');
    const l = provider.getThumbnailS3Key(record.pimcorePath, 'large');
    res.json({ asset: { ...record, url: proxyUrl(k, origin), thumbnailUrl: proxyUrl(t, origin), thumbnails: { thumb: proxyUrl(t, origin), medium: proxyUrl(m, origin), large: proxyUrl(l, origin) } } });
  } catch (error: any) {
    logger.error({ err: error }, 'DAM get asset by id error');
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
    logger.error({ err: error }, 'DAM update metadata error');
    res.status(500).json({ error: error.message || 'Failed to update metadata' });
  }
});

// CDN mirroring (docs/plans/assets/assets-cdn.md, Phase 1): pushes an
// asset to an external image CDN (Cloudinary first, others via the same
// Gateway preset mechanism) so consumers that can't reach this install's
// own DAM (a local/VPN-only deployment, an ESP building an email campaign)
// get a stable, public URL instead of a local-only one or an embedded
// base64 copy. This endpoint only orchestrates: it builds the upload
// payload and hands it to the already-generic, already-authenticated
// Gateway route executor - no Cloudinary-specific request/response
// handling belongs here beyond reading back `secure_url`/`public_id`,
// which are Cloudinary's own field names (a second provider added later
// may need a small per-provider mapping here, but never new Gateway code).
app.post('/api/v1/dam/assets/:id/mirror-cdn', requirePermission(PERMISSIONS.ASSETS_UPLOAD), async (req: Request, res: Response): Promise<void> => {
  try {
    const asset = await getAssetById(req.params.id);
    if (!asset) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }

    const { gatewayRouteId, uploadPreset, provider } = req.body as {
      gatewayRouteId?: string;
      uploadPreset?: string;
      provider?: string;
    };
    if (!gatewayRouteId) {
      res.status(400).json({ error: 'gatewayRouteId is required' });
      return;
    }

    // Cloudinary's upload API accepts `file` as a URL it fetches itself, or
    // as a base64 data: URI - the same fork resolveMailImageUrls() vs
    // resolveMailImageDataUris() already makes for email, for the same
    // reason: a public URL only works if the *destination* (here,
    // Cloudinary's servers) can actually reach it.
    //
    // Deliberately NOT re-encoded/resized either way, unlike the email
    // base64 path (reencodeImage() with its email-tuned caps - see
    // mail-image-urls.ts): a CDN mirror's whole point is to be the
    // quality source of truth Cloudinary itself can transform on the fly
    // for whoever needs it later - shrinking it before it even arrives
    // would defeat that, and would mean re-mirroring the same asset with
    // different caps for different consumers instead of one mirror
    // everyone shares (an email that ends up using the CDN URL - Phase 2 -
    // gets the real original, not a second, separately-capped copy).
    const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL;
    let file: string;
    let bytesSent: number;
    if (publicBaseUrl && isPubliclyReachableUrl(publicBaseUrl)) {
      file = `${publicBaseUrl.replace(/\/+$/, '')}/${asset.s3Key}`;
      bytesSent = asset.sizeBytes;
    } else {
      const command = new GetObjectCommand({ Bucket: damBaseConfig.bucket, Key: asset.s3Key });
      const object = await s3ClientForProxy.send(command);
      if (!object.Body) {
        res.status(502).json({ error: 'Could not read asset bytes from storage' });
        return;
      }
      const chunks: Uint8Array[] = [];
      for await (const chunk of object.Body as any) {
        chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
      }
      const rawBuffer = Buffer.concat(chunks);
      file = `data:${asset.mimeType};base64,${rawBuffer.toString('base64')}`;
      bytesSent = rawBuffer.byteLength;
    }

    const requestBody: Record<string, unknown> = { file };
    if (uploadPreset) requestBody.upload_preset = uploadPreset;

    // Server-to-server call to the Gateway's own generic route executor -
    // forwards this same request's session cookie (this action only ever
    // runs synchronously inside an authenticated admin request, so there's
    // always one to forward) rather than a separate service token, since
    // the Gateway endpoint being called is the ordinary, already-existing
    // POST /routes/:id/execute (requirePermission(GATEWAY_MANAGE)), not a
    // dedicated internal-only route.
    const gatewayUrl = (process.env.GATEWAY_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
    const execRes = await fetch(`${gatewayUrl}/api/v1/gateway/routes/${gatewayRouteId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: req.headers.cookie ?? '' },
      body: JSON.stringify({ requestBody }),
    });
    const execBody = (await execRes.json()) as { error?: boolean; upstreamStatus?: number; body?: unknown };
    if (!execRes.ok || execBody.error || (execBody.upstreamStatus ?? 0) < 200 || (execBody.upstreamStatus ?? 0) >= 300) {
      res.status(502).json({ error: 'CDN mirror upload failed', detail: execBody });
      return;
    }

    const uploadResult = execBody.body as { secure_url?: string; public_id?: string };
    if (!uploadResult?.secure_url) {
      res.status(502).json({ error: 'CDN provider did not return a URL', detail: uploadResult });
      return;
    }

    const updated = await updateAssetCdnMirror(asset.id, {
      provider: provider || 'cloudinary',
      url: uploadResult.secure_url,
      providerAssetId: uploadResult.public_id,
      mirroredAt: new Date().toISOString(),
      bytesSent,
    });

    res.json({ asset: updated });
  } catch (error: any) {
    logger.error({ err: error }, 'CDN mirror error');
    res.status(500).json({ error: error.message || 'CDN mirror failed' });
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
    logger.error({ err: error }, 'DAM asset-urls error');
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
    logger.error({ err: error }, 'DAM asset-urls error');
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
    logger.error({ err: error }, 'DAM exists error');
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
    logger.error({ err: error }, 'DAM exists error');
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
    logger.error({ err: error }, 'Regenerate thumbnails error');
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
    logger.error({ err: error }, 'DAM ensure-bucket error');
    res.status(500).json({ error: error.message || 'Failed to ensure bucket' });
  }
});

// S3 client for the proxy — created once with the same credentials as the
// DAM provider, so the proxy can serve authenticated requests to MinIO.
// requestHandler timeouts: without them (the SDK's default is 0/disabled),
// a stalled-but-not-refused MinIO connection hangs the awaiting request
// forever with no error, permanently occupying one of this shared client's
// pooled sockets - repeated often enough, the whole pool wedges and every
// subsequent /dam-asset/* request queues forever too, with nothing ever
// logged. socketTimeout is inactivity-based, so it won't kill a large video
// that's still actively streaming, only a genuinely stalled one.
// keepAlive: false - observed live (2026-09-21): this proxy's keep-alive
// connection pool can end up holding a socket the WSL2/Docker Desktop
// network layer has silently reset (no FIN/RST reaches Node), so it sits in
// the pool looking alive; the next request to reuse it hangs until
// connectionTimeout. Restarting the process "fixed" it only because that
// throws away the pool and its zombie sockets. Disabling keep-alive opens a
// fresh TCP connection per request instead of reusing pooled ones - there's
// no pool left to go stale. MinIO is local (sub-millisecond connect), so
// the per-request handshake cost is negligible.
const s3ClientForProxy = new S3Client({
  region: damBaseConfig.region,
  endpoint: damBaseConfig.endpoint,
  credentials: { accessKeyId: damBaseConfig.accessKeyId, secretAccessKey: damBaseConfig.secretAccessKey },
  forcePathStyle: damBaseConfig.forcePathStyle !== false,
  requestHandler: new NodeHttpHandler({
    connectionTimeout: 5_000,
    socketTimeout: 30_000,
    httpAgent: { keepAlive: false },
    httpsAgent: { keepAlive: false },
  }),
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
//
// Range support matters specifically for video/audio: a <video> element
// issues HTTP Range requests for seeking and progressive loading (often
// several in flight/cancelled-and-reissued in a row) - without it, every
// one of those gets the full file back at 200 instead of a 206 partial
// response, which browsers generally don't tolerate well for media and
// frequently react to by aborting and retrying, which multiplies how many
// connections to MinIO a single video load can open.
// Keys that must never be served anonymously: the system `private/` area (e.g. private/logs/...) and,
// unless DAM_ENFORCE_ASSET_VISIBILITY=false, every asset whose record is not public. Private assets then
// need a valid session (the admin's <img>/<video> requests carry the cookie). Public = the asset's folder matches
// a public rule (built in: /public/**, sub-folders included).
const ENFORCE_ASSET_VISIBILITY = process.env.DAM_ENFORCE_ASSET_VISIBILITY !== 'false';

async function mayServeDamKey(req: Request, res: Response, s3Key: string): Promise<boolean> {
  const logical = s3Key.replace(/^\.thumbnails\//, '');
  let needsSession = /^private(\/|$)/.test(logical);
  if (!needsSession && ENFORCE_ASSET_VISIBILITY) needsSession = (await getAssetVisibilityByKey(s3Key)) !== true;
  if (!needsSession) return true;
  res.locals.damPrivate = true; // never let a shared cache keep it
  // Server-to-server readers (core-api's system-log download) present the DAM service token.
  const serviceToken = process.env.DAM_SERVICE_TOKEN;
  const auth = req.headers.authorization;
  if (serviceToken && typeof auth === 'string' && safeEqual(auth, `Bearer ${serviceToken}`)) return true;
  return !!(await validateSessionToken(req.cookies?.[SESSION_COOKIE_NAME]));
}

// Stored content types that a browser would execute if opened from our origin.
const ACTIVE_CONTENT_TYPE = /^(text\/(html|xml|javascript)|application\/(xhtml\+xml|xml|(x-)?javascript|ecmascript|x-shockwave-flash|x-httpd[\w-]*)|[^;]*html)/i;

function hardenAssetResponse(res: Response, storedType: string | undefined): string {
  // Whatever was uploaded must never run script with this origin's privileges: sandbox without
  // allow-scripts neutralises SVG/HTML opened directly (images in <img> are unaffected).
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox");
  const type = storedType || 'application/octet-stream';
  if (ACTIVE_CONTENT_TYPE.test(type)) {
    res.setHeader('Content-Disposition', 'attachment');
    return 'application/octet-stream';
  }
  return type;
}

app.get('/dam-asset/*', async (req: Request, res: Response): Promise<void> => {
  const s3Key = req.params[0];
  if (!s3Key) { res.status(400).end(); return; }
  try {
    if (!(await mayServeDamKey(req, res, s3Key))) { res.status(404).end(); return; }
    const range = req.headers.range;
    const command = new GetObjectCommand({ Bucket: damBaseConfig.bucket, Key: s3Key, Range: range });
    const response = await s3ClientForProxy.send(command);
    if (response.Body) {
      res.setHeader('Content-Type', hardenAssetResponse(res, response.ContentType));
      res.setHeader('Cache-Control', res.locals.damPrivate ? 'private, no-store' : 'public, max-age=31536000, immutable');
      res.setHeader('Accept-Ranges', 'bytes');
      if (response.ContentLength != null) res.setHeader('Content-Length', String(response.ContentLength));
      if (range && response.ContentRange) {
        res.status(206);
        res.setHeader('Content-Range', response.ContentRange);
      }
      const bodyStream = response.Body as Readable;
      // A stream 'error' (e.g. the socketTimeout above firing mid-transfer)
      // is not forwarded to `res` by .pipe() - left unhandled, it's an
      // uncaught exception that would crash the whole asset-processor
      // process instead of just failing this one request. A client
      // aborting its own request (very normal for a <video> superseding an
      // in-flight Range request with a new one) also surfaces here as a
      // stream error, but isn't a real failure - `res` is already
      // destroyed/closed by the time that happens, so it's excluded from
      // the logged/reported error case.
      bodyStream.on('error', (err: any) => {
        if (res.destroyed || req.destroyed) return;
        logger.error({ err, s3Key }, 'DAM asset proxy stream error');
        if (!res.headersSent) res.status(502).end();
        else res.destroy();
      });
      bodyStream.pipe(res);
    } else {
      res.status(404).end();
    }
  } catch (error: any) {
    if (error.name === 'InvalidRange') {
      res.status(416).end();
      return;
    }
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
    logger.error({ err: error }, 'DAM proxy error');
    res.status(500).json({ error: error.message || 'Failed to serve asset' });
  }
});

// Malformed multipart bodies, oversize files and bad JSON are client errors, not 500s.
app.use((err: any, _req: Request, res: Response, next: NextFunction): void => {
  if (res.headersSent) { next(err); return; }
  if (err instanceof multer.MulterError) {
    res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: `Invalid upload (${err.code})` });
    return;
  }
  if (err?.type === 'entity.too.large') { res.status(413).json({ error: 'Payload too large' }); return; }
  if (err?.type === 'entity.parse.failed' || /Malformed part header|Unexpected end of form|Boundary not found|Unexpected end of multipart/i.test(String(err?.message))) {
    res.status(400).json({ error: 'Malformed request body' });
    return;
  }
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  logger.info(`DAM Asset Processor Microservice listening on port ${port}`);
});
