import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { timingSafeEqual } from 'node:crypto';
import cookieParser from 'cookie-parser';
import { Readable } from 'node:stream';
import { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
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
  normalizeUploadLimits,
  contentMatchesExtension,
  isWoff2,
  SNIFF_BYTES,
  storedFileName,
  isPrivateFolder,
  formUploadStagingKey,
  FORM_UPLOAD_PUT_PATH,
} from '@whoobe-cms/core';
import {
  requireAuth,
  requirePermission,
  PERMISSIONS,
  listFolders,
  createFolderRecord,
  repairMissingFolders,
  deleteFolderRecord,
  listAssets,
  countAssets,
  getAssetByPath,
  getAssetById,
  upsertAssetRecord,
  deleteAssetRecord,
  moveAssetRecord,
  type AssetWriteOptions,
  type EventActor,
  updateAssetMetadata,
  updateAssetCdnMirror,
  resolveCdnMirror,
  cdnMirrorConfigured,
  missingCdnFields,
  mirrorToCloudflareImages,
  mirrorViaOriginCdn,
  cloudflareRefusal,
  CdnMirrorError,
  safeFetch,
  type MirrorResult,
  loadRootEnv,
  isLoggingEnabled,
  corsPolicy,
  securityHeaders,
  sanitizeServerErrors,
  validateSessionToken,
  SESSION_COOKIE_NAME,
  getAssetVisibilityByKey,
  createSelfHealingClient,
  createFixedWindowLimiter,
  verifyUploadTicket,
  uploadTokenSecret,
  sanitizeUploadedFile,
  UploadContentError,
  getFormUpload,
  markFormUploadStaged,
  markFormUploadRejected,
  markFormUploadAttached,
  expireStaleFormUploads,
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

// S3 credentials & bucket config live ONLY on this server (env vars),
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

/** Who did it, for the asset events (docs/plans/system/more-events-plan.md): the signed-in person, else the system (a service call; `id` names which). */
function assetEventActor(req: Request, systemId?: string): EventActor {
  const id = (req as unknown as { user?: { id?: unknown } }).user?.id;
  return id ? { type: 'user', id: String(id) } : { type: 'system', ...(systemId ? { id: systemId } : {}) };
}

// Shared by /upload and /transform: writes the object to S3 (with
// thumbnails) and upserts the Postgres record, returning the same response
// shape both endpoints send back to the browser. The record write also
// stores asset.created / asset.updated for the subscriptions that want it.
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
  origin: string,
  events: AssetWriteOptions = {}
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
  }, events);

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

const jsonBody = express.json({ limit: isSandbox() ? '1mb' : '50mb' });
// The bytes of a form upload are read from the raw stream by their own route (with their own cap), never parsed as JSON
app.use((req: Request, res: Response, next: NextFunction): void => (req.path.startsWith(`${FORM_UPLOAD_PUT_PATH}/`) ? next() : jsonBody(req, res, next)));
app.use(cookieParser());
// Credentialed CORS only for an allowlist (WHOOBE_HOSTNAME, CORS_ALLOWED_HOSTS, CORS_ALLOWED_ORIGINS;
// localhost too outside production). Asset delivery routes answer any origin without credentials.
app.disable('x-powered-by');
app.use(securityHeaders());
app.use(corsPolicy({ publicPathPrefixes: ['/dam-asset/', '/health', '/public/'], methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }));
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

function serviceTokenOr(permission: (typeof PERMISSIONS)[keyof typeof PERMISSIONS]) {
  return (req: Request, res: Response, next: any): void => {
    const token = process.env.DAM_SERVICE_TOKEN;
    if (token) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === 'string' && safeEqual(authHeader, `Bearer ${token}`)) {
        next();
        return;
      }
    }
    requirePermission(permission)(req, res, next);
  };
}
// (declarations, not constants: routes registered earlier in the file use them)
function serviceTokenAuth(req: Request, res: Response, next: any): void { serviceTokenOr(PERMISSIONS.ASSETS_UPLOAD)(req, res, next); }
// core-api deletes the files of a person it erases (data subject request, retention) with the service token
function serviceTokenOrDelete(req: Request, res: Response, next: any): void { serviceTokenOr(PERMISSIONS.ASSETS_DELETE)(req, res, next); }

// Upload an asset to S3. Credentials never leave this process.
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

    // A web font is stored with its own type whatever the browser said, and only if it is one (an upload named .woff2 that
    // is something else would be served to every page that links it)
    const isFont = getFileTypeFromFilename(req.file.originalname).fileType === 'WOFF2';
    if (isFont && !isWoff2(req.file.buffer.subarray(0, SNIFF_BYTES))) {
      res.status(415).json({ error: 'The file is not a woff2 font' });
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

    const { fileType, mimeType: typeByName } = getFileTypeFromFilename(req.file.originalname);
    const response = await finalizeAssetUpload(provider, {
      pimcorePath,
      buffer: req.file.buffer,
      mimeType: isFont ? typeByName : req.file.mimetype || 'application/octet-stream',
      isPublic,
      filename: req.file.originalname,
      folderPath: deriveFolderPath(pimcorePath),
      fileType,
      metadata,
    }, forwardOrigin(req), {
      actor: assetEventActor(req),
      // a service call (the log files core-api uploads) is not an event worth sending; a person's upload is
      silent: !(req as unknown as { user?: unknown }).user,
    });

    res.json(response);
  } catch (error: any) {
    logger.error({ err: error }, 'DAM upload error');
    if (isPixelLimitError(error)) { res.status(413).json({ error: 'Image dimensions exceed the allowed maximum' }); return; }
    res.status(500).json({ error: error.message || 'Asset upload failed' });
  }
});


// --- File upload in forms (docs/plans/forms/form-upload-plan.md) ---
// The bytes of ONE file, sent by a visitor's browser with the ticket core-api's /public/uploads/intent issued. The ticket says which
// upload row this is, the extension that was approved and the largest body allowed; nothing else the request says is trusted.
// The body is read with a hard cap (cut as soon as it is exceeded), the first bytes must be those of the approved type, pictures are
// decoded and written again, and only then is the file put in a private staging key. It becomes a library asset when the form that
// refers to it is submitted (POST /api/v1/dam/form-uploads/attach, called by core-api), or is deleted by the cleanup below.
const uploadPutLimiter = createFixedWindowLimiter({ max: Number(process.env.UPLOAD_PUT_RATE_LIMIT_PER_MINUTE) > 0 ? Number(process.env.UPLOAD_PUT_RATE_LIMIT_PER_MINUTE) : 30, windowMs: 60_000 });

class UploadRefusal extends Error {
  constructor(message: string, readonly status: number, readonly reason: string) { super(message); }
}

function refuseUpload(req: Request, res: Response, status: number, message: string): void {
  // the rest of the body is not wanted: answer, then drop the connection
  res.setHeader('Connection', 'close');
  res.once('finish', () => req.destroy());
  res.status(status).json({ error: message });
}

app.put(`${FORM_UPLOAD_PUT_PATH}/:token`, async (req: Request, res: Response): Promise<void> => {
  const secret = uploadTokenSecret();
  if (!secret) { res.status(503).json({ error: 'File upload is not configured on this server' }); return; }
  if (uploadPutLimiter.hit(req.ip ?? 'unknown')) { refuseUpload(req, res, 429, 'Too many uploads, please try again later'); return; }
  const ticket = verifyUploadTicket(req.params.token, secret);
  if (!ticket) { refuseUpload(req, res, 401, 'This upload link is not valid or has expired'); return; }
  let rowId = ticket.u;
  try {
    const row = await getFormUpload(ticket.u);
    if (!row || row.websiteId !== ticket.w || row.formRef !== ticket.f || row.extension !== ticket.x) { refuseUpload(req, res, 404, 'Upload not found'); return; }
    if (row.status !== 'pending') { refuseUpload(req, res, 409, 'This upload link was already used'); return; }
    // never more than the ticket allows, nor more than was declared when the file was approved
    const limit = Math.min(ticket.m, row.declaredSize);
    const declared = Number(req.headers['content-length']);
    try {
      if (Number.isFinite(declared) && declared > limit) throw new UploadRefusal('The file is larger than allowed', 413, 'too-large');
      const chunks: Buffer[] = [];
      let total = 0;
      let headChecked = false;
      const checkHead = (): void => {
        const head = Buffer.concat(chunks).subarray(0, SNIFF_BYTES);
        if (!contentMatchesExtension(ticket.x, head)) throw new UploadRefusal(`The file is not a valid .${ticket.x} file`, 415, 'content-mismatch');
        headChecked = true;
      };
      for await (const chunk of req) {
        total += (chunk as Buffer).length;
        if (total > limit) throw new UploadRefusal('The file is larger than allowed', 413, 'too-large');
        chunks.push(chunk as Buffer);
        if (!headChecked && total >= SNIFF_BYTES) checkHead();
      }
      if (total === 0) throw new UploadRefusal('The file is empty', 400, 'empty');
      if (!headChecked) checkHead();
      let body: Buffer;
      try {
        body = await sanitizeUploadedFile(Buffer.concat(chunks), ticket.x);
      } catch (err) {
        if (err instanceof UploadContentError) throw new UploadRefusal(err.message, 415, 'content-invalid');
        throw err;
      }
      const key = formUploadStagingKey(ticket.w, ticket.u, ticket.x);
      await s3ClientForProxy.send(new PutObjectCommand({ Bucket: damBaseConfig.bucket, Key: key, Body: body, ContentType: 'application/octet-stream' }));
      if (!(await markFormUploadStaged(ticket.u, { s3Key: key, size: body.length }))) {
        await s3ClientForProxy.send(new DeleteObjectCommand({ Bucket: damBaseConfig.bucket, Key: key })).catch(() => {});
        throw new UploadRefusal('This upload link was already used', 409, 'used');
      }
      res.status(201).json({ uploadId: ticket.u, size: body.length });
    } catch (err) {
      if (err instanceof UploadRefusal) {
        if (err.reason !== 'used') await markFormUploadRejected(rowId, err.reason).catch(() => {});
        logger.warn({ uploadId: ticket.u, websiteId: ticket.w, reason: err.reason }, 'Form upload refused');
        refuseUpload(req, res, err.status, err.message);
        return;
      }
      throw err;
    }
  } catch (error: any) {
    logger.error({ err: error }, 'Form upload error');
    if (!res.headersSent) res.status(500).json({ error: 'The upload failed' });
  }
});

// Called by core-api when a submitted form refers to a staged upload (service token): the file becomes an asset of the library under a
// generated name, in the folder core-api resolved from the website's and the field's settings (checked again here: private unless a
// public folder is explicitly allowed), and the staging copy is removed.
app.post('/api/v1/dam/form-uploads/attach', serviceTokenAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { uploadId, websiteId, formRef, targetFolder, allowPublicFolder } = req.body ?? {};
    if (![uploadId, websiteId, formRef, targetFolder].every((v) => typeof v === 'string' && v)) { res.status(400).json({ error: 'uploadId, websiteId, formRef and targetFolder are required' }); return; }
    const row = await getFormUpload(uploadId);
    if (!row || row.status !== 'staged' || row.websiteId !== websiteId || row.formRef !== formRef || !row.s3Key) { res.status(409).json({ error: 'The upload is not available' }); return; }
    const limits = normalizeUploadLimits({ enabled: true, allowedExtensions: [row.extension], targetFolder, allowPublicFolder: allowPublicFolder === true });
    if (limits.allowedExtensions.length === 0 || limits.targetFolder !== String(targetFolder).replace(/^\/+|\/+$/g, '')) { res.status(400).json({ error: 'The target folder or the file type is not acceptable' }); return; }
    const object = await s3ClientForProxy.send(new GetObjectCommand({ Bucket: damBaseConfig.bucket, Key: row.s3Key }));
    const buffer = Buffer.from(await (object.Body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray());
    if (!contentMatchesExtension(row.extension, buffer.subarray(0, SNIFF_BYTES))) { res.status(415).json({ error: 'The file does not match its type' }); return; }

    const filename = storedFileName(row.id, row.extension);
    const pimcorePath = `/${limits.targetFolder}/${filename}`;
    if (await assetQuotaExceeded(pimcorePath)) { res.status(409).json({ error: `Asset limit reached (${assetMaxCount()})` }); return; }
    const isPublic = !isPrivateFolder(limits.targetFolder);
    const { fileType, mimeType } = getFileTypeFromFilename(filename);
    const provider = createDamProvider([]);
    const response = await finalizeAssetUpload(provider, {
      pimcorePath, buffer, mimeType, isPublic, filename, folderPath: deriveFolderPath(pimcorePath), fileType,
      metadata: { formUpload: { uploadId: row.id, originalName: row.originalName, websiteId: row.websiteId, formRef: row.formRef } },
    }, forwardOrigin(req), { actor: assetEventActor(req, 'form-upload') });

    if (!(await markFormUploadAttached(row.id, { websiteId, formRef, s3Key: response.s3Key, assetId: response.asset.id }))) {
      // lost a race with another submission: take the copy back
      await deleteAssetRecord(pimcorePath, { actor: assetEventActor(req, 'form-upload') }).catch(() => {});
      await s3ClientForProxy.send(new DeleteObjectCommand({ Bucket: damBaseConfig.bucket, Key: response.s3Key })).catch(() => {});
      res.status(409).json({ error: 'The upload was already used' });
      return;
    }
    await s3ClientForProxy.send(new DeleteObjectCommand({ Bucket: damBaseConfig.bucket, Key: row.s3Key })).catch(() => {});
    res.json({ asset: { id: response.asset.id, pimcorePath, filename, sizeBytes: buffer.length, isPublic } });
  } catch (error: any) {
    logger.error({ err: error }, 'Form upload attach error');
    res.status(500).json({ error: 'Failed to store the upload' });
  }
});

// Uploads that were approved but never attached to a submitted form (the visitor left, or the form was never sent): the staged copy
// is deleted and the row marked expired. Every 30 minutes; anything older than 2 hours.
const STALE_UPLOAD_MS = 2 * 60 * 60 * 1000;
async function cleanStaleFormUploads(): Promise<void> {
  try {
    for (const row of await expireStaleFormUploads(STALE_UPLOAD_MS)) {
      if (row.s3Key) await s3ClientForProxy.send(new DeleteObjectCommand({ Bucket: damBaseConfig.bucket, Key: row.s3Key })).catch(() => {});
    }
  } catch (err) {
    logger.warn({ err }, 'Form upload cleanup failed');
  }
}
setInterval(cleanStaleFormUploads, 30 * 60 * 1000).unref();
void cleanStaleFormUploads();

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
    }, forwardOrigin(req), { actor: assetEventActor(req) });

    res.json(response);
  } catch (error: any) {
    logger.error({ err: error }, 'DAM transform error');
    if (isPixelLimitError(error)) { res.status(413).json({ error: 'Image dimensions exceed the allowed maximum' }); return; }
    res.status(500).json({ error: error.message || 'Image transform failed' });
  }
});

// Delete an asset (and its thumbnail variants) from S3, plus its DB record.
app.delete('/api/v1/dam/asset', serviceTokenOrDelete, async (req: Request, res: Response): Promise<void> => {
  try {
    const pimcorePath = req.body?.pimcorePath as string | undefined;
    if (!pimcorePath) {
      res.status(400).json({ error: 'Missing pimcorePath' });
      return;
    }
    const provider = createDamProvider(parseFolderRules(req.body?.folderRules));
    await provider.deleteAsset(pimcorePath);
    await deleteAssetRecord(pimcorePath, { actor: assetEventActor(req, 'service') });
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

    // one record write with ONE asset.moved event (with `from`), not a created and a deleted
    const assetRecord = await moveAssetRecord(pimcorePath, {
      pimcorePath: newPimcorePath,
      filename: existing.filename,
      folderPath: cleanTarget,
      sizeBytes: existing.sizeBytes,
      mimeType: existing.mimeType,
      fileType: existing.fileType,
      s3Key,
      isPublic: newIsPublic,
      metadata: existing.metadata,
    }, { actor: assetEventActor(req) });

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
    // folders of assets that were stored without one (older uploads, imports) are created now, so the tree shows them
    await repairMissingFolders().catch((err) => logger.warn({ err }, 'DAM folder repair failed'));
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
    const { deletedAssetPaths } = await deleteFolderRecord(path, { actor: assetEventActor(req) });

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

// CDN mirroring (docs/plans/assets/assets-cdn.md, docs/plans/assets/cdn-providers-plan.md): pushes an asset to an external image CDN so consumers that
// can't reach this install's own DAM (a local/VPN-only deployment, an ESP building an email campaign) get a stable, public URL instead of a local-only
// one or an embedded base64 copy. The provider comes from the settings of the website asked for (its own, else the installation's default):
//   cloudinary         - through a Gateway route (a JSON body: the file as a public URL or a data: URI, plus the unsigned preset)
//   cdn-origin         - a CDN that fetches public files from this installation (a pull CDN): nothing is uploaded, the CDN URL is built and checked
//   cloudflare-images  - straight to Cloudflare with the stored API token, as multipart/form-data with the bytes (the Gateway's route executor sends a JSON body only)
// The body may still carry `gatewayRouteId` / `uploadPreset` / `provider`: that is the old call (scripts, older dashboards) and means Cloudinary with those values.
app.post('/api/v1/dam/assets/:id/mirror-cdn', requirePermission(PERMISSIONS.ASSETS_UPLOAD), async (req: Request, res: Response): Promise<void> => {
  try {
    const asset = await getAssetById(req.params.id);
    if (!asset) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }

    const body = (req.body ?? {}) as { websiteId?: unknown; gatewayRouteId?: unknown; uploadPreset?: unknown; provider?: unknown };
    let provider: string;
    let config: Record<string, string>;
    let secrets: Record<string, string> = {};
    if (typeof body.gatewayRouteId === 'string' && body.gatewayRouteId) {
      provider = 'cloudinary';
      config = { gatewayRouteId: body.gatewayRouteId, ...(typeof body.uploadPreset === 'string' && body.uploadPreset ? { uploadPreset: body.uploadPreset } : {}) };
    } else {
      const resolved = await resolveCdnMirror(typeof body.websiteId === 'string' && body.websiteId ? body.websiteId : null);
      if (!cdnMirrorConfigured(resolved)) {
        const missing = resolved.scope === 'none' ? 'nothing is set up' : `missing: ${missingCdnFields(resolved.provider, resolved.config, resolved.secretsSet).join(', ')}`;
        res.status(400).json({ error: `CDN mirroring is not set up for this website (${missing}). Configure it under Settings > DAM > CDN Mirroring or in the website's settings.` });
        return;
      }
      provider = resolved.provider;
      config = resolved.config;
      secrets = resolved.secrets;
    }

    let result: MirrorResult;
    let bytesSent = asset.sizeBytes;
    if (provider === 'cdn-origin') {
      // Nothing is uploaded: the CDN fetches the public file from this installation by itself. The URL is built and the CDN is asked once.
      result = await mirrorViaOriginCdn(config.baseUrl, { s3Key: asset.s3Key, version: asset.version, mimeType: asset.mimeType, isPublic: asset.isPublic }, {
        head: async (url) => {
          const r = await safeFetch(url, { method: 'HEAD' }, { maxBytes: 64 * 1024, timeoutMs: 15_000 });
          return { status: r.status, contentType: r.headers.get('content-type') };
        },
      });
      bytesSent = 0;
    } else if (provider === 'cloudflare-images') {
      const refusal = cloudflareRefusal(asset.mimeType, asset.sizeBytes);
      if (refusal) { res.status(415).json({ error: refusal }); return; }
      const object = await s3ClientForProxy.send(new GetObjectCommand({ Bucket: damBaseConfig.bucket, Key: asset.s3Key }));
      if (!object.Body) { res.status(502).json({ error: 'Could not read asset bytes from storage' }); return; }
      const bytes = Buffer.from(await (object.Body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray());
      bytesSent = bytes.byteLength;
      result = await mirrorToCloudflareImages(
        { accountId: config.accountId, apiToken: secrets.apiToken, variant: config.variant, assetId: asset.id, filename: asset.filename, mimeType: asset.mimeType, bytes },
        {
          apiBase: config.apiBase || undefined,
          fetch: async (url, init) => {
            const r = await safeFetch(url, { method: init.method, headers: init.headers, body: init.body }, { maxBytes: 256 * 1024, timeoutMs: 60_000 });
            return { status: r.status, json: () => r.json() };
          },
        },
      );
    } else {
      // Cloudinary's upload API accepts `file` as a URL it fetches itself, or as a base64 data: URI - the same fork resolveMailImageUrls() vs
      // resolveMailImageDataUris() already makes for email, for the same reason: a public URL only works if the *destination* can reach it.
      // Deliberately NOT re-encoded/resized: a CDN mirror is the quality source of truth the CDN can transform on the fly for whoever needs it later.
      const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL;
      let file: string;
      if (publicBaseUrl && isPubliclyReachableUrl(publicBaseUrl)) {
        file = `${publicBaseUrl.replace(/\/+$/, '')}/${asset.s3Key}`;
      } else {
        const object = await s3ClientForProxy.send(new GetObjectCommand({ Bucket: damBaseConfig.bucket, Key: asset.s3Key }));
        if (!object.Body) { res.status(502).json({ error: 'Could not read asset bytes from storage' }); return; }
        const chunks: Uint8Array[] = [];
        for await (const chunk of object.Body as any) chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
        const rawBuffer = Buffer.concat(chunks);
        file = `data:${asset.mimeType};base64,${rawBuffer.toString('base64')}`;
        bytesSent = rawBuffer.byteLength;
      }
      const requestBody: Record<string, unknown> = { file };
      if (config.uploadPreset) requestBody.upload_preset = config.uploadPreset;

      // Server-to-server call to the Gateway's own generic route executor, forwarding this request's session cookie (this action only ever runs
      // synchronously inside an authenticated admin request) rather than a separate service token.
      const gatewayUrl = (process.env.GATEWAY_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
      const execRes = await fetch(`${gatewayUrl}/api/v1/gateway/routes/${config.gatewayRouteId}/execute`, {
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
      result = { url: uploadResult.secure_url, providerAssetId: uploadResult.public_id };
    }

    const updated = await updateAssetCdnMirror(asset.id, {
      provider,
      url: result.url,
      providerAssetId: result.providerAssetId,
      mirroredAt: new Date().toISOString(),
      bytesSent,
    });

    res.json({ asset: updated });
  } catch (error: any) {
    if (error instanceof CdnMirrorError) {
      logger.warn({ err: error.message, status: error.status }, 'CDN mirror refused');
      // a 5xx has its `error` text replaced in production (sanitizeServerErrors): the provider's own words travel in `detail`, as for Cloudinary
      if (error.status >= 500) res.status(error.status).json({ error: 'CDN mirror upload failed', detail: error.message });
      else res.status(error.status).json({ error: error.message, detail: error.detail });
      return;
    }
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
// DAM provider, so the proxy can serve authenticated requests to the S3 store.
// requestHandler timeouts: without them (the SDK's default is 0/disabled),
// a stalled-but-not-refused the S3 store connection hangs the awaiting request
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
// no pool left to go stale. the S3 store is local (sub-millisecond connect), so
// the per-request handshake cost is negligible.
// createSelfHealingClient: after a connection timeout the client is rebuilt and the call repeated once (the process used to
// stay broken until restarted; see packages/core/src/dam/self-healing-client.ts).
const s3ClientForProxy = createSelfHealingClient(() => new S3Client({
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
}), (err) => logger.warn({ err }, 'DAM asset proxy: S3 connection timed out, client rebuilt and the call repeated'));

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

// Proxy endpoint: serves files from S3 through this server so the
// browser never hits S3 directly (avoids CORS, presigned URL expiry,
// and cross-host issues). Uses a signed GetObjectCommand so the S3 store
// authenticated access works (the bucket is not publicly readable).
//
// Range support matters specifically for video/audio: a <video> element
// issues HTTP Range requests for seeking and progressive loading (often
// several in flight/cancelled-and-reissued in a row) - without it, every
// one of those gets the full file back at 200 instead of a 206 partial
// response, which browsers generally don't tolerate well for media and
// frequently react to by aborting and retrying, which multiplies how many
// connections to the S3 store a single video load can open.
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
