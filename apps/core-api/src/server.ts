import {
  randomBytes, randomUUID
} from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import { DocsConfigError, checkNavText, createContentReader, docsSearchIndex, renderDraft, describeDocsSite, docsConfigOf, findDocByRoute, loadDocsSite, renderDocPage } from './docs-site.js';
import { publishJobsRouter } from './publish-jobs.js';
import { createAudit } from './audit.js';
import { createHttpMetrics, memoAsync, metricsTokenOk } from './metrics.js';
import { AUDIT } from './audit-specs.js';
import { createAuthoredNotifyCache, createRecipientThrottle, isSingleEmail, notifyKey } from './form-notify.js';
import {
  findUserByEmail,
  findUserById,
  touchLastLogin,
  createSession,
  revokeSession,
  getEffectivePermissions,
  verifyPassword,
  requireAuth,
  requirePermission,
  requireAnyPermission,
  PERMISSIONS,
  bootstrapDatabase,
  listDocuments,
  getDocumentById,
  updateDocumentContent,
  listSnippets,
  createSnippet,
  deleteSnippet,
  normalizeAlpinePresets,
  readAlpinePresets,
  listWebsites,
  getWebsite,
  getWebsiteByDomain,
  getWebsiteByRootPath,
  createWebsite,
  updateWebsite,
  deleteWebsite,
  isLoggingEnabled,
  listWebsiteTemplates,
  getWebsiteTemplate,
  getDefaultWebsiteTemplate,
  createWebsiteTemplate,
  updateWebsiteTemplate,
  deleteWebsiteTemplate,
  getWebsiteTemplateForPath,
  listPublishedModulePages,
  getWhoobeOneSnippet,
  listWebsitePaths,
  getWebsitePath,
  createWebsitePath,
  updateWebsitePath,
  deleteWebsitePath,
  listWhoobeOneSnippets,
  createWhoobeOneSnippet,
  updateWhoobeOneSnippet,
  setWhoobeOneSnippetLocked,
  setWhoobeOneSnippetWizardBlock,
  setWhoobeOneSnippetThumbnail,
  findTemplatesUsingSnippet,
  listSnippetTemplateUsage,
  deleteWhoobeOneSnippet,
  listWhoobeOneTemplates,
  getWhoobeOneTemplate,
  createWhoobeOneTemplate,
  updateWhoobeOneTemplate,
  deleteWhoobeOneTemplate,
  listWhoobeOneKits,
  getWhoobeOneKit,
  createWhoobeOneKit,
  addTemplateToWhoobeOneKit,
  duplicateWhoobeOneKit,
  updateWhoobeOneKitMeta,
  updateWhoobeOneKitTemplate,
  removeTemplateFromWhoobeOneKit,
  deleteWhoobeOneKit,
  listWhoobePages,
  getWhoobePage,
  listWhoobePageTranslations,
  createWhoobePage,
  updateWhoobePage,
  setWhoobePageThumbnail,
  deleteWhoobePage,
  getPublishedWhoobePageBySlug,
  getPublishedWhoobePageBySlugAnyLocale,
  listPublishedWhoobePages,
  listStagedWhoobePages,
  deleteStagedWhoobePage,
  isDynamicSlug,
  matchPagePath,
  listContentVersions,
  getContentVersion,
  listDataClasses,
  getDataClass,
  createDataClass,
  updateDataClass,
  deleteDataClass,
  listDataComponents,
  getDataComponent,
  createDataComponent,
  updateDataComponent,
  deleteDataComponent,
  isDataComponentInUse,
  listDataObjects,
  getDataObject,
  listDataObjectTranslations,
  createDataObject,
  bulkImportDataObjects,
  deleteDataObjectsByClassId,
  countDataObjectsByClassId,
  updateDataObject,
  deleteDataObject,
  listPublishedDataObjects,
  getPublishedDataObject,
  getDataObjectsByIds,
  getPublishedDataObjectsByIds,
  queryDataObjects,
  queryPublishedDataObjects,
  getDataClassByName,
  createPreviewToken,
  getPreviewToken,
  listPreviewTokensForObject,
  revokePreviewToken,
  deletePreviewToken,
  incrementPreviewTokenViewCount,
  isPreviewTokenValid,
  getWorkflowDefinitionByClassId,
  upsertWorkflowDefinition,
  deleteWorkflowDefinition,
  isTransitionValid,
  getTransitionDefinition,
  logWorkflowTransition,
  listWorkflowTransitionsForObject,
  listMigrationSources,
  getMigrationSource,
  getMigrationSourceConnectionConfig,
  createMigrationSource,
  updateMigrationSource,
  deleteMigrationSource,
  getConnectionConfig,
  SESSION_COOKIE_NAME,
  generateTotpSecret,
  totpKeyUri,
  totpQrCodeDataUrl,
  verifyTotpToken,
  generateRecoveryCodes,
  hashRecoveryCodes,
  consumeRecoveryCode,
  setPendingTotpSecret,
  enableTotp,
  disableTotp,
  updateMfaRecoveryCodes,
  getSecuritySettings,
  CDN_PROVIDERS,
  safeFetch,
  validateCdnSettings,
  missingCdnFields,
  resolveCdnMirror,
  getOwnCdnMirror,
  saveCdnMirror,
  deleteCdnMirror,
  publicCdnMirror,
  cdnMirrorConfigured,
  testCloudflareImages,
  testOriginCdn,
  getSamplePublicAsset,
  findDataSubject,
  exportDataSubject,
  eraseDataSubject,
  normalizeIdentifier,
  purgeExpiredData,
  getOidcSettings,
  oidcConfigured,
  oidcPublicConfig,
  publicOidcSettings,
  parseOidcSettingsInput,
  updateOidcSettings,
  discoverOidc,
  buildAuthorizationUrl,
  exchangeCode,
  verifyIdToken,
  OidcProtocolError,
  resolveOidcUser,
  randomUrlToken,
  sha256Hex,
  oidcLandingUrl,
  OIDC_ERRORS,
  insertAuditSafe,
  pingDatabase,
  publishJobCounts,
  eventDeliveryCounts,
  parseSecuritySettingsInput,
  updateSecuritySettings,
  userMustUseMfaNow,
  checkPasswordPolicy,
  getMailSettingsFor,
  resolveMailSettings,
  upsertMailSettings,
  deleteMailSettings,
  publicMailSettings,
  mailProviders,
  mailEncryptionConfigured,
  MailEncryptionKeyMissingError,
  sendMail,
  sendMailFromTemplate,
  renderMailTemplate,
  renderStaticHtml,
  collectMailFonts,
  buildMailDocument,
  resolveMailImageUrls,
  resolveMailImageDataUris,
  htmlToPlainText,
  listMailLog,
  getMailLogEntry,
  deleteMailLogEntries,
  listMailTemplates,
  getMailTemplate,
  createMailTemplate,
  updateMailTemplate,
  deleteMailTemplate,
  getAiSettings,
  upsertAiSettings,
  getAiImageSettings,
  upsertAiImageSettings,
  getAiTranslateSettings,
  upsertAiTranslateSettings,
  getFigmaSettings,
  upsertFigmaSettings,
  listAiGenerated,
  createAiGenerated,
  generateAiJson,
  generateImage,
  AiImageGenerationError,
  saveAiImageToDam,
  buildSystemPrompt,
  buildUserPrompt,
  buildTextPrompt,
  buildTranslateSystemPrompt,
  buildTranslateUserPrompt,
  parseTranslatedBlocks,
  collectTranslatableStrings,
  applyTranslatedStrings,
  type TranslatableString,
  buildWebsiteStructurePrompt,
  validateElementTree,
  validateWebsiteStructure,
  sanitizeGeneratedImages,
  AiGenerationError,
  searchContent,
  reindexAll,
  loadRootEnv,
  listThemes,
  getTheme,
  createTheme,
  updateTheme,
  deleteTheme,
  generateResetToken,
  findUserByResetToken,
  clearResetToken,
  updatePassword,
  RESET_TOKEN_TTL_MS,
  listUsers,
  getUserWithRoles,
  createUser,
  updateUser,
  deleteUser as deleteUserRecord,
  adminResetPassword,
  listRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole as deleteRoleRecord,
  listAllPermissions,
  listSubscriptions,
  createSubscription,
  deleteAllSubscriptions,
  sendPushNotification,
  initializePushProvider,
  getAssetById,
  getAssetByPath,
  listAssetsUnderFolder,
  resolveContentCdnMirrors,
  bindPageGatewayContent,
  sanitizePublicGatewayContent,
  setWebsiteGatewayApiKey,
  clearWebsiteGatewayApiKey,
  type PushProviderName,
  type AuthenticatedRequest,
  type SearchOptions,
  type SearchDocumentType,
  type MenuItem,
  validateSessionToken,
  parseTrustProxy,
  corsPolicy,
  securityHeaders,
  sanitizeServerErrors,
  cookieShouldBeSecure,
  createFixedWindowLimiter,
  createFailureLock,
  buildWebsiteBundle,
  createSiteRootCache,
  isReservedRootPath,
  substituteTokensPlain,
  importWebsiteBundle,
  importSiteSpec,
  SiteSpecError,
  buildSite,
  WizardError,
  wizardOptions,
  snippetWizardBlock,
  nodeHasH1,
  parsePalette,
  AI_TEXTS_SYSTEM_PROMPT,
  buildTextsPrompt,
  cleanAiTexts,
  SECTOR_LABELS,
  weakPairs,
  listWizardPalettes,
  listCustomFonts,
  getCustomFont,
  createCustomFont,
  deleteCustomFont,
  readCustomFontBody,
  createWizardPalette,
  updateWizardPalette,
  deleteWizardPalette,
  SNIPPET_BLOCK_TYPES,
  parseWebsiteBundle,
  ImportError,
  signUploadTicket,
  uploadTokenSecret,
  getWebsitePushApiKey,
  purgeStaleSessions,
  createFormUpload,
  getFormUpload,
  websiteUploadBytesToday,
  markFormUploadRejected,
  listAudit,
  purgeAudit,
  csvCell,
  auditStats,
  auditRetentionDays,
} from '@whoobe-cms/core/server';
import type { EventActor } from '@whoobe-cms/core/server';
import {
  listObjectEventSubscriptions,
  loopGuardFiredBySubscription,
  getObjectEventSubscription,
  createObjectEventSubscription,
  updateObjectEventSubscription,
  deleteObjectEventSubscription,
  sendTestObjectEvent,
  listDeliveries,
  deleteDeliveries,
  retryDeadDelivery,
  validateSubscriptionInput,
  getGatewayEndpoint,
  getGatewayRoute,
} from '@whoobe-cms/core/server';
// Root package entry, not '/server' - compileDynamicSchema lives in
// schema/dynamic.ts, exported from index.ts and kept out of the Node-only
// './server' barrel on purpose (no DB/crypto dependency, so it's also
// reachable from browser bundles - admin-dashboard already imports other
// root-package exports like ClassFieldDefinition the same way).
import { createAuthoredUploadFieldsCache, uploadBaseUrl, SubmitUploadError } from './form-uploads.js';
import {
  normalizeUploadLimits,
  UPLOAD_CEILINGS,
  SNIFFABLE_EXTENSIONS,
  checkUploadIntent,
  effectiveUploadLimits,
  displayFileName,
  readUploadRefs,
  FORM_UPLOAD_PUT_PATH,
  compileDynamicSchema,
  seoHasTokens,
  pickSeoBinding,
  substituteBindingFilters,
  seoAssetIds,
  resolveSeoTemplates,
  isSandbox,
  communityUrl,
  isSandboxBlockedPath,
  isSandboxReadOnlyPath,
  SANDBOX_READ_ONLY_MESSAGE,
  sandboxStatus,
  SANDBOX_DISABLED_MESSAGE,
} from '@whoobe-cms/core';
import { SITE_SPEC_VERSION, SITE_SPEC_LIMITS, SITE_SPEC_INSTRUCTIONS, SITE_SPEC_EXAMPLES, siteSpecJsonSchema } from '@whoobe-cms/schema';
import { runClassMigration, previewClassMigration, runObjectMigration, runDocumentMigration, runPromoteDocuments, runPromoteDocument, runExtractCollectionTypes, createMigrationJobRegistry } from '@whoobe-cms/migration-tool';
import { fetchAndConvert } from '@whoobe-cms/figma-converter';


import { createLogger, resolveLogDir, attachLoggingToggle } from '@whoobe-cms/logger';

const logger = await createLogger('core-api', {
  file: true,
  damUpload: true,
});
// Audit log of administrative actions (docs/plans/system/audit-log-plan.md): `audited(AUDIT.<name>)` in a route's middleware list.
const { audited } = createAudit(logger);

/** Who made a write, for the object events: the signed-in user (a request without one, which no guarded route allows, is `system`). */
function eventActorOf(req: Request): EventActor {
  const id = (req as any).user?.id;
  return id ? { type: 'user', id: String(id) } : { type: 'system' };
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Shared by the three "render this Element tree for an ESP campaign"
// endpoints (mail templates, snippets, pages) - fetching the record itself
// differs per source, but resolving images/fonts and wrapping the result
// in a standalone <!DOCTYPE html> document is identical for all three.
//
// `embedImages: true` inlines every DAM image as a base64 data: URI
// instead of a proxy URL - the correct default for a destination outside
// this install's own network (an ESP like Brevo), which may not be able to
// reach a local/dev DAM at all (localhost, a private LAN address);
// pass false only when the caller knows the image host is genuinely
// publicly reachable and wants the smaller payload instead.
//
// Wrapping in buildMailDocument() (with collectMailFonts()'s own Google
// Fonts <link> tags in <head>) was missing from all three endpoints until
// now - they returned a bare body fragment, so any custom font the
// template/snippet/page used silently fell back to the destination's
// default font, exactly like an unresolved image silently fell back to no
// image at all before the classAndStyleAttrs() background-image fix.
async function renderElementTreeForEmail(content: unknown, embedImages: boolean): Promise<{ html: string; text: string }> {
  const imageUrls = embedImages ? await resolveMailImageDataUris(content) : await resolveMailImageUrls(content);
  const bodyHtml = renderStaticHtml(content, imageUrls);
  const html = buildMailDocument({ bodyHtml, fonts: collectMailFonts(content) });
  return { html, text: htmlToPlainText(html) };
}

// Load the repo-root .env (single source of truth for all apps, see
// docs/plans/environment/env-optimization.md) with ${VAR} expansion.
// Shell-exported vars win, which is how ./dev-cms.sh --hostname overrides
// WHOOBE_HOSTNAME-derived values. No .env present -> fall back to whatever
// is already in process.env.
loadRootEnv();

// Wired up after loadRootEnv() so the first poll's DB connection has its
// env vars (DB_HOST etc.) in place.
attachLoggingToggle(logger, isLoggingEnabled);

const cfg = getConnectionConfig();
logger.info({ host: cfg.host, port: cfg.port, db: cfg.database, user: cfg.user, tls: cfg.ssl ? (cfg.ssl.rejectUnauthorized ? 'verified' : 'encrypted, certificate not checked') : 'off' }, 'Database connection configured');

const app = express();
const port = process.env.PORT || 3003;
const isProduction = process.env.NODE_ENV === 'production';

// Same reasoning as apps/gateway's own express.json() limit bump: Express's
// 100kb default is too small once a request/response body can contain
// base64 image data (e.g. a snippet/page/mail-template with several
// embedded images, or its own base64-image render option).
app.use(express.json({ limit: '25mb' }));
app.use(cookieParser());
// Public sandbox: features that reach outside the stack or run builds answer 403 (packages/core/src/sandbox.ts).
app.use((req: Request, res: Response, next: NextFunction): void => {
  if (isSandbox() && isSandboxBlockedPath(req.path)) { res.status(403).json({ error: SANDBOX_DISABLED_MESSAGE }); return; }
  if (isSandbox() && isSandboxReadOnlyPath(req.method, req.path)) { res.status(403).json({ error: SANDBOX_READ_ONLY_MESSAGE }); return; }
  next();
});
// Credentialed CORS only for an allowlist (WHOOBE_HOSTNAME, CORS_ALLOWED_HOSTS,
// CORS_ALLOWED_ORIGINS; localhost too outside production). Public routes answer any
// origin but never with credentials. See packages/core/src/http/security.ts.
app.disable('x-powered-by');
// req.ip drives the login/form/subscribe limiters. Behind a reverse proxy set TRUST_PROXY (hops, e.g. 1,
// or 'loopback' / a CIDR list) so it is the client's address; leave it unset when the API is reachable
// directly, otherwise any client could pick its own address through X-Forwarded-For.
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));
// Request counts and times for /metrics: first in the chain, so a request refused further down (429, 403) is counted too.
const httpMetrics = createHttpMetrics();
app.use(httpMetrics.middleware);
app.use(securityHeaders());
app.use(corsPolicy({ publicPathPrefixes: ['/public/', '/preview/', '/health', '/pwa/subscribe'] }));
app.use(sanitizeServerErrors());

// Per-client-address limits on the anonymous API (req.ip: behind a reverse proxy set TRUST_PROXY; a server-side
// rendering host calls from ONE address, hence the generous defaults). 0 switches a limit off.
//   PUBLIC_RATE_LIMIT_PER_MINUTE (all /public/*), PUBLIC_SEARCH_RATE_LIMIT_PER_MINUTE (/public/search),
//   PUBLIC_QUERY_RATE_LIMIT_PER_MINUTE (/public/data-objects/query: unbounded in-memory filtering per call).
function envLimit(name: string, dflt: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return dflt;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : dflt;
}
const PUBLIC_LIMITS = [
  { match: (p: string) => true, max: envLimit('PUBLIC_RATE_LIMIT_PER_MINUTE', 3000), limiter: null as ReturnType<typeof createFixedWindowLimiter> | null },
  { match: (p: string) => p === '/public/search', max: envLimit('PUBLIC_SEARCH_RATE_LIMIT_PER_MINUTE', 120), limiter: null as ReturnType<typeof createFixedWindowLimiter> | null },
  { match: (p: string) => p === '/public/data-objects/query', max: envLimit('PUBLIC_QUERY_RATE_LIMIT_PER_MINUTE', 600), limiter: null as ReturnType<typeof createFixedWindowLimiter> | null },
].map((l) => ({ ...l, limiter: l.max > 0 ? createFixedWindowLimiter({ max: l.max, windowMs: 60_000 }) : null }));

app.use('/public/', (req: Request, res: Response, next: NextFunction): void => {
  const ip = req.ip ?? 'unknown';
  const fullPath = req.baseUrl + req.path; // inside app.use('/public/') req.path is relative to the mount
  for (const l of PUBLIC_LIMITS) {
    if (l.limiter && l.match(fullPath) && l.limiter.hit(ip)) {
      res.setHeader('Retry-After', '60');
      res.status(429).json({ error: 'Too many requests. Try again later.' });
      return;
    }
  }
  next();
});

// AI calls cost money: bound them per user (AI_RATE_LIMIT_PER_MINUTE, default 20; 0 = off).
const AI_RATE_LIMIT = envLimit('AI_RATE_LIMIT_PER_MINUTE', 20);
const aiLimiter = AI_RATE_LIMIT > 0 ? createFixedWindowLimiter({ max: AI_RATE_LIMIT, windowMs: 60_000 }) : null;
function aiRateLimit(req: Request, res: Response, next: NextFunction): void {
  if (aiLimiter && aiLimiter.hit((req as AuthenticatedRequest).user?.id ?? req.ip ?? 'unknown')) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: 'Too many AI requests. Try again in a minute.' });
    return;
  }
  next();
}

// Every `:id`-style path parameter in this API is a uuid column; a malformed one used to reach
// Postgres and come back as a 500 carrying the SQL text. Answer 404 before touching the database.
const UUID_PARAM_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
for (const name of ['id', 'versionId', 'websiteId', 'translationGroupId']) {
  app.param(name, (_req: Request, res: Response, next: NextFunction, value: string) => {
    if (!UUID_PARAM_RE.test(value)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    next();
  });
}

// Asked by the reverse proxy (nginx auth_request, deploy/nginx/_locations.conf.template) for every request that no
// location claims by name: is the first segment of the URI the root path of a website? 204 = yes (the proxy sends it
// to the editor, which renders the page), 403 = no (it goes to the dashboard). Answers from a 5 s cache of the roots.
/** The PWA configuration as an anonymous app may see it: no push provider key, and not even the flag that one is set. */
function publicPwaConfig(config: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const c = { ...(config ?? {}) } as Record<string, unknown>;
  if (c.push && typeof c.push === 'object' && !Array.isArray(c.push)) {
    const { onesignalApiKey: _k, onesignalApiKeySet: _s, clearOnesignalApiKey: _c, ...push } = c.push as Record<string, unknown>;
    c.push = push;
  }
  return c;
}

const siteRootCache = createSiteRootCache(async () => (await listWebsites()).map((w) => w.rootPath).filter((r): r is string => !!r));
app.get('/site-root', async (req: Request, res: Response): Promise<void> => {
  try {
    const header = req.headers['x-original-uri'];
    const uri = typeof header === 'string' ? header : typeof req.query.uri === 'string' ? req.query.uri : '';
    res.status((await siteRootCache.matches(uri)) ? 204 : 403).end();
  } catch (error) {
    logger.error({ err: error }, 'Site root check error');
    res.status(403).end();   // when in doubt the request goes to the dashboard, as it always did
  }
});

// Two probes. /health is READINESS: it answers 503 when the database does not answer (the answer is kept for 2 s, so an anonymous
// caller cannot make a query per request). /health/live is LIVENESS: the process is up, nothing else is asked (the Docker
// HEALTHCHECK uses it, so a database outage does not make the container look dead). Neither shows more than it did before.
const databaseUp = memoAsync(() => pingDatabase(2000), 2000);
const healthBody = () => ({ service: 'core-api', audit: auditStats.lost === 0 ? 'ok' : 'degraded', uptimeSeconds: process.uptime(), timestamp: new Date().toISOString(), ...(isSandbox() ? { sandbox: sandboxStatus() } : {}), ...(communityUrl() ? { community: { url: communityUrl() } } : {}) });
app.get('/health', async (_req: Request, res: Response) => {
  const up = await databaseUp();
  res.status(up ? 200 : 503).json({ status: up ? 'ok' : 'unavailable', database: up ? 'ok' : 'down', ...healthBody() });
});
app.get('/health/live', (_req: Request, res: Response) => {
  res.json({ status: 'ok', ...healthBody() });
});

// Prometheus metrics. OFF unless METRICS_TOKEN is set (404 without it); with it, `Authorization: Bearer <token>`. The nginx template does
// not route /metrics, so it is reachable on the service network (and on the published port), not from the internet.
const METRICS_VERSION = (() => { try { return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version as string; } catch { return 'unknown'; } })();
app.get('/metrics', async (req: Request, res: Response) => {
  if (!process.env.METRICS_TOKEN) { res.status(404).json({ error: 'Not found' }); return; }
  if (!metricsTokenOk(req.headers.authorization, process.env.METRICS_TOKEN)) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const up = await databaseUp();
  const [jobs, deliveries] = up ? await Promise.all([publishJobCounts().catch(() => ({})), eventDeliveryCounts().catch(() => ({}))]) : [{}, {}];
  const mem = process.memoryUsage();
  const byStatus = (name: string, help: string, counts: Record<string, number>) => ({ name, help, samples: Object.entries(counts).map(([status, value]) => ({ labels: { status }, value })) });
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(httpMetrics.render([
    { name: 'whoobe_build_info', help: 'Version of this build.', samples: [{ labels: { service: 'core-api', version: METRICS_VERSION }, value: 1 }] },
    { name: 'whoobe_database_up', help: '1 when the database answered, 0 when not.', samples: [{ value: up ? 1 : 0 }] },
    byStatus('whoobe_publish_jobs', 'Publish jobs by status.', jobs as Record<string, number>),
    byStatus('whoobe_object_event_deliveries', 'Object event deliveries by status (pending and retrying are the queue).', deliveries as Record<string, number>),
    { name: 'whoobe_audit_rows_written', help: 'Audit rows written since this process started.', samples: [{ value: auditStats.written }] },
    { name: 'whoobe_audit_rows_lost', help: 'Audit rows that could not be written since this process started.', samples: [{ value: auditStats.lost }] },
    { name: 'whoobe_process_uptime_seconds', help: 'Seconds since this process started.', samples: [{ value: Math.round(process.uptime()) }] },
    { name: 'whoobe_process_resident_memory_bytes', help: 'Resident set size.', samples: [{ value: mem.rss }] },
    { name: 'whoobe_process_heap_used_bytes', help: 'V8 heap in use.', samples: [{ value: mem.heapUsed }] },
  ]));
});

// --- Simple in-memory brute-force guard for /auth/login ---
// Single-process, dev/small-deployment scale. A multi-instance deployment
// would need this backed by something shared (e.g. the sessions table
// itself, or Redis) instead of process memory.
// Two counters: (e-mail + client address) locks after 5 failures - so a stranger guessing passwords
// from his own address locks only himself out of that account, not its owner - and the e-mail alone
// locks after 25 failures from any addresses (distributed guessing). Both lock for 15 minutes.
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_MAX_ATTEMPTS_PER_EMAIL = 25;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const LOGIN_MAX_TRACKED = 10_000;
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

const pairKey = (email: string, ip: string | undefined) => `${email}|${ip ?? 'unknown'}`;

function lockedUntilOf(key: string): number {
  return loginAttempts.get(key)?.lockedUntil ?? 0;
}

function isLockedOut(email: string, ip?: string): boolean {
  const now = Date.now();
  return lockedUntilOf(pairKey(email, ip)) > now || lockedUntilOf(email) > now;
}

function bump(key: string, max: number): void {
  const now = Date.now();
  if (loginAttempts.size >= LOGIN_MAX_TRACKED && !loginAttempts.has(key)) {
    for (const [k, v] of loginAttempts) if (v.lockedUntil <= now && v.count === 0) loginAttempts.delete(k);
    while (loginAttempts.size >= LOGIN_MAX_TRACKED) {
      const oldest = loginAttempts.keys().next().value;
      if (oldest === undefined) break;
      loginAttempts.delete(oldest);
    }
  }
  const entry = loginAttempts.get(key) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= max) {
    entry.lockedUntil = now + LOGIN_LOCKOUT_MS;
    entry.count = 0;
  }
  loginAttempts.set(key, entry);
}

function recordFailedAttempt(email: string, ip?: string): void {
  bump(pairKey(email, ip), LOGIN_MAX_ATTEMPTS);
  bump(email, LOGIN_MAX_ATTEMPTS_PER_EMAIL);
}

function clearFailedAttempts(email: string, ip?: string): void {
  loginAttempts.delete(pairKey(email, ip));
  loginAttempts.delete(email);
}

// --- Simple in-memory fixed-window rate limit for /public/forms/*/submit ---
// Same single-process/dev-scale caveat as loginAttempts above. A separate
// map rather than reusing loginAttempts/recordFailedAttempt: that one
// models failure-triggered lockout (N wrong passwords -> locked out), this
// is a plain request-volume window (N submissions per IP per window,
// success or failure doesn't matter) - different enough semantics to be a
// real bug if conflated (e.g. a burst of legitimate submissions would never
// trip a failure-counting lockout at all).
const FORM_SUBMIT_MAX = envLimit('FORM_SUBMIT_RATE_LIMIT_PER_WINDOW', 10);
const FORM_SUBMIT_WINDOW_MS = 15 * 60 * 1000;
const formSubmitCounts = new Map<string, { count: number; windowStart: number }>();

// Notification mail of a public form: only a notify block an author put in a form of a page is honoured (see
// form-notify.ts, finding F-053), and a recipient is a single plain address that gets at most 3 mails an hour.
const authoredFormNotify = createAuthoredNotifyCache(async () => (await listWhoobePages()).map((p) => ({ content: p.content, websiteId: p.websiteId })));
const formNotifyRecipients = createRecipientThrottle(3, 60 * 60 * 1000);

function isFormSubmitRateLimited(key: string): boolean {
  const entry = formSubmitCounts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.windowStart > FORM_SUBMIT_WINDOW_MS) {
    formSubmitCounts.delete(key);
    return false;
  }
  return entry.count >= FORM_SUBMIT_MAX;
}

function recordFormSubmit(key: string): void {
  const entry = formSubmitCounts.get(key);
  if (!entry || Date.now() - entry.windowStart > FORM_SUBMIT_WINDOW_MS) {
    formSubmitCounts.set(key, { count: 1, windowStart: Date.now() });
    return;
  }
  entry.count += 1;
}

// Where the admin dashboard lives, for links in e-mails. ADMIN_PUBLIC_URL wins (https/proxy/other
// ports); otherwise the historical http://<WHOOBE_HOSTNAME>:3000.
function buildResetUrl(token: string): string {
  const base = (process.env.ADMIN_PUBLIC_URL || `http://${process.env.WHOOBE_HOSTNAME || 'localhost'}:3000`).replace(/\/+$/, '');
  return `${base}/reset-password?token=${token}`;
}

function setSessionCookie(res: Response, token: string, expiresAt: Date, req: Request): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    // Secure behind TLS (direct, X-Forwarded-Proto: https, or COOKIE_SECURE=true).
    secure: cookieShouldBeSecure(req),
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  });
}

// --- Pending MFA challenges: password already verified, waiting on a TOTP/
// recovery code. Same "in-memory, single-process, dev/small-deployment
// scale" tradeoff as the login-attempt guard above - a multi-instance
// deployment would need this shared (e.g. a short-lived DB row) instead.
// Kept out of the session table entirely: a pending challenge is not a
// session (it grants nothing on its own), so it shouldn't be reachable by
// anything that trusts SESSION_COOKIE_NAME/validateSessionToken.
const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MFA_CHALLENGE_MAX_ATTEMPTS = 5;
// Guessing a 6-digit code must be limited per ACCOUNT: a stolen password lets an attacker start any number of
// fresh challenges (5 tries each), so a per-token cap alone is no limit at all.
const mfaCodeLock = createFailureLock({ max: 10, lockMs: 15 * 60 * 1000 });
// Re-authentication by password on MFA disable: same reasoning (a stolen session must not become a password oracle).
const mfaDisableLock = createFailureLock({ max: 5, lockMs: 15 * 60 * 1000 });
// A TOTP code is valid for ~90 s (+/-1 step); once used it must not work again.
const usedTotpCodes = new Map<string, number>();
const USED_TOTP_TTL_MS = 2 * 60 * 1000;

function consumeTotpCode(userId: string, code: string): boolean {
  const now = Date.now();
  for (const [k, expires] of usedTotpCodes) if (expires <= now) usedTotpCodes.delete(k);
  const key = `${userId}:${code}`;
  if (usedTotpCodes.has(key)) return false;
  usedTotpCodes.set(key, now + USED_TOTP_TTL_MS);
  return true;
}

const pendingMfaChallenges = new Map<string, { userId: string; expiresAt: number; attempts: number }>();

function createMfaChallenge(userId: string): string {
  const token = randomBytes(24).toString('hex');
  pendingMfaChallenges.set(token, { userId, expiresAt: Date.now() + MFA_CHALLENGE_TTL_MS, attempts: 0 });
  return token;
}

// Read-only lookup - a wrong code shouldn't force the user to re-enter
// their password and start over, so the challenge itself is only removed
// on success, expiry, or hitting MFA_CHALLENGE_MAX_ATTEMPTS (see
// recordMfaFailure()/resolveMfaChallenge() below), not on every call.
function peekMfaChallenge(token: string): string | null {
  const entry = pendingMfaChallenges.get(token);
  if (!entry || entry.expiresAt < Date.now()) {
    pendingMfaChallenges.delete(token);
    return null;
  }
  return entry.userId;
}

function recordMfaFailure(token: string): void {
  const entry = pendingMfaChallenges.get(token);
  if (!entry) return;
  entry.attempts += 1;
  if (entry.attempts >= MFA_CHALLENGE_MAX_ATTEMPTS) {
    pendingMfaChallenges.delete(token);
  }
}

function resolveMfaChallenge(token: string): void {
  pendingMfaChallenges.delete(token);
}

// --- Pending MFA enrolments: the password was verified, the settings require a second factor and the user has none. Same
// kind of in-memory token as a challenge (it grants nothing on its own, it is not a session): /auth/mfa/enrol/* take it instead
// of a cookie, and the session is only opened when the factor is proven (docs/plans/system/mandatory-2fa-plan.md).
const MFA_ENROL_TTL_MS = 10 * 60 * 1000;
const MFA_ENROL_MAX_ATTEMPTS = 5;
const pendingMfaEnrolments = new Map<string, { userId: string; expiresAt: number; attempts: number }>();

function createMfaEnrolment(userId: string): string {
  const token = randomBytes(24).toString('hex');
  pendingMfaEnrolments.set(token, { userId, expiresAt: Date.now() + MFA_ENROL_TTL_MS, attempts: 0 });
  return token;
}

function peekMfaEnrolment(token: string): string | null {
  const entry = pendingMfaEnrolments.get(token);
  if (!entry || entry.expiresAt < Date.now()) {
    pendingMfaEnrolments.delete(token);
    return null;
  }
  return entry.userId;
}

function recordMfaEnrolmentFailure(token: string): void {
  const entry = pendingMfaEnrolments.get(token);
  if (!entry) return;
  entry.attempts += 1;
  if (entry.attempts >= MFA_ENROL_MAX_ATTEMPTS) pendingMfaEnrolments.delete(token);
}

/** Opens the session (cookie included) and returns what the sign-in answers with. */
async function startSession(res: Response, userId: string, req: Request): Promise<Record<string, unknown>> {
  const { token, expiresAt } = await createSession(userId, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  await touchLastLogin(userId);
  setSessionCookie(res, token, expiresAt, req);

  const user = await findUserById(userId);
  const permissions = await getEffectivePermissions(userId);
  return { id: userId, email: user?.email, displayName: user?.displayName, permissions };
}

async function completeLogin(res: Response, userId: string, req: Request, extra: Record<string, unknown> = {}): Promise<void> {
  res.json({ ...(await startSession(res, userId, req)), ...extra });
}

app.post('/auth/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  const rateLimitKey = email.toLowerCase();
  if (isLockedOut(rateLimitKey, req.ip)) {
    res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
    return;
  }

  try {
    const user = await findUserByEmail(email);

    if (!user) {
      logger.warn('Login failed: unknown user');
      recordFailedAttempt(rateLimitKey, req.ip);
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    if (!user.isActive) {
      logger.warn(`Login failed: user "${user.id}" is inactive`);
      recordFailedAttempt(rateLimitKey, req.ip);
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const passwordOk = await verifyPassword(user.passwordHash, password);
    if (!passwordOk) {
      logger.warn(`Login failed: wrong password for user "${user.id}"`);
      recordFailedAttempt(rateLimitKey, req.ip);
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    clearFailedAttempts(rateLimitKey, req.ip);

    // With single sign-on set to "administrators only", the password form is the break-glass of those who can manage users.
    if ((await getOidcSettings()).localLogin === 'admins' && !(await getEffectivePermissions(user.id)).includes(PERMISSIONS.USERS_MANAGE)) {
      res.status(403).json({ error: 'Sign in with single sign-on' });
      return;
    }

    if (user.totpEnabledAt) {
      const mfaToken = createMfaChallenge(user.id);
      res.json({ mfaRequired: true, mfaToken });
      return;
    }

    if (await userMustUseMfaNow(user.id)) {
      res.json({ mfaEnrolmentRequired: true, enrolToken: createMfaEnrolment(user.id) });
      return;
    }

    await completeLogin(res, user.id, req);
  } catch (error: any) {
    logger.error({ err: error }, 'Login error');
    res.status(500).json({ error: 'Login failed' });
  }
});

// Step 2 of login when the account has MFA enabled - password was already
// verified by /auth/login (that's what mfaToken proves), this only checks
// the TOTP/recovery code before actually creating a session.
app.post('/auth/mfa/challenge', async (req: Request, res: Response): Promise<void> => {
  const { mfaToken, code, recoveryCode } = req.body ?? {};
  if (typeof mfaToken !== 'string') {
    res.status(400).json({ error: 'mfaToken is required' });
    return;
  }

  const userId = peekMfaChallenge(mfaToken);
  if (!userId) {
    res.status(401).json({ error: 'MFA challenge expired - please log in again' });
    return;
  }

  try {
    const user = await findUserById(userId);
    if (!user || !user.isActive || !user.totpEnabledAt) {
      resolveMfaChallenge(mfaToken);
      res.status(401).json({ error: 'Invalid session - please log in again' });
      return;
    }

    if (mfaCodeLock.isLocked(user.id)) {
      res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
      return;
    }

    if (typeof code === 'string' && user.totpSecret && verifyTotpToken(user.totpSecret, code) && consumeTotpCode(user.id, code)) {
      resolveMfaChallenge(mfaToken);
      mfaCodeLock.clear(user.id);
      await completeLogin(res, user.id, req);
      return;
    }

    if (typeof recoveryCode === 'string' && user.mfaRecoveryCodes) {
      const updated = await consumeRecoveryCode(user.mfaRecoveryCodes, recoveryCode);
      if (updated) {
        resolveMfaChallenge(mfaToken);
        mfaCodeLock.clear(user.id);
        await updateMfaRecoveryCodes(user.id, updated);
        await completeLogin(res, user.id, req);
        return;
      }
    }

    mfaCodeLock.fail(user.id);
    recordMfaFailure(mfaToken);
    res.status(401).json({ error: 'Invalid code' });
  } catch (error: any) {
    logger.error({ err: error }, 'MFA challenge error');
    res.status(500).json({ error: 'MFA verification failed' });
  }
});

// Forced enrolment (the settings require a second factor of this user): the token from /auth/login stands in for the session.
// Step 1 gives the secret and the QR code like /auth/mfa/setup.
app.post('/auth/mfa/enrol/setup', async (req: Request, res: Response): Promise<void> => {
  const { enrolToken } = req.body ?? {};
  const userId = typeof enrolToken === 'string' ? peekMfaEnrolment(enrolToken) : null;
  if (!userId) {
    res.status(401).json({ error: 'Enrolment expired - sign in again' });
    return;
  }
  try {
    const user = await findUserById(userId);
    if (!user || !user.isActive || user.totpEnabledAt) {
      pendingMfaEnrolments.delete(enrolToken);
      res.status(401).json({ error: 'Enrolment expired - sign in again' });
      return;
    }
    const secret = generateTotpSecret();
    await setPendingTotpSecret(user.id, secret);
    const otpauthUrl = totpKeyUri(user.email, secret);
    res.json({ secret, otpauthUrl, qrCodeDataUrl: await totpQrCodeDataUrl(otpauthUrl) });
  } catch (error: any) {
    logger.error({ err: error }, 'MFA enrol setup error');
    res.status(500).json({ error: 'Failed to start MFA setup' });
  }
});

// Step 2: the code proves the app works; the factor is enabled, the recovery codes are returned once, and the session opens.
app.post('/auth/mfa/enrol/verify', async (req: Request, res: Response): Promise<void> => {
  const { enrolToken, code } = req.body ?? {};
  const userId = typeof enrolToken === 'string' ? peekMfaEnrolment(enrolToken) : null;
  if (!userId) {
    res.status(401).json({ error: 'Enrolment expired - sign in again' });
    return;
  }
  if (typeof code !== 'string') {
    res.status(400).json({ error: 'code is required' });
    return;
  }
  try {
    if (mfaCodeLock.isLocked(userId)) {
      res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
      return;
    }
    const user = await findUserById(userId);
    if (!user || !user.isActive || user.totpEnabledAt) {
      pendingMfaEnrolments.delete(enrolToken);
      res.status(401).json({ error: 'Enrolment expired - sign in again' });
      return;
    }
    if (!user.totpSecret) {
      res.status(400).json({ error: 'No MFA setup in progress - call /auth/mfa/enrol/setup first' });
      return;
    }
    if (!verifyTotpToken(user.totpSecret, code) || !consumeTotpCode(user.id, code)) {
      mfaCodeLock.fail(user.id);
      recordMfaEnrolmentFailure(enrolToken);
      res.status(401).json({ error: 'Invalid code' });
      return;
    }
    const recoveryCodes = generateRecoveryCodes();
    await enableTotp(user.id, await hashRecoveryCodes(recoveryCodes));
    pendingMfaEnrolments.delete(enrolToken);
    mfaCodeLock.clear(user.id);
    await completeLogin(res, user.id, req, { recoveryCodes });
  } catch (error: any) {
    logger.error({ err: error }, 'MFA enrol verify error');
    res.status(500).json({ error: 'Failed to verify MFA setup' });
  }
});

app.get('/auth/mfa/status', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = await findUserById(req.user!.id);
  res.json({ enabled: !!user?.totpEnabledAt });
});

// Step 1 of enrollment: generate a new secret and return it as both a QR
// code (scan) and a plain string (manual entry) - nothing is enforced yet,
// see setPendingTotpSecret()'s own comment.
app.post('/auth/mfa/setup', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const secret = generateTotpSecret();
    await setPendingTotpSecret(req.user!.id, secret);
    const otpauthUrl = totpKeyUri(req.user!.email, secret);
    const qrCodeDataUrl = await totpQrCodeDataUrl(otpauthUrl);
    res.json({ secret, otpauthUrl, qrCodeDataUrl });
  } catch (error: any) {
    logger.error({ err: error }, 'MFA setup error');
    res.status(500).json({ error: 'Failed to start MFA setup' });
  }
});

// Step 2 of enrollment: prove the authenticator app actually works before
// MFA starts being enforced on this account. Recovery codes are generated
// and returned here, once, in plaintext - only their argon2 hash is ever
// persisted (see hashRecoveryCodes()).
app.post('/auth/mfa/verify-setup', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { code } = req.body ?? {};
  if (typeof code !== 'string') {
    res.status(400).json({ error: 'code is required' });
    return;
  }

  try {
    const user = await findUserById(req.user!.id);
    if (!user?.totpSecret) {
      res.status(400).json({ error: 'No MFA setup in progress - call /auth/mfa/setup first' });
      return;
    }
    if (!verifyTotpToken(user.totpSecret, code)) {
      res.status(401).json({ error: 'Invalid code' });
      return;
    }

    const recoveryCodes = generateRecoveryCodes();
    await enableTotp(user.id, await hashRecoveryCodes(recoveryCodes));
    res.json({ success: true, recoveryCodes });
  } catch (error: any) {
    logger.error({ err: error }, 'MFA verify-setup error');
    res.status(500).json({ error: 'Failed to verify MFA setup' });
  }
});

app.post('/auth/mfa/disable', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { password } = req.body ?? {};
  if (typeof password !== 'string') {
    res.status(400).json({ error: 'password is required' });
    return;
  }

  try {
    if (mfaDisableLock.isLocked(req.user!.id)) {
      res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
      return;
    }
    const user = await findUserById(req.user!.id);
    if (!user || !(await verifyPassword(user.passwordHash, password))) {
      mfaDisableLock.fail(req.user!.id);
      res.status(401).json({ error: 'Invalid password' });
      return;
    }
    mfaDisableLock.clear(user.id);
    if (await userMustUseMfaNow(user.id)) {
      res.status(409).json({ error: 'A second factor is required for your role and cannot be turned off' });
      return;
    }
    await disableTotp(user.id);
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'MFA disable error');
    res.status(500).json({ error: 'Failed to disable MFA' });
  }
});

app.post('/auth/logout', async (req: Request, res: Response): Promise<void> => {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (token) {
    await revokeSession(token);
  }
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.json({ success: true });
});

app.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json(req.user);
});

// --- Password Reset ---
// Rate-limited to the same in-memory approach as the login-lockout map
// above. Separate map: a forgot-password request is not a login attempt,
// it's a volume guard against email-bombing a single address.
const FORGOT_PASSWORD_MAX = 3;
const FORGOT_PASSWORD_WINDOW_MS = 15 * 60 * 1000;
const forgotPasswordCounts = new Map<string, { count: number; windowStart: number }>();

function isForgotPasswordRateLimited(email: string): boolean {
  const entry = forgotPasswordCounts.get(email);
  if (!entry) return false;
  if (Date.now() - entry.windowStart > FORGOT_PASSWORD_WINDOW_MS) {
    forgotPasswordCounts.delete(email);
    return false;
  }
  return entry.count >= FORGOT_PASSWORD_MAX;
}

function recordForgotPassword(email: string): void {
  const entry = forgotPasswordCounts.get(email);
  if (!entry || Date.now() - entry.windowStart > FORGOT_PASSWORD_WINDOW_MS) {
    forgotPasswordCounts.set(email, { count: 1, windowStart: Date.now() });
    return;
  }
  entry.count += 1;
}

app.post('/auth/forgot-password', async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body ?? {};
  if (typeof email !== 'string' || !email.trim()) {
    res.status(400).json({ error: 'email is required' });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (isForgotPasswordRateLimited(normalizedEmail)) {
    res.status(429).json({ error: 'Too many requests. Try again later.' });
    return;
  }

  recordForgotPassword(normalizedEmail);

// Always respond with success, whether or not the email exists - never
  // reveal account existence to unauthenticated callers.
  try {
    const user = await findUserByEmail(normalizedEmail);
    if (user && user.isActive) {
      const token = await generateResetToken(user.id);
      logger.info(`Password reset requested for user "${user.id}"`);
      const resetUrl = buildResetUrl(token);

      const settings = await resolveMailSettings(null);
      if (!settings) {
        // Dev fallback: no SMTP configured, log the URL so testing can
        // still proceed without mail infrastructure.
        // Dev convenience only: the link IS the credential, so it must never reach production logs.
        if (!isProduction) {
          console.log('');
          console.log('=== Password reset link (no mail settings configured) ===');
          console.log(`  ${resetUrl}`);
          console.log('========================================================');
          console.log('');
        } else {
          logger.warn('Password reset requested but no mail settings are configured: no e-mail was sent');
        }
      } else {
        await sendMail({
          to: user.email,
          subject: 'Password Reset Request',
          html: `<p>You requested a password reset.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in 1 hour.</p><p>If you did not request this, ignore this email.</p>`,
          text: `You requested a password reset.\n\nReset your password here: ${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you did not request this, ignore this email.`,
        });
      }
    }
  } catch (error: any) {
    logger.error({ err: error }, 'Forgot-password error');
    // Still return success - don't leak whether the account exists.
  }

  res.json({ success: true });
});

app.post('/auth/reset-password', async (req: Request, res: Response): Promise<void> => {
  const { token, password } = req.body ?? {};
  if (typeof token !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'token and password are required' });
    return;
  }

  try {
    const user = await findUserByResetToken(token);
    if (!user) {
      res.status(400).json({ error: 'Invalid or expired reset token' });
      return;
    }

    // Double-check expiry server-side against the DB timestamp.
    const fullUser = await findUserById(user.id);
    if (!fullUser?.resetTokenExpiresAt || fullUser.resetTokenExpiresAt.getTime() < Date.now()) {
      await clearResetToken(user.id);
      res.status(400).json({ error: 'Reset token has expired' });
      return;
    }

    const broken = checkPasswordPolicy(password, (await getSecuritySettings()).passwordPolicy, { email: fullUser.email });
    if (broken) {
      res.status(400).json({ error: broken });
      return;
    }

    await updatePassword(user.id, password);
    await clearResetToken(user.id);
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Reset-password error');
    res.status(500).json({ error: 'Password reset failed' });
  }
});

// What a new password must satisfy: public, so the reset page can say it before the person types (no secret in it).
app.get('/auth/password-policy', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json((await getSecuritySettings()).passwordPolicy);
  } catch (error: any) {
    logger.error({ err: error }, 'Password policy error');
    res.status(500).json({ error: 'Failed to read the password policy' });
  }
});

// --- Security settings: who must use a second factor, the password policy (settings:manage) ---

app.get('/security-settings', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (_req: Request, res: Response): Promise<void> => {
  try {
    // `roles` is for the screen's role picker: a settings manager does not necessarily hold users:manage, which GET /auth/roles needs
    const roles = (await listRoles()).map((r) => ({ id: r.id, name: r.name }));
    res.json({ ...(await getSecuritySettings()), roles });
  } catch (error: any) {
    logger.error({ err: error }, 'Get security settings error');
    res.status(500).json({ error: 'Failed to read the security settings' });
  }
});

app.put('/security-settings', requirePermission(PERMISSIONS.SETTINGS_MANAGE), audited(AUDIT.securitySettings), async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = await parseSecuritySettingsInput(req.body ?? {});
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    res.json(await updateSecuritySettings(parsed.value));
  } catch (error: any) {
    logger.error({ err: error }, 'Update security settings error');
    res.status(500).json({ error: 'Failed to save the security settings' });
  }
});

// --- Single sign-on for staff (docs/plans/system/oidc-login-plan.md) ---
// /auth/oidc/login -> the provider -> /auth/oidc/callback. The sign-in in progress (state, nonce, PKCE verifier) is kept in memory for ten
// minutes, like the MFA challenges (one process); a cookie holds a random binder whose hash is kept with it, so a callback that this
// browser did not start (login CSRF, a code planted by someone else) is refused.
const OIDC_PENDING_TTL_MS = 10 * 60 * 1000;
const OIDC_PENDING_MAX = 2000;
const OIDC_COOKIE = 'wcms_oidc';
const pendingOidc = new Map<string, { verifier: string; nonce: string; binderHash: string; expiresAt: number }>();
// per client address; OIDC_START_RATE_LIMIT_PER_MINUTE, 0 = off
const OIDC_START_LIMIT = envLimit('OIDC_START_RATE_LIMIT_PER_MINUTE', 30);
const oidcStartLimiter = OIDC_START_LIMIT > 0 ? createFixedWindowLimiter({ max: OIDC_START_LIMIT, windowMs: 60_000 }) : null;

app.get('/auth/oidc/config', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(oidcPublicConfig(await getOidcSettings()));
  } catch (error: any) {
    logger.error({ err: error }, 'OIDC config error');
    res.status(500).json({ error: 'Failed to read the single sign-on settings' });
  }
});

app.get('/auth/oidc/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const settings = await getOidcSettings();
    if (!settings.enabled || !oidcConfigured(settings)) {
      res.status(404).json({ error: 'Single sign-on is not set up' });
      return;
    }
    if (oidcStartLimiter?.hit(req.ip ?? 'unknown')) {
      res.setHeader('Retry-After', '60');
      res.status(429).json({ error: 'Too many attempts. Try again in a minute.' });
      return;
    }
    const endpoints = await discoverOidc(settings.issuer!);
    const now = Date.now();
    for (const [k, v] of pendingOidc) if (v.expiresAt <= now) pendingOidc.delete(k);
    while (pendingOidc.size >= OIDC_PENDING_MAX) pendingOidc.delete(pendingOidc.keys().next().value as string);
    const state = randomUrlToken(24);
    const binder = randomUrlToken(24);
    const verifier = randomUrlToken(48);
    const nonce = randomUrlToken(24);
    pendingOidc.set(state, { verifier, nonce, binderHash: sha256Hex(binder), expiresAt: now + OIDC_PENDING_TTL_MS });
    res.cookie(OIDC_COOKIE, binder, { httpOnly: true, secure: cookieShouldBeSecure(req), sameSite: 'lax', maxAge: OIDC_PENDING_TTL_MS, path: '/auth/oidc' });
    res.redirect(302, buildAuthorizationUrl(endpoints, settings, { state, nonce, verifier }));
  } catch (error: any) {
    logger.error({ err: error }, 'OIDC login start error');
    const settings = await getOidcSettings().catch(() => null);
    if (settings?.redirectBaseUrl) res.redirect(302, oidcLandingUrl(settings.dashboardUrl ?? settings.redirectBaseUrl, 'provider_error'));
    else res.status(502).json({ error: 'The single sign-on provider could not be reached' });
  }
});

app.get('/auth/oidc/callback', async (req: Request, res: Response): Promise<void> => {
  const settings = await getOidcSettings().catch(() => null);
  if (!settings || !settings.enabled || !oidcConfigured(settings)) {
    res.status(404).json({ error: 'Single sign-on is not set up' });
    return;
  }
  const back = (code: keyof typeof OIDC_ERRORS, detail?: string): void => {
    if (detail) logger.warn(`OIDC sign-in refused (${code}): ${detail}`);
    res.clearCookie(OIDC_COOKIE, { path: '/auth/oidc' });
    res.redirect(302, oidcLandingUrl(settings.dashboardUrl ?? settings.redirectBaseUrl!, code));
  };
  try {
    const { code, state, error } = req.query as Record<string, unknown>;
    const pending = typeof state === 'string' ? pendingOidc.get(state) : undefined;
    if (typeof state === 'string') pendingOidc.delete(state);   // single use, whatever happens next
    const binder = (req.headers.cookie ?? '').split(';').map((c) => c.trim()).find((c) => c.startsWith(`${OIDC_COOKIE}=`))?.slice(OIDC_COOKIE.length + 1);
    if (!pending || pending.expiresAt < Date.now() || !binder || sha256Hex(decodeURIComponent(binder)) !== pending.binderHash) {
      back('invalid_state', 'state unknown, expired or not started by this browser');
      return;
    }
    if (typeof error === 'string') { back('provider_error', `the provider answered error=${error.slice(0, 80)}`); return; }
    if (typeof code !== 'string' || !code || code.length > 2000) { back('invalid_state', 'no code'); return; }

    const endpoints = await discoverOidc(settings.issuer!);
    const idToken = await exchangeCode(endpoints, settings, code, pending.verifier);
    const claims = await verifyIdToken(idToken, settings, pending.nonce);

    const resolution = await resolveOidcUser({
      issuer: settings.issuer!,
      subject: String(claims.sub),
      email: typeof claims.email === 'string' ? claims.email : undefined,
      emailVerified: claims.email_verified === true,
      name: typeof claims.name === 'string' ? claims.name : undefined,
      claims,
    }, settings);
    if (!resolution.ok) { back(resolution.code, `no session for subject ${String(claims.sub).slice(0, 60)}`); return; }

    const actor = { type: 'system' as const, id: 'oidc', label: 'Single sign-on' };
    const target = { targetType: 'user', targetId: resolution.userId, targetLabel: resolution.email, ip: req.ip };
    if (resolution.created) void insertAuditSafe({ actor, action: 'user.sso_provision', ...target, after: { email: resolution.email, roleIds: resolution.rolesAdded } }, (err) => logger.error({ err }, 'audit: sso provision row lost'));
    if (resolution.linked) void insertAuditSafe({ actor, action: 'user.sso_link', ...target, after: { issuer: settings.issuer } }, (err) => logger.error({ err }, 'audit: sso link row lost'));
    if (!resolution.created && (resolution.rolesAdded.length || resolution.rolesRemoved.length)) {
      void insertAuditSafe({ actor, action: 'user.sso_roles', ...target, before: { removedRoleIds: resolution.rolesRemoved }, after: { addedRoleIds: resolution.rolesAdded } }, (err) => logger.error({ err }, 'audit: sso roles row lost'));
    }

    await startSession(res, resolution.userId, req);
    res.clearCookie(OIDC_COOKIE, { path: '/auth/oidc' });
    res.redirect(302, oidcLandingUrl(settings.dashboardUrl ?? settings.redirectBaseUrl!));
  } catch (error: any) {
    if (error instanceof OidcProtocolError) back(error.code, error.message);
    else { logger.error({ err: error }, 'OIDC callback error'); back('provider_error', 'unexpected error'); }
  }
});

// --- Single sign-on settings (settings:manage) ---

app.get('/oidc-settings', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (_req: Request, res: Response): Promise<void> => {
  try {
    const roles = (await listRoles()).map((r) => ({ id: r.id, name: r.name }));
    res.json({ ...publicOidcSettings(await getOidcSettings()), roles });
  } catch (error: any) {
    logger.error({ err: error }, 'Get OIDC settings error');
    res.status(500).json({ error: 'Failed to read the single sign-on settings' });
  }
});

app.put('/oidc-settings', requirePermission(PERMISSIONS.SETTINGS_MANAGE), audited(AUDIT.oidcSettings), async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = await parseOidcSettingsInput(req.body ?? {}, await getOidcSettings());
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    res.json(publicOidcSettings(await updateOidcSettings(parsed.value)));
  } catch (error: any) {
    logger.error({ err: error }, 'Update OIDC settings error');
    res.status(500).json({ error: 'Failed to save the single sign-on settings' });
  }
});

// Reads the provider's discovery document with the saved issuer: the administrator learns at once whether the address is right.
app.post('/oidc-settings/test', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (_req: Request, res: Response): Promise<void> => {
  const settings = await getOidcSettings();
  if (!settings.issuer) { res.status(400).json({ ok: false, error: 'Save the issuer first' }); return; }
  try {
    const endpoints = await discoverOidc(settings.issuer, true);
    res.json({ ok: true, ...endpoints });
  } catch (error: any) {
    res.json({ ok: false, error: error instanceof OidcProtocolError ? error.message : 'The provider could not be reached' });
  }
});

// --- Data subject requests (data_subject:manage; docs/plans/system/data-subject-plan.md) ---
// One identifier (normally an e-mail address) is looked for whole, in any case, in the values of data objects, in the mail log and in the files
// of the matched objects. Search shows what exists (no values), export hands over the records, erase deletes (files first). Staff accounts are
// reported and never deleted here. Each call is written to the audit log with a fingerprint of the identifier, never the identifier.

/** Deletes one file of the library through the asset service. Gone already = done; any other failure throws, so the object stays. */
async function deleteLibraryAsset(assetId: string): Promise<void> {
  const asset = await getAssetById(assetId);
  if (!asset) return;
  if (!DAM_SERVICE_TOKEN) throw new Error('DAM_SERVICE_TOKEN is not set: core-api cannot ask the asset service to delete files');
  const res = await fetch(`${ASSET_PROCESSOR_URL}/api/v1/dam/asset`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DAM_SERVICE_TOKEN}` },
    body: JSON.stringify({ pimcorePath: asset.pimcorePath }),
  });
  if (!res.ok) throw new Error(`the asset service answered ${res.status}`);
}

// each call scans the objects: bound it per administrator (DATA_SUBJECT_RATE_LIMIT_PER_MINUTE, default 20, 0 = off)
const DATA_SUBJECT_LIMIT = envLimit('DATA_SUBJECT_RATE_LIMIT_PER_MINUTE', 20);
const dataSubjectLimiter = DATA_SUBJECT_LIMIT > 0 ? createFixedWindowLimiter({ max: DATA_SUBJECT_LIMIT, windowMs: 60_000 }) : null;

function parseSubjectRequest(req: Request, res: Response): { identifier: string; fingerprint: string; classIds?: string[]; includeMailBodies?: boolean } | null {
  const user = (req as AuthenticatedRequest).user!;
  if (dataSubjectLimiter?.hit(user.id)) { res.setHeader('Retry-After', '60'); res.status(429).json({ error: 'Too many requests. Try again in a minute.' }); return null; }
  const id = normalizeIdentifier(req.body?.identifier);
  if (!id.ok) { res.status(400).json({ error: id.error }); return null; }
  const { classIds, includeMailBodies } = req.body ?? {};
  if (classIds !== undefined && (!Array.isArray(classIds) || classIds.length > 100 || classIds.some((c: unknown) => typeof c !== 'string' || !/^[0-9a-f-]{36}$/i.test(c)))) {
    res.status(400).json({ error: 'classIds must be a list of class ids' });
    return null;
  }
  if (includeMailBodies !== undefined && typeof includeMailBodies !== 'boolean') { res.status(400).json({ error: 'includeMailBodies must be true or false' }); return null; }
  return { identifier: id.value, fingerprint: id.fingerprint, classIds, includeMailBodies };
}

function auditSubject(req: Request, action: string, fingerprint: string, counts: Record<string, unknown>): void {
  const u = (req as AuthenticatedRequest).user!;
  void insertAuditSafe({ actor: { type: 'user', id: u.id, label: u.email }, ip: req.ip, action, targetType: 'data_subject', targetId: fingerprint, targetLabel: `request ${fingerprint}`, after: counts },
    (err) => logger.error({ err, action }, 'audit: data subject row lost'));
}

app.post('/data-subject/search', requirePermission(PERMISSIONS.DATA_SUBJECT_MANAGE), async (req: Request, res: Response): Promise<void> => {
  const p = parseSubjectRequest(req, res);
  if (!p) return;
  try {
    const found = await findDataSubject(p.identifier, p);
    auditSubject(req, 'data_subject.search', p.fingerprint, { objects: found.objects.length, mail: found.mail.length, files: found.uploads.length, staff: found.staff.length });
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      counts: { objects: found.objects.length, mail: found.mail.length, files: found.uploads.filter((u) => u.assetId).length, staff: found.staff.length },
      objects: found.objects, mail: found.mail, files: found.uploads, staff: found.staff,
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Data subject search error');
    res.status(500).json({ error: 'The search failed' });
  }
});

app.post('/data-subject/export', requirePermission(PERMISSIONS.DATA_SUBJECT_MANAGE), async (req: Request, res: Response): Promise<void> => {
  const p = parseSubjectRequest(req, res);
  if (!p) return;
  try {
    const data = await exportDataSubject(p.identifier, p);
    auditSubject(req, 'data_subject.export', p.fingerprint, { objects: data.objects.length, mail: data.mail.length, files: data.files.length });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `attachment; filename="data-subject-${p.fingerprint}.json"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');   // the dashboard (another origin in development) reads the file name
    res.json(data);
  } catch (error: any) {
    logger.error({ err: error }, 'Data subject export error');
    res.status(500).json({ error: 'The export failed' });
  }
});

app.post('/data-subject/erase', requirePermission(PERMISSIONS.DATA_SUBJECT_MANAGE), async (req: Request, res: Response): Promise<void> => {
  const p = parseSubjectRequest(req, res);
  if (!p) return;
  const dryRun = req.body?.dryRun !== false;   // a dry run unless the request says otherwise
  const include = req.body?.include;
  if (include !== undefined && (typeof include !== 'object' || include === null || ['objects', 'mail'].some((k) => include[k] !== undefined && typeof include[k] !== 'boolean'))) {
    res.status(400).json({ error: 'include must be { objects?: boolean, mail?: boolean }' });
    return;
  }
  if (!dryRun) {
    const confirm = normalizeIdentifier(req.body?.confirm);
    if (!confirm.ok || confirm.value !== p.identifier) {
      res.status(400).json({ error: 'To erase, send "confirm" with the same identifier again' });
      return;
    }
  }
  try {
    const u = (req as AuthenticatedRequest).user!;
    const result = await eraseDataSubject(p.identifier, { ...p, dryRun, include }, {
      deleteAsset: deleteLibraryAsset,
      write: { actor: { type: 'user', id: u.id } },
    });
    if (!dryRun) {
      auditSubject(req, 'data_subject.erase', p.fingerprint, {
        objectsDeleted: result.objectsDeleted, filesDeleted: result.filesDeleted, mailDeleted: result.mailDeleted, failures: result.failures.length, matched: result.matched,
      });
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Data subject erase error');
    res.status(500).json({ error: 'The erasure failed' });
  }
});

/** One run of the retention job (also the daily one): what it removed is logged and, when anything was, written to the audit log. */
async function runRetentionNow(by?: { id: string; label: string }): Promise<Awaited<ReturnType<typeof purgeExpiredData>>> {
  const r = await purgeExpiredData({ deleteAsset: deleteLibraryAsset, write: { actor: { type: by ? 'user' : 'system', id: by?.id ?? 'retention' } } });
  if (r.classes.length || r.mailDeleted) {
    logger.info({ classes: r.classes, mailDeleted: r.mailDeleted }, 'retention: old data removed');
    void insertAuditSafe({ actor: { type: by ? 'user' : 'system', id: by?.id ?? 'retention', label: by?.label ?? 'Retention job' }, action: 'retention.purge', targetType: 'retention', after: { classes: r.classes, mailDeleted: r.mailDeleted } },
      (err) => logger.error({ err }, 'audit: retention row lost'));
  }
  return r;
}

// Runs the retention job now instead of waiting for the daily run.
app.post('/data-subject/retention/run', requirePermission(PERMISSIONS.DATA_SUBJECT_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const u = (req as AuthenticatedRequest).user!;
    res.json(await runRetentionNow({ id: u.id, label: u.email }));
  } catch (error: any) {
    logger.error({ err: error }, 'Retention run error');
    res.status(500).json({ error: 'The retention run failed' });
  }
});

// --- Admin: User & Role CRUD (requires users:manage) ---

app.get('/auth/users', requirePermission(PERMISSIONS.USERS_MANAGE), async (_req: Request, res: Response): Promise<void> => {
  try {
    const usersList = await listUsers();
    res.json({ users: usersList });
  } catch (error: any) {
    logger.error({ err: error }, 'List users error');
    res.status(500).json({ error: error.message || 'Failed to list users' });
  }
});

app.post('/auth/users', requirePermission(PERMISSIONS.USERS_MANAGE), audited(AUDIT.userCreate), async (req: Request, res: Response): Promise<void> => {
  const { email, password, displayName, roleIds } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string' || typeof displayName !== 'string') {
    res.status(400).json({ error: 'email, password, and displayName are required' });
    return;
  }
  const broken = checkPasswordPolicy(password, (await getSecuritySettings()).passwordPolicy, { email });
  if (broken) {
    res.status(400).json({ error: broken });
    return;
  }
  if (!Array.isArray(roleIds) || roleIds.length === 0) {
    res.status(400).json({ error: 'At least one roleId is required' });
    return;
  }
  try {
    const user = await createUser({ email, password, displayName, roleIds });
    res.status(201).json({ user });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ error: 'A user with this email already exists' });
      return;
    }
    logger.error({ err: error }, 'Create user error');
    res.status(500).json({ error: error.message || 'Failed to create user' });
  }
});

app.get('/auth/users/:id', requirePermission(PERMISSIONS.USERS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserWithRoles(req.params.id);
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json({ user });
  } catch (error: any) {
    logger.error({ err: error }, 'Get user error');
    res.status(500).json({ error: error.message || 'Failed to get user' });
  }
});

app.patch('/auth/users/:id', requirePermission(PERMISSIONS.USERS_MANAGE), audited(AUDIT.userUpdate), async (req: Request, res: Response): Promise<void> => {
  const { email, displayName, isActive, roleIds } = req.body ?? {};
  try {
    const user = await updateUser(req.params.id, {
      email: typeof email === 'string' ? email : undefined,
      displayName: typeof displayName === 'string' ? displayName : undefined,
      isActive: typeof isActive === 'boolean' ? isActive : undefined,
      roleIds: Array.isArray(roleIds) ? roleIds : undefined,
    });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json({ user });
  } catch (error: any) {
    logger.error({ err: error }, 'Update user error');
    res.status(500).json({ error: error.message || 'Failed to update user' });
  }
});

app.delete('/auth/users/:id', requirePermission(PERMISSIONS.USERS_MANAGE), audited(AUDIT.userDelete), async (req: Request, res: Response): Promise<void> => {
  try {
    await deleteUserRecord(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Delete user error');
    res.status(500).json({ error: error.message || 'Failed to delete user' });
  }
});

app.post('/auth/users/:id/reset-password', requirePermission(PERMISSIONS.USERS_MANAGE), audited(AUDIT.userResetPassword), async (req: Request, res: Response): Promise<void> => {
  try {
    const token = await adminResetPassword(req.params.id);
    const resetUrl = buildResetUrl(token);
    logger.info(`Admin-triggered password reset for user ${req.params.id}`);
    res.json({ resetUrl, token });
  } catch (error: any) {
    logger.error({ err: error }, 'Admin reset password error');
    res.status(500).json({ error: error.message || 'Failed to reset password' });
  }
});

app.get('/auth/roles', requirePermission(PERMISSIONS.USERS_MANAGE), async (_req: Request, res: Response): Promise<void> => {
  try {
    const rolesList = await listRoles();
    res.json({ roles: rolesList });
  } catch (error: any) {
    logger.error({ err: error }, 'List roles error');
    res.status(500).json({ error: error.message || 'Failed to list roles' });
  }
});

app.post('/auth/roles', requirePermission(PERMISSIONS.USERS_MANAGE), audited(AUDIT.roleCreate), async (req: Request, res: Response): Promise<void> => {
  const { name, description, permissionKeys } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  try {
    const role = await createRole({ name: name.trim(), description, permissionKeys: Array.isArray(permissionKeys) ? permissionKeys : [] });
    res.status(201).json({ role });
  } catch (error: any) {
    if ((error?.code ?? error?.cause?.code) === '23505') {
      res.status(409).json({ error: 'A role with this name already exists' });
      return;
    }
    logger.error({ err: error }, 'Create role error');
    res.status(500).json({ error: error.message || 'Failed to create role' });
  }
});

app.get('/auth/roles/:id', requirePermission(PERMISSIONS.USERS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const role = await getRole(req.params.id);
    if (!role) { res.status(404).json({ error: 'Role not found' }); return; }
    res.json({ role });
  } catch (error: any) {
    logger.error({ err: error }, 'Get role error');
    res.status(500).json({ error: error.message || 'Failed to get role' });
  }
});

app.patch('/auth/roles/:id', requirePermission(PERMISSIONS.USERS_MANAGE), audited(AUDIT.roleUpdate), async (req: Request, res: Response): Promise<void> => {
  const { name, description, permissionKeys } = req.body ?? {};
  try {
    const role = await updateRole(req.params.id, {
      name: typeof name === 'string' ? name.trim() : undefined,
      description: description === null ? null : typeof description === 'string' ? description : undefined,
      permissionKeys: Array.isArray(permissionKeys) ? permissionKeys : undefined,
    });
    if (!role) { res.status(404).json({ error: 'Role not found' }); return; }
    res.json({ role });
  } catch (error: any) {
    logger.error({ err: error }, 'Update role error');
    res.status(500).json({ error: error.message || 'Failed to update role' });
  }
});

app.delete('/auth/roles/:id', requirePermission(PERMISSIONS.USERS_MANAGE), audited(AUDIT.roleDelete), async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await deleteRoleRecord(req.params.id);
    if (result.blocked) {
      res.status(409).json({ error: `Cannot delete role: ${result.userCount} user(s) are assigned to it` });
      return;
    }
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Delete role error');
    res.status(500).json({ error: error.message || 'Failed to delete role' });
  }
});

// --- Audit log (read only; docs/plans/system/audit-log-plan.md) ---
// Filters: action (exact, or a prefix ending in "."), actor (user id), targetType, targetId, from, to (ISO dates), limit (default 100, at most
// 5000), offset. Newest first. ?format=csv returns the same rows as a file. There is no route that writes or deletes: the log is changed only
// by the application's own audited actions and by the retention job.
app.get('/audit-log', requirePermission(PERMISSIONS.AUDIT_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const q = req.query;
    const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const date = (v: unknown): Date | undefined => { const d = str(v) ? new Date(String(v)) : undefined; return d && !Number.isNaN(d.getTime()) ? d : undefined; };
    if ((str(q.from) && !date(q.from)) || (str(q.to) && !date(q.to))) { res.status(400).json({ error: 'from and to must be dates (ISO 8601)' }); return; }
    const num = (v: unknown): number | undefined => { const n = Number(str(v)); return Number.isFinite(n) ? n : undefined; };
    const csv = q.format === 'csv';
    const { rows, total } = await listAudit({
      action: str(q.action), actor: str(q.actor), targetType: str(q.targetType), targetId: str(q.targetId),
      from: date(q.from), to: date(q.to), limit: num(q.limit) ?? (csv ? 5000 : 100), offset: num(q.offset),
    });
    if (csv) {
      const head = ['at', 'actor_type', 'actor_id', 'actor_label', 'ip', 'action', 'target_type', 'target_id', 'target_label', 'before', 'after', 'request_id'];
      const lines = rows.map((r) => [r.at.toISOString(), r.actorType, r.actorId, r.actorLabel, r.ip, r.action, r.targetType, r.targetId, r.targetLabel, r.before, r.after, r.requestId].map(csvCell).join(','));
      res.setHeader('content-type', 'text/csv; charset=utf-8');
      res.setHeader('content-disposition', 'attachment; filename="audit-log.csv"');
      res.send([head.join(','), ...lines].join('\r\n') + '\r\n');
      return;
    }
    res.json({ entries: rows, total });
  } catch (error: any) {
    logger.error({ err: error }, 'Audit log list error');
    res.status(500).json({ error: 'Failed to read the audit log' });
  }
});

app.get('/auth/permissions', requirePermission(PERMISSIONS.USERS_MANAGE), async (_req: Request, res: Response): Promise<void> => {
  try {
    const allPerms = await listAllPermissions();
    res.json({ permissions: allPerms });
  } catch (error: any) {
    logger.error({ err: error }, 'List permissions error');
    res.status(500).json({ error: error.message || 'Failed to list permissions' });
  }
});

// Documents migrated from Pimcore (or authored fresh) - see
// docs/plans/cms/pimcore-areablock-import-plan.md. Reuses the objects:read
// permission rather than introducing a separate documents:* domain, since
// no distinct access-control need has come up yet.
app.get('/documents', requireAnyPermission(PERMISSIONS.DATA_OBJECTS_LIST, PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const documents = await listDocuments();
    res.json({ documents });
  } catch (error: any) {
    logger.error({ err: error }, 'List documents error');
    res.status(500).json({ error: error.message || 'Failed to list documents' });
  }
});

app.get('/documents/:id', requireAnyPermission(PERMISSIONS.DATA_OBJECTS_VIEW, PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const document = await getDocumentById(req.params.id);
    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    res.json({ document });
  } catch (error: any) {
    logger.error({ err: error }, 'Get document error');
    res.status(500).json({ error: error.message || 'Failed to get document' });
  }
});

// Saves edits made in Whoobe Studio. Only title/rootBlock are writable by
// the autosave loop; `status` is optional and only ever sent by the
// explicit Save as Draft/Save and Publish actions (MasterDocumentTab.vue) -
// transitioning to 'published' additionally requires objects:publish, kept
// separate from the base objects:write gate on this route since editors can
// autosave drafts without necessarily being allowed to publish.
app.patch('/documents/:id', requireAnyPermission(PERMISSIONS.DATA_OBJECTS_EDIT, PERMISSIONS.OBJECTS_WRITE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { title, rootBlock, status } = req.body ?? {};
    if (typeof title !== 'string' || !rootBlock) {
      res.status(400).json({ error: 'title and rootBlock are required' });
      return;
    }
    if (status !== undefined) {
      if (typeof status !== 'string') {
        res.status(400).json({ error: 'status must be a string' });
        return;
      }
      if (status === 'published' && !req.user?.permissions.includes(PERMISSIONS.OBJECTS_PUBLISH)) {
        res.status(403).json({ error: `Missing permission: ${PERMISSIONS.OBJECTS_PUBLISH}` });
        return;
      }
    }

    const document = await updateDocumentContent(req.params.id, { title, rootBlock, status });
    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    res.json({ document });
  } catch (error: any) {
    logger.error({ err: error }, 'Update document error');
    res.status(500).json({ error: error.message || 'Failed to update document' });
  }
});

// Reusable content fragments saved from Whoobe Studio's "Save as Snippet"
// action (a full WhoobeBlockNode subtree, not a whole document) - see
// packages/core/src/db/snippet-schema.ts. Reuses the same objects:read/write
// permissions as documents, same rationale as that route's comment above.
app.get('/snippets', requireAnyPermission(PERMISSIONS.SNIPPETS_LIST, PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const snippets = await listSnippets();
    res.json({ snippets });
  } catch (error: any) {
    logger.error({ err: error }, 'List snippets error');
    res.status(500).json({ error: error.message || 'Failed to list snippets' });
  }
});

app.post('/snippets', requireAnyPermission(PERMISSIONS.SNIPPETS_CREATE, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, icon, node } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || !node) {
      res.status(400).json({ error: 'name and node are required' });
      return;
    }

    const snippet = await createSnippet({ name: name.trim(), icon: typeof icon === 'string' ? icon : null, node });
    res.status(201).json({ snippet });
  } catch (error: any) {
    logger.error({ err: error }, 'Create snippet error');
    res.status(500).json({ error: error.message || 'Failed to create snippet' });
  }
});

app.delete('/snippets/:id', requireAnyPermission(PERMISSIONS.SNIPPETS_DELETE, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    await deleteSnippet(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Delete snippet error');
    res.status(500).json({ error: error.message || 'Failed to delete snippet' });
  }
});

// Same idea as /snippets above, but for apps/whoobe-one-spike's own,
// incompatible node format (an ElementsClass.js `Element` subtree, not a
// WhoobeBlockNode) - see packages/core/src/db/whoobe-one-snippet-schema.ts.
// whoobe-one-spike has no login flow of its own (same situation as
// dam-api.ts's callers), so these routes work for it exactly like the DAM
// ones do - as long as there's already a session cookie for the current
// hostname.
app.get('/whoobe-one/snippets', requireAnyPermission(PERMISSIONS.SNIPPETS_LIST, PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const [snippets, templateUsage] = await Promise.all([listWhoobeOneSnippets(), listSnippetTemplateUsage()]);
    // templateUsage: snippet id -> the website templates (and slots) that place it; a snippet that is not there is used by none
    res.json({ snippets, templateUsage });
  } catch (error: any) {
    logger.error({ err: error }, 'List whoobe-one snippets error');
    res.status(500).json({ error: error.message || 'Failed to list snippets' });
  }
});

app.post('/whoobe-one/snippets', requireAnyPermission(PERMISSIONS.SNIPPETS_CREATE, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, category, icon, node, themeId, notes, locked } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || typeof category !== 'string' || !category.trim() || node == null) {
      res.status(400).json({ error: 'name, category, and node are required' });
      return;
    }

    const snippet = await createWhoobeOneSnippet({
      name: name.trim(),
      category: category.trim(),
      icon: typeof icon === 'string' ? icon : null,
      node,
      themeId: typeof themeId === 'string' ? themeId : null,
      notes: typeof notes === 'string' ? notes : null,
      locked: locked === true,
    });
    res.status(201).json({ snippet });
  } catch (error: any) {
    logger.error({ err: error }, 'Create whoobe-one snippet error');
    res.status(500).json({ error: error.message || 'Failed to create snippet' });
  }
});

// Overwrites an existing snippet in place - lets a minor tweak get saved
// back onto the snippet it came from instead of always creating a new,
// near-duplicate one (see SaveSnippetModal.vue's "Update existing" mode).
app.get('/whoobe-one/snippets/:id', requireAnyPermission(PERMISSIONS.SNIPPETS_VIEW, PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const snippet = await getWhoobeOneSnippet(req.params.id);
    if (!snippet) {
      res.status(404).json({ error: 'Snippet not found' });
      return;
    }
    res.json({ snippet });
  } catch (error: any) {
    logger.error({ err: error }, 'Get whoobe-one snippet error');
    res.status(500).json({ error: error.message || 'Failed to get snippet' });
  }
});

// Instant version history - see the equivalent /whoobe-one/pages/:id/versions
// routes' comment; same shape, scoped to this snippet's `node` instead.
app.get('/whoobe-one/snippets/:id/versions', requireAnyPermission(PERMISSIONS.SNIPPETS_VIEW, PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const versions = await listContentVersions('snippet', req.params.id);
    res.json({ versions });
  } catch (error: any) {
    logger.error({ err: error }, 'List snippet versions error');
    res.status(500).json({ error: error.message || 'Failed to list snippet versions' });
  }
});

app.get('/whoobe-one/snippets/:id/versions/:versionId', requireAnyPermission(PERMISSIONS.SNIPPETS_VIEW, PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const version = await getContentVersion(req.params.versionId);
    if (!version || version.resourceType !== 'snippet' || version.resourceId !== req.params.id) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }
    res.json({ version });
  } catch (error: any) {
    logger.error({ err: error }, 'Get snippet version error');
    res.status(500).json({ error: error.message || 'Failed to get snippet version' });
  }
});

// Renders a saved snippet's node to standalone email markup, the same way
// /mail-templates/:id/render does for a mail template - BrevoCampaignModal.vue's
// second content source (a snippet is a smaller, more likely-to-be-reused
// unit than a whole mail template for a campaign's body). Uses
// renderStaticHtml() for the same reason: no context to substitute
// against, and an ESP's own merge-tag syntax must reach it untouched.
app.post('/whoobe-one/snippets/:id/render', requireAnyPermission(PERMISSIONS.SNIPPETS_VIEW, PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const snippet = await getWhoobeOneSnippet(req.params.id);
    if (!snippet) {
      res.status(404).json({ error: 'Snippet not found' });
      return;
    }
    const embedImages = req.body?.embedImages !== false;
    res.json(await renderElementTreeForEmail(snippet.node, embedImages));
  } catch (error: any) {
    logger.error({ err: error }, 'Snippet render error');
    res.status(500).json({ error: error.message || 'Failed to render snippet' });
  }
});

app.patch('/whoobe-one/snippets/:id', requireAnyPermission(PERMISSIONS.SNIPPETS_EDIT, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, category, icon, node, themeId, notes, autosave } = req.body ?? {};
    // A locked snippet is never saved automatically: the editor's autosave leaves it alone, and a save the editor flags as
    // automatic (a second tab that still believes the snippet is unlocked, say) is refused here. A manual save goes through.
    if (autosave === true) {
      const current = await getWhoobeOneSnippet(req.params.id);
      if (current?.locked) {
        res.status(423).json({ error: 'This snippet is locked: it is not saved automatically', locked: true });
        return;
      }
    }
    // category may be empty (an uncategorised snippet), name/node required.
    if (typeof name !== 'string' || !name.trim() || typeof category !== 'string' || node == null) {
      res.status(400).json({ error: 'name, category, and node are required' });
      return;
    }

    const snippet = await updateWhoobeOneSnippet(req.params.id, {
      name: name.trim(),
      category: category.trim(),
      icon: typeof icon === 'string' ? icon : null,
      node,
      themeId: themeId !== undefined ? (typeof themeId === 'string' ? themeId : null) : undefined,
      notes: notes !== undefined ? (typeof notes === 'string' ? notes : null) : undefined,
    });
    if (!snippet) {
      res.status(404).json({ error: 'Snippet not found' });
      return;
    }
    res.json({ snippet });
  } catch (error: any) {
    logger.error({ err: error }, 'Update whoobe-one snippet error');
    res.status(500).json({ error: error.message || 'Failed to update snippet' });
  }
});

// Locks or unlocks a snippet. Locked = no autosave (see PATCH above); it is not a change of content, so no new version is kept.
app.put('/whoobe-one/snippets/:id/lock', requireAnyPermission(PERMISSIONS.SNIPPETS_EDIT, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const locked = req.body?.locked;
    if (typeof locked !== 'boolean') { res.status(400).json({ error: 'locked must be true or false' }); return; }
    const snippet = await setWhoobeOneSnippetLocked(req.params.id, locked);
    if (!snippet) { res.status(404).json({ error: 'Snippet not found' }); return; }
    res.json({ snippet });
  } catch (error: any) {
    logger.error({ err: error }, 'Lock whoobe-one snippet error');
    res.status(500).json({ error: error.message || 'Failed to lock the snippet' });
  }
});

app.put('/whoobe-one/snippets/:id/wizard-block', requireAnyPermission(PERMISSIONS.SNIPPETS_EDIT, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const block = req.body?.block;
    if (block !== null && !(typeof block === 'string' && (SNIPPET_BLOCK_TYPES as readonly string[]).includes(block))) {
      res.status(400).json({ error: `block must be null or one of: ${SNIPPET_BLOCK_TYPES.join(', ')}` });
      return;
    }
    // the name the wizard lists it under: plain text, up to 60 characters; a block of its own (custom) needs one
    const rawLabel = req.body?.label;
    const label = typeof rawLabel === 'string' ? rawLabel.trim() : '';
    if (label.length > 60 || /[<>{}\\]/.test(label)) {
      res.status(400).json({ error: 'label must be plain text of up to 60 characters' });
      return;
    }
    if (block === 'custom' && !label) {
      res.status(400).json({ error: 'a block of its own needs a name (label)' });
      return;
    }
    const snippet = await setWhoobeOneSnippetWizardBlock(req.params.id, block, label || null);
    if (!snippet) { res.status(404).json({ error: 'Snippet not found' }); return; }
    res.json({ snippet });
  } catch (error: any) {
    logger.error({ err: error }, 'Set snippet wizard block error');
    res.status(500).json({ error: error.message || 'Failed to set the wizard block' });
  }
});

app.delete('/whoobe-one/snippets/:id', requireAnyPermission(PERMISSIONS.SNIPPETS_DELETE, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    // A website template's header/footer/aside/404 slots reference snippets
    // by id (not by copy), so deleting one that's in use would silently break
    // every page rendered through that template. Refuse, and say where.
    const usage = await findTemplatesUsingSnippet(req.params.id);
    if (usage.length > 0) {
      const where = usage
        .slice(0, 5)
        .map((u) => `"${u.websiteName ?? 'unknown site'} / ${u.templateName}" (${u.slots.join(', ')})`)
        .join('; ');
      res.status(409).json({
        error: `This snippet is used by ${usage.length} website template(s): ${where}${usage.length > 5 ? `; and ${usage.length - 5} more` : ''}. Remove it from those templates first.`,
        usage,
      });
      return;
    }
    await deleteWhoobeOneSnippet(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Delete whoobe-one snippet error');
    res.status(500).json({ error: error.message || 'Failed to delete snippet' });
  }
});

// whoobe-one-spike's own "templates" (whole documents, see that app's
// README) - previously local-only, browser-IndexedDB storage; moved here
// so this editor's data lives in the same real database as everything
// else in this monorepo, ahead of integrating it for real. `path` is
// unique (whoobe-one-template-schema.ts's own index) - Postgres error code
// 23505 (unique_violation) is what a path collision actually looks like,
// surfaced as a 409 rather than a generic 500 so the UI can tell the user
// to pick a different path instead of just failing.
app.get('/whoobe-one/templates', requireAnyPermission(PERMISSIONS.PAGES_LIST, PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const templates = await listWhoobeOneTemplates();
    res.json({ templates });
  } catch (error: any) {
    logger.error({ err: error }, 'List whoobe-one templates error');
    res.status(500).json({ error: error.message || 'Failed to list templates' });
  }
});

app.get('/whoobe-one/templates/:id', requireAnyPermission(PERMISSIONS.PAGES_VIEW, PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const template = await getWhoobeOneTemplate(req.params.id);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json({ template });
  } catch (error: any) {
    logger.error({ err: error }, 'Get whoobe-one template error');
    res.status(500).json({ error: error.message || 'Failed to get template' });
  }
});

app.post('/whoobe-one/templates', requireAnyPermission(PERMISSIONS.PAGES_CREATE, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, category, path, description, node } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || typeof path !== 'string' || !path.trim() || node == null) {
      res.status(400).json({ error: 'name, path, and node are required' });
      return;
    }

    const template = await createWhoobeOneTemplate({
      name: name.trim(),
      category: typeof category === 'string' ? category : '',
      path: path.trim(),
      description: typeof description === 'string' ? description : null,
      node,
    });
    res.status(201).json({ template });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ error: `A template with path "${req.body?.path}" already exists` });
      return;
    }
    logger.error({ err: error }, 'Create whoobe-one template error');
    res.status(500).json({ error: error.message || 'Failed to create template' });
  }
});

app.patch('/whoobe-one/templates/:id', requireAnyPermission(PERMISSIONS.PAGES_EDIT, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, category, description, node } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || node == null) {
      res.status(400).json({ error: 'name and node are required' });
      return;
    }

    const template = await updateWhoobeOneTemplate(req.params.id, {
      name: name.trim(),
      category: typeof category === 'string' ? category : '',
      description: typeof description === 'string' ? description : null,
      node,
    });
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json({ template });
  } catch (error: any) {
    logger.error({ err: error }, 'Update whoobe-one template error');
    res.status(500).json({ error: error.message || 'Failed to update template' });
  }
});

app.delete('/whoobe-one/templates/:id', requireAnyPermission(PERMISSIONS.PAGES_DELETE, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    await deleteWhoobeOneTemplate(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Delete whoobe-one template error');
    res.status(500).json({ error: error.message || 'Failed to delete template' });
  }
});

// whoobe-one-spike's own "kits" (named, categorized template collections -
// see that app's README's Kits section) - same "moved from local
// IndexedDB to this real database" motivation as templates above. The
// repo's own reference kits are seeded server-side now (packages/core/src/
// db/seed.ts's seedWhoobeOneKits(), see bootstrapDatabase()) rather than
// fetched-and-imported from the client, so there's no client-facing
// "import" endpoint here at all - only real CRUD.
app.get('/whoobe-one/kits', requireAnyPermission(PERMISSIONS.SNIPPETS_LIST, PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const kits = await listWhoobeOneKits();
    res.json({ kits });
  } catch (error: any) {
    logger.error({ err: error }, 'List whoobe-one kits error');
    res.status(500).json({ error: error.message || 'Failed to list kits' });
  }
});

app.get('/whoobe-one/kits/:id', requireAnyPermission(PERMISSIONS.SNIPPETS_VIEW, PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const kit = await getWhoobeOneKit(req.params.id);
    if (!kit) {
      res.status(404).json({ error: 'Kit not found' });
      return;
    }
    res.json({ kit });
  } catch (error: any) {
    logger.error({ err: error }, 'Get whoobe-one kit error');
    res.status(500).json({ error: error.message || 'Failed to get kit' });
  }
});

app.post('/whoobe-one/kits', requireAnyPermission(PERMISSIONS.SNIPPETS_CREATE, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, category, templates } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const kit = await createWhoobeOneKit({
      name: name.trim(),
      description: typeof description === 'string' ? description : null,
      category: typeof category === 'string' ? category : '',
      templates: Array.isArray(templates) ? templates : [],
    });
    res.status(201).json({ kit });
  } catch (error: any) {
    logger.error({ err: error }, 'Create whoobe-one kit error');
    res.status(500).json({ error: error.message || 'Failed to create kit' });
  }
});

// Appends one template entry to an existing kit - a dedicated endpoint
// (rather than a generic PATCH the client would have to fetch-modify-
// write through) so the read-modify-write on `templates` happens exactly
// once, at the DB layer, not racily from the client.
app.post('/whoobe-one/kits/:id/templates', requireAnyPermission(PERMISSIONS.SNIPPETS_EDIT, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { template } = req.body ?? {};
    if (template == null) {
      res.status(400).json({ error: 'template is required' });
      return;
    }
    const current = await getWhoobeOneKit(req.params.id);
    if (current && current.origin !== 'user') {
      res.status(409).json({ error: 'This kit is read-only: duplicate it, then add the template to the copy' });
      return;
    }
    const kit = await addTemplateToWhoobeOneKit(req.params.id, template);
    if (!kit) {
      res.status(404).json({ error: 'Kit not found' });
      return;
    }
    res.json({ kit });
  } catch (error: any) {
    logger.error({ err: error }, 'Add template to whoobe-one kit error');
    res.status(500).json({ error: error.message || 'Failed to add template to kit' });
  }
});

// One template of a user's own kit: edited in the editor (its document) or renamed; or removed. A shipped kit is read-only.
app.put('/whoobe-one/kits/:id/templates/:templateId', requireAnyPermission(PERMISSIONS.SNIPPETS_EDIT, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, category, description, blocks } = req.body ?? {};
    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      res.status(400).json({ error: 'name must be a non-empty string' });
      return;
    }
    if (blocks !== undefined && (blocks === null || typeof blocks !== 'object' || Array.isArray(blocks))) {
      res.status(400).json({ error: 'blocks must be the template document (an object)' });
      return;
    }
    const current = await getWhoobeOneKit(req.params.id);
    if (!current) {
      res.status(404).json({ error: 'Kit not found' });
      return;
    }
    if (current.origin !== 'user') {
      res.status(409).json({ error: 'This kit is read-only: duplicate it, then edit the copy' });
      return;
    }
    const kit = await updateWhoobeOneKitTemplate(req.params.id, req.params.templateId, {
      name: name === undefined ? undefined : name.trim(),
      category: typeof category === 'string' ? category : undefined,
      description: typeof description === 'string' ? description : undefined,
      blocks,
    });
    if (!kit) {
      res.status(404).json({ error: 'Template not found in this kit' });
      return;
    }
    res.json({ kit });
  } catch (error: any) {
    logger.error({ err: error }, 'Update whoobe-one kit template error');
    res.status(500).json({ error: error.message || 'Failed to update the template' });
  }
});

app.delete('/whoobe-one/kits/:id/templates/:templateId', requireAnyPermission(PERMISSIONS.SNIPPETS_EDIT, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const current = await getWhoobeOneKit(req.params.id);
    if (!current) {
      res.status(404).json({ error: 'Kit not found' });
      return;
    }
    if (current.origin !== 'user') {
      res.status(409).json({ error: 'This kit is read-only: duplicate it, then edit the copy' });
      return;
    }
    const kit = await removeTemplateFromWhoobeOneKit(req.params.id, req.params.templateId);
    if (!kit) {
      res.status(404).json({ error: 'Template not found in this kit' });
      return;
    }
    res.json({ kit });
  } catch (error: any) {
    logger.error({ err: error }, 'Remove whoobe-one kit template error');
    res.status(500).json({ error: error.message || 'Failed to remove the template' });
  }
});

// Name, description and category of a user's own kit; a shipped kit is read-only (duplicate it first).
app.patch('/whoobe-one/kits/:id', requireAnyPermission(PERMISSIONS.SNIPPETS_EDIT, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, category } = req.body ?? {};
    const input: { name?: string; description?: string | null; category?: string } = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'name must be a non-empty string' });
        return;
      }
      input.name = name.trim();
    }
    if (description !== undefined) input.description = typeof description === 'string' && description.trim() ? description : null;
    if (category !== undefined) input.category = typeof category === 'string' ? category.trim() : '';
    const current = await getWhoobeOneKit(req.params.id);
    if (!current) {
      res.status(404).json({ error: 'Kit not found' });
      return;
    }
    if (current.origin !== 'user') {
      res.status(409).json({ error: 'This kit is read-only: duplicate it, then edit the copy' });
      return;
    }
    const kit = await updateWhoobeOneKitMeta(req.params.id, input);
    res.json({ kit });
  } catch (error: any) {
    logger.error({ err: error }, 'Update whoobe-one kit error');
    res.status(500).json({ error: error.message || 'Failed to update kit' });
  }
});

// A user copy of any kit (a shipped kit is read-only, this is how it is customised); the original is never changed.
app.post('/whoobe-one/kits/:id/duplicate', requireAnyPermission(PERMISSIONS.SNIPPETS_CREATE, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const kit = await duplicateWhoobeOneKit(req.params.id);
    if (!kit) {
      res.status(404).json({ error: 'Kit not found' });
      return;
    }
    res.status(201).json({ kit });
  } catch (error: any) {
    logger.error({ err: error }, 'Duplicate whoobe-one kit error');
    res.status(500).json({ error: error.message || 'Failed to duplicate kit' });
  }
});

app.delete('/whoobe-one/kits/:id', requireAnyPermission(PERMISSIONS.SNIPPETS_DELETE, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const current = await getWhoobeOneKit(req.params.id);
    if (current && current.origin !== 'user') {
      res.status(409).json({ error: 'This kit is read-only: the distribution would bring it back' });
      return;
    }
    await deleteWhoobeOneKit(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Delete whoobe-one kit error');
    res.status(500).json({ error: error.message || 'Failed to delete kit' });
  }
});

// whoobe-one-spike's own real, published website pages - see docs/plans/
// cms/whoobe-one-editor-integration-plan.md §4. Distinct from the
// `/whoobe-one/templates` routes above: templates stay a reusable
// starting-point library, pages are the CMS's actual content.
// The address other people reach the editor at, for the "copy editor link" of a page: the dashboard may be open on localhost, which nobody else can
// reach. Same source as the links in e-mails (ADMIN_PUBLIC_URL, else http://<WHOOBE_HOSTNAME>:3000); `null` when that is localhost too, so the
// dashboard says what to set instead of handing out a link that works for nobody else.
app.get('/whoobe-one/editor-base', requireAnyPermission(PERMISSIONS.PAGES_LIST, PERMISSIONS.OBJECTS_READ), (_req: Request, res: Response): void => {
  const base = (process.env.ADMIN_PUBLIC_URL || `http://${process.env.WHOOBE_HOSTNAME || 'localhost'}:3000`).replace(/\/+$/, '');
  let local = true;
  try { local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname); } catch { /* unusable value: no link */ }
  res.json({ base: local ? null : `${base}/whoobe-one` });
});

app.get('/whoobe-one/pages', requireAnyPermission(PERMISSIONS.PAGES_LIST, PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const websiteId = typeof req.query.websiteId === 'string' ? req.query.websiteId : undefined;
    const pages = await listWhoobePages(websiteId);
    res.json({ pages });
  } catch (error: any) {
    logger.error({ err: error }, 'List whoobe-one pages error');
    res.status(500).json({ error: error.message || 'Failed to list pages' });
  }
});

// Review surface for the staged migration workflow (docs/plans/cms/
// documents-migration.md §3 Phase 1 / Option B): list the rows currently
// sitting in whoobe_pages_staging - the same shape a reviewer edits later -
// without touching whoobe_pages, and delete a single staged page
// (reject/re-stage). Registered BEFORE the /whoobe-one/pages/:id GET and
// DELETE routes below so the literal "staged" segment isn't captured as an
// id (same reason /data-objects/batch precedes /data-objects/:id).
app.get('/whoobe-one/pages/staged', requireAnyPermission(PERMISSIONS.PAGES_LIST, PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const staged = await listStagedWhoobePages();
    res.json({ pages: staged });
  } catch (error: any) {
    logger.error({ err: error }, 'List staged whoobe-one pages error');
    res.status(500).json({ error: error.message || 'Failed to list staged pages' });
  }
});

app.delete(
  '/whoobe-one/pages/staged/:id',
  requireAnyPermission(PERMISSIONS.PAGES_DELETE, PERMISSIONS.OBJECTS_WRITE),
  async (req: Request, res: Response): Promise<void> => {
    try {
      await deleteStagedWhoobePage(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      logger.error({ err: error }, 'Delete staged whoobe-one page error');
      res.status(500).json({ error: error.message || 'Failed to delete staged page' });
    }
  }
);

// Promote the whole staging table into whoobe_pages - the Pages panel's own
// "review then promote" action. Source-agnostic (reads all of
// whoobe_pages_staging), unlike the migration-sources-scoped
// /migration-sources/:id/promote-documents which is the CLI-equivalent
// trigger from the Migration Sources card. Both call the same
// runPromoteDocuments.
app.post(
  '/whoobe-one/pages/staged/promote',
  requireAnyPermission(PERMISSIONS.PAGES_CREATE, PERMISSIONS.OBJECTS_WRITE),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { dryRun, clear } = req.body ?? {};
      const result = await runPromoteDocuments({
        dryRun: dryRun === true,
        clear: clear === true,
      });
      res.json({ result });
    } catch (error: any) {
      logger.error({ err: error }, 'Promote staged whoobe-one pages error');
      res.status(500).json({ error: error.message || 'Failed to promote staged pages' });
    }
  }
);

// Promote ONE staged page into whoobe_pages - the per-row "Promote" action
// in the Pages panel's Staged tab. Deliberately separate from the
// whole-table route above (and registered after it, same method+path
// prefix, different final segment) so a single-page promote never touches
// the other staged rows.
app.post(
  '/whoobe-one/pages/staged/:id/promote',
  requireAnyPermission(PERMISSIONS.PAGES_CREATE, PERMISSIONS.OBJECTS_WRITE),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { dryRun, clear } = req.body ?? {};
      const result = await runPromoteDocument({
        stagedId: req.params.id,
        dryRun: dryRun === true,
        clear: clear === true,
      });
      res.json({ result });
    } catch (error: any) {
      logger.error({ err: error }, 'Promote staged whoobe-one page error');
      res.status(500).json({ error: error.message || 'Failed to promote staged page' });
    }
  }
);

app.get('/whoobe-one/pages/:id', requireAnyPermission(PERMISSIONS.PAGES_VIEW, PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await getWhoobePage(req.params.id);
    if (!page) {
      res.status(404).json({ error: 'Page not found' });
      return;
    }
    res.json({ page });
  } catch (error: any) {
    logger.error({ err: error }, 'Get whoobe-one page error');
    res.status(500).json({ error: error.message || 'Failed to get page' });
  }
});

// Instant version history (content-versions-schema.ts) - up to the 10 most
// recent prior states of this page's `content`, snapshotted automatically
// by updateWhoobePage() on every save that actually changed it (manual or
// autosave). List omits `content` itself (can be a large tree) - the
// version-history panel fetches a specific version's full content only
// when the user opens/restores it, via the :versionId route below.
app.get('/whoobe-one/pages/:id/versions', requireAnyPermission(PERMISSIONS.PAGES_VIEW, PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const versions = await listContentVersions('page', req.params.id);
    res.json({ versions });
  } catch (error: any) {
    logger.error({ err: error }, 'List page versions error');
    res.status(500).json({ error: error.message || 'Failed to list page versions' });
  }
});

app.get('/whoobe-one/pages/:id/versions/:versionId', requireAnyPermission(PERMISSIONS.PAGES_VIEW, PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const version = await getContentVersion(req.params.versionId);
    if (!version || version.resourceType !== 'page' || version.resourceId !== req.params.id) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }
    res.json({ version });
  } catch (error: any) {
    logger.error({ err: error }, 'Get page version error');
    res.status(500).json({ error: error.message || 'Failed to get page version' });
  }
});

// Resolved website-template body slot for a page (className/style/alpine on
// the root page wrapper, WebsiteTemplateLayout.body) - the authenticated
// editor's own counterpart of the `body` field the public page routes
// already resolve (see GET /public/pages/:locale/*), so the page builder's
// canvas/editor-preview can default to matching the live site's body
// background instead of starting blank. Only the body slot is resolved
// here - the editor canvas has no use for header/aside/footer module pages.
app.get('/whoobe-one/pages/:id/layout', requireAnyPermission(PERMISSIONS.PAGES_VIEW, PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await getWhoobePage(req.params.id);
    if (!page) {
      res.status(404).json({ error: 'Page not found' });
      return;
    }
    if (!page.websiteId) {
      res.json({ body: null });
      return;
    }
    const template = await getWebsiteTemplateForPath(page.websiteId, page.slug, page.locale);
    const bodySlot = template?.layout?.body;
    const body = bodySlot ? { className: bodySlot.className ?? '', style: bodySlot.style ?? '', alpine: bodySlot.alpine ?? {} } : null;
    res.json({ body });
  } catch (error: any) {
    logger.error({ err: error }, 'Get page layout body error');
    res.status(500).json({ error: error.message || 'Failed to get page layout' });
  }
});

// Renders a page's content to standalone email markup - BrevoCampaignModal.vue's
// third content source, alongside mail templates and snippets. Same
// renderStaticHtml() pipeline/reasoning as those two: no trigger context to
// substitute against, and an ESP's own merge-tag syntax must survive
// untouched. Deliberately renders whatever `content` holds regardless of
// `kind` ('content'/'module'/'app') - a genuinely nonsensical source (an
// app-kind page with no static markup) just renders to near-empty HTML
// rather than needing a special-cased rejection here.
app.post('/whoobe-one/pages/:id/render', requireAnyPermission(PERMISSIONS.PAGES_VIEW, PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await getWhoobePage(req.params.id);
    if (!page) {
      res.status(404).json({ error: 'Page not found' });
      return;
    }
    const embedImages = req.body?.embedImages !== false;
    res.json(await renderElementTreeForEmail(page.content, embedImages));
  } catch (error: any) {
    logger.error({ err: error }, 'Page render error');
    res.status(500).json({ error: error.message || 'Failed to render page' });
  }
});

// Every locale variant of the same logical page (see the integration
// plan §4 on `translationGroupId`) - for a translations picker/switcher,
// not part of the plain CRUD set above.
app.get(
  '/whoobe-one/pages/:id/translations',
  requireAnyPermission(PERMISSIONS.PAGES_VIEW, PERMISSIONS.OBJECTS_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const page = await getWhoobePage(req.params.id);
    if (!page) {
      res.status(404).json({ error: 'Page not found' });
      return;
    }
      const translations = await listWhoobePageTranslations(page.translationGroupId);
      res.json({ translations });
    } catch (error: any) {
      logger.error({ err: error }, 'List whoobe-one page translations error');
      res.status(500).json({ error: error.message || 'Failed to list page translations' });
    }
  }
);

// AI page translation - creates a new locale variant of an existing page
// (same translationGroupId, so it shows up alongside it in the
// translations picker) by asking the configured AI provider to translate
// its title + Element tree content. Gated on OBJECTS_WRITE like page
// creation, since a successful call does create a page row. The new page
// always lands unpublished (createWhoobePage's own default) so an editor
// reviews/edits it like any other draft before it goes live - translation
// quality isn't guaranteed, this just gets a first draft into the same
// page/publish workflow every other page already goes through.
app.post(
  '/whoobe-one/pages/:id/translate',
  requireAnyPermission(PERMISSIONS.PAGES_EDIT, PERMISSIONS.OBJECTS_WRITE),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { locale } = req.body ?? {};
    if (typeof locale !== 'string' || !locale.trim()) {
      res.status(400).json({ error: 'locale is required' });
      return;
    }
    const targetLocale = locale.trim();

    let source;
    try {
      source = await getWhoobePage(req.params.id);
    } catch (error: any) {
      logger.error({ err: error }, 'Translate whoobe-one page lookup error');
      res.status(500).json({ error: error.message || 'Failed to load page' });
      return;
    }
    if (!source) {
      res.status(404).json({ error: 'Page not found' });
      return;
    }
    if (targetLocale === source.locale) {
      res.status(400).json({ error: `Page is already in locale "${targetLocale}"` });
      return;
    }
    const existingTranslations = await listWhoobePageTranslations(source.translationGroupId);
    if (existingTranslations.some((p) => p.locale === targetLocale)) {
      res.status(409).json({ error: `A translation into "${targetLocale}" already exists for this page` });
      return;
    }

    // Resolve translation AI settings: use the dedicated translate-specific
    // config if one is set, else fall back to the shared text AI config -
    // same fallback shape as /ai/generate-image. A dedicated slot exists
    // because translation and generation have different reliability
    // profiles on the same free/small models (see this route's own CHANGES.md
    // entries: the same model that produced malformed/empty output while
    // being asked to reproduce a whole Element tree can still be a fine
    // choice for page generation, and a user may want a different, more
    // translation-reliable free model without touching that config).
    let translateSettings = await getAiTranslateSettings(req.user!.id);
    if (!translateSettings || !translateSettings.apiKey) {
      const textSettings = await getAiSettings(req.user!.id);
      if (!textSettings || !textSettings.apiKey) {
        res.status(400).json({ error: 'AI is not configured. Save a provider, model, and API key in Settings → AI (or Settings → AI Translation) first.' });
        return;
      }
      translateSettings = { ...textSettings };
    }
    // Re-shaped into a plain, non-nullable object so translateBatch()'s
    // closure below doesn't lose the null-check narrowing TypeScript
    // doesn't carry across nested function boundaries for the original.
    const aiSettings = { provider: translateSettings.provider, model: translateSettings.model, endpoint: translateSettings.endpoint, apiKey: translateSettings.apiKey };

    // Only the page's actual text round-trips through the model - every
    // other field (ids, css, nesting, ...) is restored by our own code
    // afterward via applyTranslatedStrings, never re-typed by the LLM (see
    // collectTranslatableStrings' own comment: sending the whole tree
    // reliably got truncated/invalid JSON back on any non-trivial page).
    // Also batched - a page with hundreds of text nodes would still make
    // for a large single prompt even as {id, text} pairs.
    const TITLE_ID = '__page_title__';
    const allStrings = [
      { id: TITLE_ID, text: source.title },
      ...collectTranslatableStrings(source.content as Record<string, unknown>),
    ];
    const TRANSLATE_BATCH_SIZE = 40;

    // Plain-text block format, not JSON (raw: true skips parseJsonText()
    // entirely - see buildTranslateUserPrompt/parseTranslatedBlocks' own
    // comments): asking the model to balance braces/quotes/escaping around
    // dozens of arbitrary translated strings was a real, repeated source
    // of invalid-JSON and even outright empty responses (some free/small
    // models appear to buckle on structured output for this particular
    // task). Still retries with feedback (same pattern as
    // /ai/generate-website-structure below) for the remaining failure
    // modes this doesn't eliminate on its own - a genuinely empty reply,
    // or the model dropping/renumbering a block.
    async function translateBatch(batch: TranslatableString[]): Promise<Record<string, string>> {
      let lastError = '';
      let lastRaw = '';
      const basePrompt = buildTranslateUserPrompt({ targetLocale, strings: batch });
      for (let attempt = 1; attempt <= 3; attempt++) {
        const prompt = attempt === 1
          ? basePrompt
          : `Your previous answer was rejected for this reason:\n${lastError}\n\nYour previous output (start):\n${lastRaw.substring(0, 1500)}\n\nOutput ONLY the corrected, complete reply in the exact format requested below - every "@@id@@" marker present, same order, no JSON, no markdown fences, no explanations:\n\n${basePrompt}`;
        try {
          const result = await generateAiJson({
            settings: aiSettings,
            systemPrompt: buildTranslateSystemPrompt(),
            userPrompt: prompt,
            maxTokens: 4096,
            raw: true,
          });
          lastRaw = typeof result.json === 'string' ? result.json : (result.rawText || '');
          if (!lastRaw.trim()) {
            lastError = 'The AI provider returned an empty response for this batch.';
            if (attempt === 3) {
              await createAiGenerated({
                kind: 'page-translation', prompt, provider: aiSettings.provider, model: aiSettings.model,
                rawResponse: lastRaw, status: 'error', error: lastError, createdBy: req.user?.id ?? null,
              });
              throw new AiGenerationError(
                `${lastError} Try a different model in Settings → AI - some free or smaller models struggle with this task.`
              );
            }
            continue;
          }
          const parsed = parseTranslatedBlocks(lastRaw);
          const missing = batch.filter((s) => typeof parsed[s.id] !== 'string' || !parsed[s.id].trim());
          if (missing.length > 0) {
            lastError = `Response is missing translations for ${missing.length} of ${batch.length} block(s).`;
            if (attempt === 3) {
              // A partial batch degrades gracefully - keep whatever the
              // model did translate rather than discarding the batch
              // entirely; applyTranslatedStrings() falls back to each
              // untranslated node's original text for the rest.
              await createAiGenerated({
                kind: 'page-translation', prompt, provider: aiSettings.provider, model: aiSettings.model,
                payload: parsed, rawResponse: lastRaw, status: missing.length === batch.length ? 'error' : 'success',
                error: missing.length === batch.length ? lastError : null, createdBy: req.user?.id ?? null,
              });
              return parsed;
            }
            continue;
          }
          await createAiGenerated({
            kind: 'page-translation', prompt, provider: aiSettings.provider, model: aiSettings.model,
            payload: parsed, rawResponse: lastRaw, status: 'success', createdBy: req.user?.id ?? null,
          });
          return parsed;
        } catch (error: any) {
          const message = error instanceof AiGenerationError ? error.message : (error?.message || 'AI translation failed');
          lastError = message;
          if (attempt === 3) {
            try {
              await createAiGenerated({
                kind: 'page-translation', prompt, provider: aiSettings.provider, model: aiSettings.model,
                rawResponse: lastRaw, status: 'error', error: message, createdBy: req.user?.id ?? null,
              });
            } catch (logError) {
              logger.error({ err: logError }, 'AI translation audit log write error');
            }
            throw error instanceof AiGenerationError ? error : new AiGenerationError(message);
          }
        }
      }
      throw new AiGenerationError(lastError || 'AI translation failed');
    }

    const translations: Record<string, string> = {};
    try {
      for (let i = 0; i < allStrings.length; i += TRANSLATE_BATCH_SIZE) {
        Object.assign(translations, await translateBatch(allStrings.slice(i, i + TRANSLATE_BATCH_SIZE)));
      }
    } catch (error: any) {
      const message = error instanceof AiGenerationError ? error.message : (error?.message || 'AI translation failed');
      const status = error instanceof AiGenerationError && error.status ? error.status : 500;
      res.status(status).json({ error: message });
      return;
    }

    const translatedTitle = translations[TITLE_ID]?.trim() || source.title;
    const translatedContent = applyTranslatedStrings(source.content, translations);

    try {
      const page = await createWhoobePage({
        translationGroupId: source.translationGroupId,
        locale: targetLocale,
        slug: source.slug,
        title: translatedTitle,
        category: source.category,
        kind: source.kind,
        content: translatedContent,
        seo: source.seo,
        sitemap: source.sitemap,
        search: source.search,
        websiteId: source.websiteId,
        themeId: source.themeId,
      });
      res.status(201).json({ page });
    } catch (error: any) {
      if (error?.code === '23505') {
        res.status(409).json({ error: `A page with slug "${source.slug}" already exists for locale "${targetLocale}"` });
        return;
      }
      logger.error({ err: error }, 'Translate whoobe-one page create error');
      res.status(500).json({ error: error.message || 'Failed to create translated page' });
    }
  }
);

app.post('/whoobe-one/pages', requireAnyPermission(PERMISSIONS.PAGES_CREATE, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { translationGroupId, locale, slug, title, category, kind, content, seo, sitemap, search, pimcoreId, path, websiteId, themeId } = req.body ?? {};
    if (typeof slug !== 'string' || !slug.trim() || typeof title !== 'string' || !title.trim() || content == null) {
      res.status(400).json({ error: 'slug, title, and content are required' });
      return;
    }

    let bindingWarnings: { nodeId: string; reason: string }[] = [];
    if (typeof websiteId === 'string' && websiteId) {
      const bound = await bindPageGatewayContent(content, websiteId);
      bindingWarnings = bound.warnings;
    }

    const page = await createWhoobePage({
      translationGroupId: typeof translationGroupId === 'string' ? translationGroupId : undefined,
      locale: typeof locale === 'string' ? locale : undefined,
      slug: slug.trim(),
      title: title.trim(),
      category: typeof category === 'string' ? category : undefined,
      kind: kind === 'module' ? 'module' : kind === 'app' ? 'app' : 'content',
      content,
      seo: seo ?? null,
      sitemap: sitemap ?? null,
      search: search ?? null,
      pimcoreId: typeof pimcoreId === 'string' ? pimcoreId : null,
      path: typeof path === 'string' ? path : null,
      websiteId: typeof websiteId === 'string' ? websiteId : null,
      themeId: typeof themeId === 'string' ? themeId : null,
    });
    res.status(201).json({ page, gatewayBindingWarnings: bindingWarnings.length ? bindingWarnings : undefined });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ error: `A page with slug "${req.body?.slug}" already exists for this locale` });
      return;
    }
    logger.error({ err: error }, 'Create whoobe-one page error');
    res.status(500).json({ error: error.message || 'Failed to create page' });
  }
});

// Publishing is a separate permission (objects:publish): holding objects:write must not be enough to put
// content live. Only a CHANGE of the flag needs it - an editor saving an already-published page keeps working.
// Escape hatch for installations that relied on the old behaviour: ENFORCE_PUBLISH_PERMISSION=false.
function mayChangePublished(req: Request, current: boolean | undefined, requested: unknown): boolean {
  if (typeof requested !== 'boolean' || requested === current) return true;
  if (process.env.ENFORCE_PUBLISH_PERMISSION === 'false') return true;
  return !!(req as AuthenticatedRequest).user?.permissions?.includes(PERMISSIONS.OBJECTS_PUBLISH);
}

// `?editor=true` on the public page routes returns the raw page (gateway endpoint names, routes and filters
// included, SEO templates unresolved). That is for the editor preview: it needs a valid session.
async function isEditorRequest(req: Request): Promise<boolean> {
  if (req.query.editor !== 'true') return false;
  return !!(await validateSessionToken(req.cookies?.[SESSION_COOKIE_NAME]));
}

// `?draft=true` on the public page routes also finds the pages that are not published yet, so the dashboard can preview a website
// before it is published. Only for a valid session (like `editor=true`): the public never sees a draft, and the answer is not cached.
async function isDraftPreviewRequest(req: Request): Promise<boolean> {
  if (req.query.draft !== 'true') return false;
  return !!(await validateSessionToken(req.cookies?.[SESSION_COOKIE_NAME]));
}

const PUBLISH_DENIED = { error: 'Publishing requires the objects:publish permission' };

app.patch('/whoobe-one/pages/:id', requireAnyPermission(PERMISSIONS.PAGES_EDIT, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { slug, title, category, kind, published, workflowState, content, locale, path, websiteId, themeId, seo, sitemap, search } = req.body ?? {};

    if (typeof published === 'boolean') {
      const existing = await getWhoobePage(req.params.id);
      if (existing && !mayChangePublished(req, existing.published, published)) {
        res.status(403).json(PUBLISH_DENIED);
        return;
      }
    }

    let bindingWarnings: { nodeId: string; reason: string }[] = [];
    if (content !== undefined) {
      const effectiveWebsiteId = typeof websiteId === 'string' && websiteId
        ? websiteId
        : (await getWhoobePage(req.params.id))?.websiteId ?? null;
      if (effectiveWebsiteId) {
        const bound = await bindPageGatewayContent(content, effectiveWebsiteId);
        bindingWarnings = bound.warnings;
      }
    }

    const page = await updateWhoobePage(req.params.id, {
      slug: typeof slug === 'string' ? slug : undefined,
      title: typeof title === 'string' ? title : undefined,
      category: typeof category === 'string' ? category : undefined,
      kind: kind === 'module' ? 'module' : kind === 'app' ? 'app' : kind === 'content' ? 'content' : undefined,
      published: typeof published === 'boolean' ? published : undefined,
      workflowState: workflowState === null || typeof workflowState === 'string' ? workflowState : undefined,
      content: content !== undefined ? content : undefined,
      locale: typeof locale === 'string' ? locale : undefined,
      path: path === null || typeof path === 'string' ? path : undefined,
      websiteId: websiteId === null || typeof websiteId === 'string' ? websiteId : undefined,
      themeId: themeId === null || typeof themeId === 'string' ? themeId : undefined,
      seo: seo !== undefined ? seo : undefined,
      sitemap: sitemap !== undefined ? sitemap : undefined,
      search: search !== undefined ? search : undefined,
    }, { actor: eventActorOf(req) });
    if (!page) {
      res.status(404).json({ error: 'Page not found' });
      return;
    }
    res.json({ page, gatewayBindingWarnings: bindingWarnings.length ? bindingWarnings : undefined });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ error: `A page with slug "${req.body?.slug}" already exists for this locale` });
      return;
    }
    logger.error({ err: error }, 'Update whoobe-one page error');
    res.status(500).json({ error: error.message || 'Failed to update page' });
  }
});

// Thumbnail capture (editor preview's "Capture thumbnail" button): a small
// WebP data URL, or null to clear. Dedicated endpoints so a thumbnail-only
// update never goes through the content-versioning of the main PATCH routes.
const MAX_THUMBNAIL_CHARS = 400_000;
function parseThumbnail(body: any): { ok: true; value: string | null } | { ok: false } {
  const t = body?.thumbnail;
  if (t === null) return { ok: true, value: null };
  if (typeof t === 'string' && /^data:image\/(webp|png|jpeg);base64,/.test(t) && t.length <= MAX_THUMBNAIL_CHARS) return { ok: true, value: t };
  return { ok: false };
}

app.put('/whoobe-one/snippets/:id/thumbnail', requireAnyPermission(PERMISSIONS.SNIPPETS_EDIT, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = parseThumbnail(req.body);
    if (!parsed.ok) { res.status(400).json({ error: 'thumbnail must be null or an image data URL under 400k chars' }); return; }
    if (!(await setWhoobeOneSnippetThumbnail(req.params.id, parsed.value))) { res.status(404).json({ error: 'Snippet not found' }); return; }
    res.json({ ok: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Set snippet thumbnail error');
    res.status(500).json({ error: error.message || 'Failed to set thumbnail' });
  }
});

app.put('/whoobe-one/pages/:id/thumbnail', requireAnyPermission(PERMISSIONS.PAGES_EDIT, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = parseThumbnail(req.body);
    if (!parsed.ok) { res.status(400).json({ error: 'thumbnail must be null or an image data URL under 400k chars' }); return; }
    if (!(await setWhoobePageThumbnail(req.params.id, parsed.value))) { res.status(404).json({ error: 'Page not found' }); return; }
    res.json({ ok: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Set page thumbnail error');
    res.status(500).json({ error: error.message || 'Failed to set thumbnail' });
  }
});

app.delete('/whoobe-one/pages/:id', requireAnyPermission(PERMISSIONS.PAGES_DELETE, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    await deleteWhoobePage(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Delete whoobe-one page error');
    res.status(500).json({ error: error.message || 'Failed to delete page' });
  }
});

// --- Websites ---
app.get('/whoobe-one/websites', requireAnyPermission(PERMISSIONS.WEBSITES_LIST, PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await listWebsites();
    res.json({ websites: result });
  } catch (error: any) {
    logger.error({ err: error }, 'List websites error');
    res.status(500).json({ error: error.message || 'Failed to list websites' });
  }
});

app.post('/whoobe-one/websites', requireAnyPermission(PERMISSIONS.WEBSITES_CREATE, PERMISSIONS.OBJECTS_WRITE), audited(AUDIT.websiteCreate), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, rootPath, domains, defaultLocale, supportedLocales, settings, themeId } = req.body ?? {};
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const rp = typeof rootPath === 'string' ? rootPath.trim() : `/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    if (!/^\/[a-z0-9_-]+$/.test(rp)) {
      res.status(400).json({ error: 'rootPath must start with / and contain only lowercase letters, digits, hyphens, or underscores' });
      return;
    }
    if (isReservedRootPath(rp)) {
      res.status(400).json({ error: `rootPath "${rp}" is a name the host answers to itself (dashboard, editor or API); choose another` });
      return;
    }
    const existingByPath = await getWebsiteByRootPath(rp);
    if (existingByPath) {
      res.status(409).json({ error: `rootPath "${rp}" is already taken` });
      return;
    }
    const website = await createWebsite({
      name,
      rootPath: rp,
      domains: Array.isArray(domains) ? domains : undefined,
      defaultLocale: typeof defaultLocale === 'string' ? defaultLocale : undefined,
      supportedLocales: Array.isArray(supportedLocales) ? supportedLocales : undefined,
      settings: settings !== undefined ? settings : undefined,
      themeId: typeof themeId === 'string' ? themeId : null,
    });
    siteRootCache.clear();
    res.status(201).json({ website });
  } catch (error: any) {
    logger.error({ err: error }, 'Create website error');
    res.status(500).json({ error: error.message || 'Failed to create website' });
  }
});

// Generates (or rotates) a website's Gateway API key - the plaintext is
// returned exactly once and never stored (only its hash is) - see docs/
// plans/api-gateway/gateway-auth-authz.md. Overwrites any previous key,
// immediately invalidating it for any already-deployed site still using it.
app.post('/whoobe-one/websites/:id/gateway-api-key/regenerate', requireAnyPermission(PERMISSIONS.WEBSITES_EDIT, PERMISSIONS.OBJECTS_WRITE), audited(AUDIT.websiteKeyRegenerate), async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await setWebsiteGatewayApiKey(req.params.id);
    if (!result) {
      res.status(404).json({ error: 'Website not found' });
      return;
    }
    res.json({ key: result.plaintext, prefix: result.prefix });
  } catch (error: any) {
    logger.error({ err: error }, 'Regenerate website gateway API key error');
    res.status(500).json({ error: error.message || 'Failed to regenerate key' });
  }
});

app.delete('/whoobe-one/websites/:id/gateway-api-key', requireAnyPermission(PERMISSIONS.WEBSITES_EDIT, PERMISSIONS.OBJECTS_WRITE), audited(AUDIT.websiteKeyClear), async (req: Request, res: Response): Promise<void> => {
  try {
    await clearWebsiteGatewayApiKey(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Clear website gateway API key error');
    res.status(500).json({ error: error.message || 'Failed to clear key' });
  }
});

// Default image placeholder — a pimcorePath pointing to a DAM asset used as
// the default placeholder for newly-created image elements. Stored in the
// first website's settings JSONB for simplicity (no separate table needed).
app.get('/whoobe-one/settings/default-placeholder-image', requirePermission(PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const all = await listWebsites();
    const first = all[0];
    const path = first?.settings && typeof first.settings === 'object' && !Array.isArray(first.settings)
      ? (first.settings as Record<string, unknown>).defaultPlaceholderImage
      : null;
    res.json({ pimcorePath: typeof path === 'string' ? path : null });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to read default placeholder' });
  }
});

app.put('/whoobe-one/settings/default-placeholder-image', requirePermission(PERMISSIONS.OBJECTS_WRITE), audited(AUDIT.settingPlaceholder), async (req: Request, res: Response): Promise<void> => {
  try {
    const { pimcorePath } = req.body ?? {};
    const all = await listWebsites();
    if (!all.length) { res.status(404).json({ error: 'No website found' }); return; }
    const first = all[0];
    const settings = { ...(first.settings as Record<string, unknown> ?? {}), defaultPlaceholderImage: typeof pimcorePath === 'string' ? pimcorePath : null };
    await updateWebsite(first.id, { settings });
    res.json({ pimcorePath: typeof pimcorePath === 'string' ? pimcorePath : null });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to save default placeholder' });
  }
});

// No auth guard (unlike the other /whoobe-one/settings/* GETs): this value
// also needs to be readable by anonymous visitors of the live public page
// (whoobe-one-spike's PublicPage.vue, which doubles as the admin's Page
// Preview iframe target - see PagePreviewTab.vue), not just logged-in
// editor users.
app.get('/whoobe-one/settings/strip-html-comments', async (_req: Request, res: Response): Promise<void> => {
  try {
    const all = await listWebsites();
    const first = all[0];
    const value = first?.settings && typeof first.settings === 'object' && !Array.isArray(first.settings)
      ? (first.settings as Record<string, unknown>).stripHtmlComments
      : null;
    res.json({ enabled: typeof value === 'boolean' ? value : false });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to read HTML comment stripping setting' });
  }
});

app.put('/whoobe-one/settings/strip-html-comments', requirePermission(PERMISSIONS.OBJECTS_WRITE), audited(AUDIT.settingStripHtml), async (req: Request, res: Response): Promise<void> => {
  try {
    const { enabled } = req.body ?? {};
    const all = await listWebsites();
    if (!all.length) { res.status(404).json({ error: 'No website found' }); return; }
    const first = all[0];
    const settings = { ...(first.settings as Record<string, unknown> ?? {}), stripHtmlComments: !!enabled };
    await updateWebsite(first.id, { settings });
    res.json({ enabled: !!enabled });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to save HTML comment stripping setting' });
  }
});

// No auth guard on GET, same reasoning as strip-html-comments above: every
// backend service (core-api, gateway, asset-processor) reads this directly
// via isLoggingEnabled() to decide whether to mute its own logger, so it
// can't be gated behind an admin session.
app.get('/whoobe-one/settings/logging', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json({ enabled: await isLoggingEnabled() });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to read logging setting' });
  }
});

app.put('/whoobe-one/settings/logging', requirePermission(PERMISSIONS.OBJECTS_WRITE), audited(AUDIT.settingLogging), async (req: Request, res: Response): Promise<void> => {
  try {
    const { enabled } = req.body ?? {};
    const all = await listWebsites();
    if (!all.length) { res.status(404).json({ error: 'No website found' }); return; }
    const first = all[0];
    const settings = { ...(first.settings as Record<string, unknown> ?? {}), logging: { enabled: !!enabled } };
    await updateWebsite(first.id, { settings });
    res.json({ enabled: !!enabled });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to save logging setting' });
  }
});

app.get('/whoobe-one/settings/autosave', requirePermission(PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const all = await listWebsites();
    const first = all[0];
    const raw = first?.settings && typeof first.settings === 'object' && !Array.isArray(first.settings)
      ? (first.settings as Record<string, unknown>).autosave
      : null;
    const autosave = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    res.json({
      enabled: typeof autosave.enabled === 'boolean' ? autosave.enabled : false,
      interval: typeof autosave.interval === 'number' ? autosave.interval : 60,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to read autosave settings' });
  }
});

app.put('/whoobe-one/settings/autosave', requirePermission(PERMISSIONS.OBJECTS_WRITE), audited(AUDIT.settingAutosave), async (req: Request, res: Response): Promise<void> => {
  try {
    const { enabled, interval } = req.body ?? {};
    const all = await listWebsites();
    if (!all.length) { res.status(404).json({ error: 'No website found' }); return; }
    const first = all[0];
    const clampedInterval = Math.max(10, Math.min(600, Math.round(Number(interval) || 60)));
    const nextAutosave = { enabled: !!enabled, interval: clampedInterval };
    const settings = { ...(first.settings as Record<string, unknown> ?? {}), autosave: nextAutosave };
    await updateWebsite(first.id, { settings });
    res.json(nextAutosave);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to save autosave settings' });
  }
});

// Alpine presets (docs/release/content/alpine-presets.md): named sets of Alpine directives that an administrator defines
// once and applies to any element from the editor's AlpineJS panel. Installation-wide, stored in the first
// website's settings like the other values here. Applying a preset copies its directives into the element, so pages
// never depend on this catalog at render time. Reading needs `objects:read`, writing `objects:write` (an editor can
// already put any directive on any element, so this adds no power); the catalog is validated for shape and size.
app.get('/whoobe-one/settings/alpine-presets', requirePermission(PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const first = (await listWebsites())[0];
    const settings = first?.settings && typeof first.settings === 'object' && !Array.isArray(first.settings) ? first.settings as Record<string, unknown> : {};
    res.json({ presets: readAlpinePresets(settings.alpinePresets) });
  } catch (error: any) {
    logger.error({ err: error }, 'Read Alpine presets error');
    res.status(500).json({ error: 'Failed to read Alpine presets' });
  }
});

app.put('/whoobe-one/settings/alpine-presets', requirePermission(PERMISSIONS.OBJECTS_WRITE), audited(AUDIT.settingAlpinePresets), async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = normalizeAlpinePresets(req.body?.presets);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    const first = (await listWebsites())[0];
    if (!first) { res.status(404).json({ error: 'No website found' }); return; }
    const settings = { ...(first.settings as Record<string, unknown> ?? {}), alpinePresets: parsed.presets };
    await updateWebsite(first.id, { settings });
    res.json({ presets: parsed.presets });
  } catch (error: any) {
    logger.error({ err: error }, 'Save Alpine presets error');
    res.status(500).json({ error: 'Failed to save Alpine presets' });
  }
});

// CDN mirroring settings (docs/plans/assets/assets-cdn.md, docs/plans/assets/cdn-providers-plan.md): per website, with the installation's default as the
// fallback; the provider decides which fields exist (Cloudinary: a Gateway route and a preset; Cloudflare Images: an account id and an API token, which is
// stored encrypted and never returned). Reading is for anybody who can read objects (the Assets action needs to know whether mirroring is set up);
// changing it, which can hold a credential, needs settings:manage.
/** The CDN provider that applies to a website (its own settings, else the default), so a page is served with the mirror of THAT provider when an asset has several. */
async function cdnProviderOf(websiteId: string | null | undefined): Promise<string | null> {
  try {
    const r = await resolveCdnMirror(websiteId);
    return r.scope === 'none' ? null : r.provider;
  } catch {
    return null;
  }
}

const cdnScope = (req: Request): string | null => {
  const v = req.body?.websiteId ?? req.query.websiteId;
  return typeof v === 'string' && v && v !== 'default' ? v : null;
};

app.get('/whoobe-one/settings/cdn-providers', requirePermission(PERMISSIONS.OBJECTS_READ), (_req: Request, res: Response): void => {
  res.json({ providers: CDN_PROVIDERS });
});

app.get('/whoobe-one/settings/cdn-mirror', requirePermission(PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const websiteId = cdnScope(req);
    const resolved = await resolveCdnMirror(websiteId);
    const view = publicCdnMirror(resolved);
    const own = websiteId ? !!(await getOwnCdnMirror(websiteId)) : resolved.scope === 'default';
    res.json({
      ...view,
      /** this website has settings of its own (false: it uses the default, or nothing is set) */
      own,
      // the keys the publish sync script has always read (Cloudinary values; null for another provider)
      gatewayRouteId: resolved.provider === 'cloudinary' ? resolved.config.gatewayRouteId ?? null : null,
      uploadPreset: resolved.provider === 'cloudinary' ? resolved.config.uploadPreset ?? null : null,
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Read CDN mirror settings error');
    res.status(500).json({ error: 'Failed to read CDN mirror settings' });
  }
});

app.put('/whoobe-one/settings/cdn-mirror', requirePermission(PERMISSIONS.SETTINGS_MANAGE), audited(AUDIT.cdnMirrorUpdate), async (req: Request, res: Response): Promise<void> => {
  try {
    const websiteId = cdnScope(req);
    if (websiteId && !(await getWebsite(websiteId))) { res.status(404).json({ error: 'Website not found' }); return; }
    // the old body (gatewayRouteId, uploadPreset, provider) is Cloudinary's, for the default
    const body = req.body ?? {};
    const input = typeof body.config === 'object' && body.config !== null ? body : { provider: 'cloudinary', config: { gatewayRouteId: body.gatewayRouteId ?? '', uploadPreset: body.uploadPreset ?? '' } };
    const valid = validateCdnSettings(input);
    if (!valid.ok) { res.status(400).json({ error: valid.error }); return; }
    const saved = await saveCdnMirror(websiteId, valid);
    res.json({ ...publicCdnMirror(saved), own: true, gatewayRouteId: saved.provider === 'cloudinary' ? saved.config.gatewayRouteId ?? null : null, uploadPreset: saved.provider === 'cloudinary' ? saved.config.uploadPreset ?? null : null });
  } catch (error: any) {
    logger.error({ err: error }, 'Save CDN mirror settings error');
    res.status(500).json({ error: 'Failed to save CDN mirror settings' });
  }
});

// A website's own settings go: it uses the default again. Without a website, the default itself goes.
app.delete('/whoobe-one/settings/cdn-mirror', requirePermission(PERMISSIONS.SETTINGS_MANAGE), audited(AUDIT.cdnMirrorRemove), async (req: Request, res: Response): Promise<void> => {
  try {
    res.json({ removed: await deleteCdnMirror(cdnScope(req)) });
  } catch (error: any) {
    logger.error({ err: error }, 'Remove CDN mirror settings error');
    res.status(500).json({ error: 'Failed to remove CDN mirror settings' });
  }
});

// Checks the settings that apply to a website: Cloudflare Images with a read call (the account and the token), the CDN in front of this installation with a request
// for a public file through it, Cloudinary that its Gateway route exists. Uploads nothing.
app.post('/whoobe-one/settings/cdn-mirror/test', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const resolved = await resolveCdnMirror(cdnScope(req));
    if (!cdnMirrorConfigured(resolved)) {
      res.json({ ok: false, error: resolved.scope === 'none' ? 'Nothing is set up yet' : `Missing: ${missingCdnFields(resolved.provider, resolved.config, resolved.secretsSet).join(', ')}` });
      return;
    }
    if (resolved.provider === 'cloudflare-images') {
      res.json(await testCloudflareImages(resolved.config.accountId, resolved.secrets.apiToken, {
        apiBase: resolved.config.apiBase || undefined,
        fetch: async (url, init) => {
          const r = await safeFetch(url, { method: init.method, headers: init.headers, body: init.body }, { maxBytes: 256 * 1024, timeoutMs: 15_000 });
          return { status: r.status, json: () => r.json() };
        },
      }));
      return;
    }
    if (resolved.provider === 'cdn-origin') {
      const sample = await getSamplePublicAsset();
      res.json(await testOriginCdn(resolved.config.baseUrl, sample && { s3Key: sample.s3Key, version: sample.version, mimeType: sample.mimeType, isPublic: sample.isPublic }, {
        head: async (url) => {
          const r = await safeFetch(url, { method: 'HEAD' }, { maxBytes: 64 * 1024, timeoutMs: 15_000 });
          return { status: r.status, contentType: r.headers.get('content-type') };
        },
      }));
      return;
    }
    const route = await getGatewayRoute(resolved.config.gatewayRouteId);
    res.json(route ? { ok: true } : { ok: false, error: 'The Gateway route is not there any more: choose another one' });
  } catch (error: any) {
    logger.error({ err: error }, 'Test CDN mirror settings error');
    res.status(500).json({ error: 'The test failed' });
  }
});

app.get('/whoobe-one/websites/:id', requireAnyPermission(PERMISSIONS.WEBSITES_VIEW, PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const website = await getWebsite(req.params.id);
    if (!website) {
      res.status(404).json({ error: 'Website not found' });
      return;
    }
    res.json({ website });
  } catch (error: any) {
    logger.error({ err: error }, 'Get website error');
    res.status(500).json({ error: error.message || 'Failed to get website' });
  }
});

app.patch('/whoobe-one/websites/:id', requireAnyPermission(PERMISSIONS.WEBSITES_EDIT, PERMISSIONS.OBJECTS_WRITE), audited(AUDIT.websiteUpdate), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, rootPath, domains, defaultLocale, supportedLocales, settings, themeId, pwaEnabled, pwaConfig } = req.body ?? {};
    if (rootPath !== undefined) {
      if (typeof rootPath !== 'string' || !/^\/[a-z0-9_-]+$/.test(rootPath)) {
        res.status(400).json({ error: 'rootPath must start with / and contain only lowercase letters, digits, hyphens, or underscores' });
        return;
      }
      if (isReservedRootPath(rootPath)) {
        res.status(400).json({ error: `rootPath "${rootPath}" is a name the host answers to itself (dashboard, editor or API); choose another` });
        return;
      }
      const existingByPath = await getWebsiteByRootPath(rootPath);
      if (existingByPath && existingByPath.id !== req.params.id) {
        res.status(409).json({ error: `rootPath "${rootPath}" is already taken` });
        return;
      }
    }
    const website = await updateWebsite(req.params.id, {
      name: typeof name === 'string' ? name : undefined,
      rootPath: rootPath !== undefined ? rootPath : undefined,
      domains: Array.isArray(domains) ? domains : undefined,
      defaultLocale: typeof defaultLocale === 'string' ? defaultLocale : undefined,
      supportedLocales: Array.isArray(supportedLocales) ? supportedLocales : undefined,
      settings: settings !== undefined ? settings : undefined,
      themeId: themeId !== undefined ? (typeof themeId === 'string' ? themeId : null) : undefined,
      pwaEnabled: pwaEnabled !== undefined ? !!pwaEnabled : undefined,
      pwaConfig: pwaConfig !== undefined ? pwaConfig : undefined,
    });
    if (!website) {
      res.status(404).json({ error: 'Website not found' });
      return;
    }
    siteRootCache.clear();
    res.json({ website });
  } catch (error: any) {
    logger.error({ err: error }, 'Update website error');
    res.status(500).json({ error: error.message || 'Failed to update website' });
  }
});

app.delete('/whoobe-one/websites/:id', requireAnyPermission(PERMISSIONS.WEBSITES_DELETE, PERMISSIONS.OBJECTS_WRITE), audited(AUDIT.websiteDelete), async (req: Request, res: Response): Promise<void> => {
  try {
    const { themesDeleted } = await deleteWebsite(req.params.id, { withTheme: true });
    siteRootCache.clear();
    res.json({ success: true, themesDeleted });
  } catch (error: any) {
    logger.error({ err: error }, 'Delete website error');
    res.status(500).json({ error: error.message || 'Failed to delete website' });
  }
});

// --- Website Themes (multiple named themes per website) ---

/**
 * Reads the themes array from settings, falling back to the old singular
 * `settings.theme` format for backward compatibility.
 */
function readThemes(settings: Record<string, unknown> | null): { id: string; name: string; colors: { name: string; hex: string }[]; fonts: string[]; styles: string; tailwindClasses: string }[] {
  const s = settings ?? {};
  if (Array.isArray(s.themes)) return s.themes as any;
  const old = s.theme as any;
  if (old) return [{ id: 'default', name: 'Default', colors: old.colors ?? [], fonts: old.fonts ?? [], styles: old.styles ?? '', tailwindClasses: old.tailwindClasses ?? '' }];
  return [];
}

function readDefaultThemeId(settings: Record<string, unknown> | null): string {
  const s = settings ?? {};
  if (typeof s.defaultThemeId === 'string') return s.defaultThemeId;
  const themes = readThemes(settings);
  return themes.length > 0 ? themes[0].id : 'default';
}

function themeId(): string {
  return 'theme-' + randomBytes(4).toString('hex');
}

// File upload in forms (docs/plans/forms/form-upload-plan.md): the limits a website sets live in its settings (`settings.uploads`).
// Whatever is written goes through normalizeUploadLimits, so the stored value is always one the upload endpoints can trust
// (verifiable extensions only, numbers within the ceilings, a private folder unless a public one is explicitly allowed).
app.get('/whoobe-one/websites/:id/upload-settings', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const website = await getWebsite(req.params.id);
    if (!website) { res.status(404).json({ error: 'Website not found' }); return; }
    const raw = (website.settings as Record<string, unknown> | null)?.uploads;
    res.json({ uploads: normalizeUploadLimits(raw), ceilings: UPLOAD_CEILINGS, availableExtensions: [...SNIFFABLE_EXTENSIONS].sort() });
  } catch (error: any) {
    logger.error({ err: error }, 'Read website upload settings error');
    res.status(500).json({ error: 'Failed to read upload settings' });
  }
});

app.put('/whoobe-one/websites/:id/upload-settings', requirePermission(PERMISSIONS.SETTINGS_MANAGE), audited(AUDIT.websiteUploadSettings), async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) { res.status(400).json({ error: 'A settings object is required' }); return; }
    const website = await getWebsite(req.params.id);
    if (!website) { res.status(404).json({ error: 'Website not found' }); return; }
    const uploads = normalizeUploadLimits(body);
    // Say so instead of silently dropping what was asked for
    const asked = Array.isArray((body as any).allowedExtensions) ? (body as any).allowedExtensions.map((e: unknown) => String(e).trim().toLowerCase().replace(/^\./, '')).filter(Boolean) : [];
    const dropped = asked.filter((e: string) => !uploads.allowedExtensions.includes(e));
    if (dropped.length) { res.status(400).json({ error: `These file types cannot be allowed: ${[...new Set(dropped)].join(', ')}`, rejectedExtensions: [...new Set(dropped)] }); return; }
    if (typeof (body as any).targetFolder === 'string' && (body as any).targetFolder.trim() && (body as any).targetFolder.trim().replace(/^\/+|\/+$/g, '') !== uploads.targetFolder) {
      res.status(400).json({ error: 'The target folder is not valid, or a public folder needs "allow a public folder"' }); return;
    }
    await updateWebsite(req.params.id, { settings: { ...((website.settings as Record<string, unknown>) ?? {}), uploads } });
    res.json({ uploads });
  } catch (error: any) {
    logger.error({ err: error }, 'Write website upload settings error');
    res.status(500).json({ error: 'Failed to save upload settings' });
  }
});

app.get('/whoobe-one/websites/:id/themes', requireAnyPermission(PERMISSIONS.WEBSITES_VIEW, PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const website = await getWebsite(req.params.id);
    if (!website) { res.status(404).json({ error: 'Website not found' }); return; }
    const themes = readThemes(website.settings as Record<string, unknown> | null);
    const defaultThemeId = readDefaultThemeId(website.settings as Record<string, unknown> | null);
    res.json({ themes, defaultThemeId });
  } catch (error: any) {
    logger.error({ err: error }, 'List website themes error');
    res.status(500).json({ error: error.message || 'Failed to list themes' });
  }
});

app.post('/whoobe-one/websites/:id/themes', requireAnyPermission(PERMISSIONS.WEBSITES_EDIT, PERMISSIONS.OBJECTS_WRITE), audited(AUDIT.websiteThemeCreate), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, colors, fonts, styles, tailwindClasses } = req.body ?? {};
    const website = await getWebsite(req.params.id);
    if (!website) { res.status(404).json({ error: 'Website not found' }); return; }
    const themes = readThemes(website.settings as Record<string, unknown> | null);
    const newTheme = {
      id: themeId(),
      name: typeof name === 'string' && name.trim() ? name.trim() : 'Untitled',
      colors: Array.isArray(colors) ? colors.filter((c: any) => c && typeof c.name === 'string' && typeof c.hex === 'string') : [],
      fonts: Array.isArray(fonts) ? fonts.filter((f: any) => typeof f === 'string') : [],
      styles: typeof styles === 'string' ? styles : '',
      tailwindClasses: typeof tailwindClasses === 'string' ? tailwindClasses : '',
    };
    themes.push(newTheme);
    const settings = { ...(website.settings as Record<string, unknown> ?? {}), themes };
    await updateWebsite(req.params.id, { settings });
    res.status(201).json({ theme: newTheme });
  } catch (error: any) {
    logger.error({ err: error }, 'Create website theme error');
    res.status(500).json({ error: error.message || 'Failed to create theme' });
  }
});

app.put('/whoobe-one/websites/:id/themes/:themeId', requireAnyPermission(PERMISSIONS.WEBSITES_EDIT, PERMISSIONS.OBJECTS_WRITE), audited(AUDIT.websiteThemeUpdate), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, colors, fonts, styles, tailwindClasses, isDefault } = req.body ?? {};
    const website = await getWebsite(req.params.id);
    if (!website) { res.status(404).json({ error: 'Website not found' }); return; }
    const themes = readThemes(website.settings as Record<string, unknown> | null);
    const idx = themes.findIndex((t) => t.id === req.params.themeId);
    if (idx === -1) { res.status(404).json({ error: 'Theme not found' }); return; }
    if (typeof name === 'string' && name.trim()) themes[idx].name = name.trim();
    if (Array.isArray(colors)) themes[idx].colors = colors.filter((c: any) => c && typeof c.name === 'string' && typeof c.hex === 'string');
    if (Array.isArray(fonts)) themes[idx].fonts = fonts.filter((f: any) => typeof f === 'string');
    if (typeof styles === 'string') themes[idx].styles = styles;
    if (typeof tailwindClasses === 'string') themes[idx].tailwindClasses = tailwindClasses;
    const settings: Record<string, unknown> = { ...(website.settings as Record<string, unknown> ?? {}), themes };
    if (isDefault === true) settings.defaultThemeId = req.params.themeId;
    await updateWebsite(req.params.id, { settings });
    res.json({ theme: themes[idx] });
  } catch (error: any) {
    logger.error({ err: error }, 'Update website theme error');
    res.status(500).json({ error: error.message || 'Failed to update theme' });
  }
});

app.delete('/whoobe-one/websites/:id/themes/:themeId', requireAnyPermission(PERMISSIONS.WEBSITES_EDIT, PERMISSIONS.OBJECTS_WRITE), audited(AUDIT.websiteThemeDelete), async (req: Request, res: Response): Promise<void> => {
  try {
    const website = await getWebsite(req.params.id);
    if (!website) { res.status(404).json({ error: 'Website not found' }); return; }
    let themes = readThemes(website.settings as Record<string, unknown> | null);
    const idx = themes.findIndex((t) => t.id === req.params.themeId);
    if (idx === -1) { res.status(404).json({ error: 'Theme not found' }); return; }
    themes = themes.filter((t) => t.id !== req.params.themeId);
    const settings: Record<string, unknown> = { ...(website.settings as Record<string, unknown> ?? {}), themes };
    if (settings.defaultThemeId === req.params.themeId) {
      settings.defaultThemeId = themes.length > 0 ? themes[0].id : 'default';
    }
    await updateWebsite(req.params.id, { settings });
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Delete website theme error');
    res.status(500).json({ error: error.message || 'Failed to delete theme' });
  }
});

// All themes from all websites — for snippet/standalone editors that don't
// belong to a specific website.
app.get('/whoobe-one/themes/all', requireAnyPermission(PERMISSIONS.THEMES_LIST, PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const allWebsites = await listWebsites();
    const allThemes: { websiteId: string; websiteName: string; themes: { id: string; name: string; colors: { name: string; hex: string }[]; fonts: string[]; styles: string; tailwindClasses: string }[] }[] = [];
    for (const site of allWebsites) {
      const themes = readThemes(site.settings as Record<string, unknown> | null);
      if (themes.length > 0) {
        allThemes.push({ websiteId: site.id, websiteName: site.name, themes });
      }
    }
    res.json({ websites: allThemes });
  } catch (error: any) {
    logger.error({ err: error }, 'List all themes error');
    res.status(500).json({ error: error.message || 'Failed to list themes' });
  }
});

// Backward-compatible single-theme endpoints — read/write the default theme.
app.get('/whoobe-one/websites/:id/theme', requireAnyPermission(PERMISSIONS.WEBSITES_VIEW, PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const website = await getWebsite(req.params.id);
    if (!website) { res.status(404).json({ error: 'Website not found' }); return; }
    const themes = readThemes(website.settings as Record<string, unknown> | null);
    const defaultId = readDefaultThemeId(website.settings as Record<string, unknown> | null);
    const theme = themes.find((t) => t.id === defaultId) ?? themes[0] ?? { colors: [], fonts: [] };
    res.json({ theme: { colors: theme.colors, fonts: theme.fonts } });
  } catch (error: any) {
    logger.error({ err: error }, 'Get website theme error');
    res.status(500).json({ error: error.message || 'Failed to get website theme' });
  }
});

app.put('/whoobe-one/websites/:id/theme', requireAnyPermission(PERMISSIONS.WEBSITES_EDIT, PERMISSIONS.OBJECTS_WRITE), audited(AUDIT.websiteTheme), async (req: Request, res: Response): Promise<void> => {
  try {
    const { colors, fonts } = req.body ?? {};
    const parsed = {
      colors: Array.isArray(colors) ? colors.filter((c: any) => c && typeof c.name === 'string' && typeof c.hex === 'string') : [],
      fonts: Array.isArray(fonts) ? fonts.filter((f: any) => typeof f === 'string') : [],
    };
    const website = await getWebsite(req.params.id);
    if (!website) { res.status(404).json({ error: 'Website not found' }); return; }
    const themes = readThemes(website.settings as Record<string, unknown> | null);
    const defaultId = readDefaultThemeId(website.settings as Record<string, unknown> | null);
    const idx = themes.findIndex((t) => t.id === defaultId);
    if (idx >= 0) {
      themes[idx].colors = parsed.colors;
      themes[idx].fonts = parsed.fonts;
    } else {
      themes.unshift({ id: defaultId, name: 'Default', styles: '', tailwindClasses: '', ...parsed });
    }
    const settings = { ...(website.settings as Record<string, unknown> ?? {}), themes };
    await updateWebsite(req.params.id, { settings });
    res.json({ theme: parsed });
  } catch (error: any) {
    logger.error({ err: error }, 'Update website theme error');
    res.status(500).json({ error: error.message || 'Failed to update website theme' });
  }
});

// --- Themes (independent entity, own DB table) ---

app.get('/whoobe-one/themes', requireAnyPermission(PERMISSIONS.THEMES_LIST, PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await listThemes();
    res.json({ themes: result });
  } catch (error: any) {
    logger.error({ err: error }, 'List themes error');
    res.status(500).json({ error: error.message || 'Failed to list themes' });
  }
});

app.post('/whoobe-one/themes', requireAnyPermission(PERMISSIONS.THEMES_CREATE, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, colors, fonts, styles, tailwindClasses } = req.body ?? {};
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const theme = await createTheme({
      name,
      colors: Array.isArray(colors) ? colors.filter((c: any) => c && typeof c.name === 'string' && typeof c.hex === 'string') : undefined,
      fonts: Array.isArray(fonts) ? fonts.filter((f: any) => typeof f === 'string') : undefined,
      styles: typeof styles === 'string' ? styles : undefined,
      tailwindClasses: typeof tailwindClasses === 'string' ? tailwindClasses : undefined,
    });
    res.status(201).json({ theme });
  } catch (error: any) {
    logger.error({ err: error }, 'Create theme error');
    res.status(500).json({ error: error.message || 'Failed to create theme' });
  }
});

app.get('/whoobe-one/themes/:id', requireAnyPermission(PERMISSIONS.THEMES_VIEW, PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const theme = await getTheme(req.params.id);
    if (!theme) {
      res.status(404).json({ error: 'Theme not found' });
      return;
    }
    res.json({ theme });
  } catch (error: any) {
    logger.error({ err: error }, 'Get theme error');
    res.status(500).json({ error: error.message || 'Failed to get theme' });
  }
});

app.put('/whoobe-one/themes/:id', requireAnyPermission(PERMISSIONS.THEMES_EDIT, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, colors, fonts, styles, tailwindClasses } = req.body ?? {};
    const theme = await updateTheme(req.params.id, {
      name: typeof name === 'string' ? name : undefined,
      colors: Array.isArray(colors) ? colors.filter((c: any) => c && typeof c.name === 'string' && typeof c.hex === 'string') : undefined,
      fonts: Array.isArray(fonts) ? fonts.filter((f: any) => typeof f === 'string') : undefined,
      styles: typeof styles === 'string' ? styles : undefined,
      tailwindClasses: typeof tailwindClasses === 'string' ? tailwindClasses : undefined,
    });
    if (!theme) {
      res.status(404).json({ error: 'Theme not found' });
      return;
    }
    res.json({ theme });
  } catch (error: any) {
    logger.error({ err: error }, 'Update theme error');
    res.status(500).json({ error: error.message || 'Failed to update theme' });
  }
});

app.delete('/whoobe-one/themes/:id', requireAnyPermission(PERMISSIONS.THEMES_DELETE, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    await deleteTheme(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Delete theme error');
    res.status(500).json({ error: error.message || 'Failed to delete theme' });
  }
});

// --- Website Templates (docs/plans/cms/website-templates.md) ---
// A named composition of module pages into header/aside/footer slots around
// the routed page. Gated on SETTINGS_MANAGE (site structure config, same as
// mail settings). The list augments each template with the module page
// titles for its slots, so the UI can render slot pickers without a second
// fetch per template.
app.get('/whoobe-one/websites/:websiteId/templates', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const templates = await listWebsiteTemplates(req.params.websiteId);
    res.json({ templates });
  } catch (error: any) {
    logger.error({ err: error }, 'List website templates error');
    res.status(500).json({ error: error.message || 'Failed to list website templates' });
  }
});

app.post('/whoobe-one/websites/:websiteId/templates', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, layout, pathPatterns, locale, isDefault } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const template = await createWebsiteTemplate({
      websiteId: req.params.websiteId,
      name: name.trim(),
      description: typeof description === 'string' ? description : null,
      layout: layout !== undefined ? layout : undefined,
      pathPatterns: Array.isArray(pathPatterns) ? pathPatterns.filter((p): p is string => typeof p === 'string') : undefined,
      locale: typeof locale === 'string' && locale.trim() ? locale.trim() : null,
      isDefault: !!isDefault,
    });
    res.status(201).json({ template });
  } catch (error: any) {
    logger.error({ err: error }, 'Create website template error');
    res.status(500).json({ error: error.message || 'Failed to create website template' });
  }
});

app.get('/whoobe-one/websites/:websiteId/templates/:id', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const template = await getWebsiteTemplate(req.params.id);
    if (!template || template.websiteId !== req.params.websiteId) {
      res.status(404).json({ error: 'Website template not found' });
      return;
    }
    res.json({ template });
  } catch (error: any) {
    logger.error({ err: error }, 'Get website template error');
    res.status(500).json({ error: error.message || 'Failed to get website template' });
  }
});

app.patch('/whoobe-one/websites/:websiteId/templates/:id', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const existing = await getWebsiteTemplate(req.params.id);
    if (!existing || existing.websiteId !== req.params.websiteId) {
      res.status(404).json({ error: 'Website template not found' });
      return;
    }
    const { name, description, layout, pathPatterns, locale, isDefault } = req.body ?? {};
    const template = await updateWebsiteTemplate(req.params.id, {
      ...(name !== undefined ? { name: typeof name === 'string' ? name : existing.name } : {}),
      ...(description !== undefined ? { description: typeof description === 'string' ? description : null } : {}),
      ...(layout !== undefined ? { layout: layout ?? {} } : {}),
      ...(pathPatterns !== undefined ? { pathPatterns: Array.isArray(pathPatterns) ? pathPatterns.filter((p): p is string => typeof p === 'string') : [] } : {}),
      ...(locale !== undefined ? { locale: typeof locale === 'string' && locale.trim() ? locale.trim() : null } : {}),
      ...(isDefault !== undefined ? { isDefault: !!isDefault } : {}),
    });
    res.json({ template });
  } catch (error: any) {
    logger.error({ err: error }, 'Update website template error');
    res.status(500).json({ error: error.message || 'Failed to update website template' });
  }
});

app.delete('/whoobe-one/websites/:websiteId/templates/:id', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const existing = await getWebsiteTemplate(req.params.id);
    if (!existing || existing.websiteId !== req.params.websiteId) {
      res.status(404).json({ error: 'Website template not found' });
      return;
    }
    await deleteWebsiteTemplate(req.params.id);
    res.json({ ok: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Delete website template error');
    res.status(500).json({ error: error.message || 'Failed to delete website template' });
  }
});

// --- Website Paths ---
app.get('/whoobe-one/website-paths', requireAnyPermission(PERMISSIONS.WEBSITES_LIST, PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const websiteId = typeof req.query.websiteId === 'string' ? req.query.websiteId : undefined;
    const result = await listWebsitePaths(websiteId);
    res.json({ paths: result });
  } catch (error: any) {
    logger.error({ err: error }, 'List website paths error');
    res.status(500).json({ error: error.message || 'Failed to list website paths' });
  }
});

app.post('/whoobe-one/website-paths', requireAnyPermission(PERMISSIONS.WEBSITES_CREATE, PERMISSIONS.OBJECTS_WRITE), audited(AUDIT.websitePathCreate), async (req: Request, res: Response): Promise<void> => {
  try {
    const { websiteId, name, items } = req.body ?? {};
    if (!websiteId || typeof websiteId !== 'string') {
      res.status(400).json({ error: 'websiteId is required' });
      return;
    }
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const path = await createWebsitePath({
      websiteId,
      name,
      items: Array.isArray(items) ? items : undefined,
    });
    res.status(201).json({ path });
  } catch (error: any) {
    logger.error({ err: error }, 'Create website path error');
    res.status(500).json({ error: error.message || 'Failed to create website path' });
  }
});

app.get('/whoobe-one/website-paths/:id', requireAnyPermission(PERMISSIONS.WEBSITES_VIEW, PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const path = await getWebsitePath(req.params.id);
    if (!path) {
      res.status(404).json({ error: 'Website path not found' });
      return;
    }
    res.json({ path });
  } catch (error: any) {
    logger.error({ err: error }, 'Get website path error');
    res.status(500).json({ error: error.message || 'Failed to get website path' });
  }
});

app.patch('/whoobe-one/website-paths/:id', requireAnyPermission(PERMISSIONS.WEBSITES_EDIT, PERMISSIONS.OBJECTS_WRITE), audited(AUDIT.websitePathUpdate), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, items } = req.body ?? {};
    const path = await updateWebsitePath(req.params.id, {
      name: typeof name === 'string' ? name : undefined,
      items: Array.isArray(items) ? items : undefined,
    });
    if (!path) {
      res.status(404).json({ error: 'Website path not found' });
      return;
    }
    res.json({ path });
  } catch (error: any) {
    logger.error({ err: error }, 'Update website path error');
    res.status(500).json({ error: error.message || 'Failed to update website path' });
  }
});

app.delete('/whoobe-one/website-paths/:id', requireAnyPermission(PERMISSIONS.WEBSITES_DELETE, PERMISSIONS.OBJECTS_WRITE), audited(AUDIT.websitePathDelete), async (req: Request, res: Response): Promise<void> => {
  try {
    await deleteWebsitePath(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Delete website path error');
    res.status(500).json({ error: error.message || 'Failed to delete menu' });
  }
});

// Public page endpoints (no auth required)
// Wildcard (not a single-segment :slug param) - a dynamic page's stored
// slug can be a multi-segment pattern (e.g. '/it/news/{slug}', see
// docs/plans/website/website-paths.md), which a plain Express 4 :param
// can never match (it stops at the first '/'). Static pages resolve
// exactly as before - the literal-match branch below reconstructs the
// same slug string the old single-segment route would have received.
// Dynamic-page SEO (core cms/seo-template.ts): a page's meta fields may hold
// `{field}` tokens ("{title}") filled from the data record the page is bound
// to. Resolved here, on the public page lookup, so every consumer of the
// published output (generated Next/Nuxt sites, the headless SDK) gets plain
// values in `page.seo` with no change of their own. Only PUBLISHED records
// are used (a draft must never leak through a public route); the editor's
// preview resolves from its own, draft-aware data instead. A page whose SEO
// has no tokens costs nothing extra.
async function resolvePublicPageSeo(
  page: { seo: any; content: unknown; locale: string },
  params: Record<string, string>,
  publicBaseUrl: string,
): Promise<any> {
  const seo = page.seo;
  if (!seoHasTokens(seo)) return seo;
  try {
    let record: any = null;
    const picked = pickSeoBinding(page.content, seo.sourceBindingId);
    if (picked) {
      const { binding } = picked;
      if (binding.resolveMode === 'explicit' && binding.objectId) {
        record = await getPublishedDataObject(binding.objectId);
      } else {
        const dataClass = await getDataClassByName(binding.className);
        if (dataClass) {
          // A `query` binding keeps its own ordering (matters when the page
          // picked a list as its source); the first row is the record.
          const ob = (binding as any).orderBy;
          const orderBy = ob && typeof ob.field === 'string' && (ob.direction === 'asc' || ob.direction === 'desc') ? { field: ob.field, direction: ob.direction } : undefined;
          const rows = await queryPublishedDataObjects(dataClass.id, {
            filters: substituteBindingFilters(binding, params) as any,
            orderBy,
            limit: 1,
            locale: binding.locale ?? page.locale,
          });
          record = rows[0] ?? null;
        }
      }
    }
    const assetUrls: Record<string, string> = {};
    for (const id of seoAssetIds(seo, record)) {
      const asset = await getAssetById(id);
      if (asset?.isPublic) assetUrls[id] = `${publicBaseUrl}/dam-asset/${asset.s3Key}`;
    }
    return resolveSeoTemplates(seo, { record, urlParams: params, assetUrls });
  } catch (error) {
    // A broken data source must never turn a valid page into a 500; the
    // consumer falls back to the page title.
    logger.warn({ err: error }, 'Dynamic page SEO resolution failed');
    return resolveSeoTemplates(seo, { record: null, urlParams: params });
  }
}

app.get('/public/pages/:locale/*', async (req: Request, res: Response): Promise<void> => {
  try {
    let websiteId = typeof req.query.websiteId === 'string' ? req.query.websiteId : null;
    let rootPath = typeof req.query.rootPath === 'string' ? req.query.rootPath : null;
    let requestPath = '/' + (req.params[0] ?? '');
    const templatePath = requestPath;
    const locale = req.params.locale;
    const draft = await isDraftPreviewRequest(req);
    if (draft) res.setHeader('Cache-Control', 'no-store');

    // Strip the rootPath prefix from the request path when present and
    // resolve websiteId from it if not already provided.
    if (rootPath && requestPath.startsWith(rootPath)) {
      requestPath = requestPath.slice(rootPath.length) || '/';
      if (!websiteId) {
        const site = await getWebsiteByRootPath(rootPath);
        if (site) websiteId = site.id;
      }
    }

    // When neither rootPath nor websiteId is provided, auto-detect rootPath
    // from the first path segment — allows clean /{rootPath}/{slug} URLs
    // from Website > Paths preview links without a ?rootPath= query param.
    if (!rootPath && !websiteId && requestPath !== '/') {
      const segs = requestPath.split('/').filter(Boolean);
      if (segs.length >= 1) {
        const candidate = '/' + segs[0];
        const site = await getWebsiteByRootPath(candidate);
        if (site) {
          rootPath = candidate;
          websiteId = site.id;
          requestPath = requestPath.slice(candidate.length) || '/';
        }
      }
    }

    // Cheapest, most common case first: exact literal match, identical to
    // the old route's only behavior - zero extra query for any static page.
    let page = await getPublishedWhoobePageBySlug(locale, requestPath, websiteId, draft);
    let params: Record<string, string> = {};

    if (!page) {
      // Only fetch+scan dynamic-slug pages when the literal lookup misses.
      const candidates = await listPublishedWhoobePages(websiteId, draft);
      const dynamicCandidates = candidates.filter((p) => p.locale === locale && isDynamicSlug(p.slug));
      const matched = matchPagePath(dynamicCandidates, requestPath);
      if (matched) {
        page = matched.page;
        params = matched.params;
      }
    }

    if (!page) {
      // Return the website's 404 template content when available
      const nfWebsiteId = websiteId ?? null;
      if (nfWebsiteId) {
        try {
          const nfWebsite = await getWebsite(nfWebsiteId);
          const nfTpl = await getDefaultWebsiteTemplate(nfWebsiteId);
          if (nfTpl?.layout?.notFound404) {
            const modules = await listPublishedModulePages(nfWebsiteId, locale, nfWebsite?.defaultLocale ?? null, draft);
            const byId = new Map(modules.map((m: any) => [m.id, m]));
            const snippetIds = new Set<string>();
            for (const sid of nfTpl.layout.notFound404.snippetIds ?? []) snippetIds.add(sid);
            const snippets = await Promise.all([...snippetIds].map((id: string) => getWhoobeOneSnippet(id)));
            const snippetById = new Map(snippets.filter((s): s is NonNullable<typeof s> => !!s).map((s: any) => [s.id, s]));
            const slot = (s: any, allowEmptyPages = false) => {
              if (!s || (s.pageIds?.length === 0 && !s.snippetIds?.length && !s.content && !allowEmptyPages)) return null;
              const pages = (s.pageIds ?? []).map((id: string) => byId.get(id)).filter(Boolean).map((m: any) => ({ id: m.id, title: m.title, content: m.content }));
              for (const snippetId of s.snippetIds ?? []) {
                const snippet = snippetById.get(snippetId);
                if (snippet) pages.push({ id: snippet.id, title: snippet.name, content: snippet.node });
              }
              const custom = Array.isArray(s.content) ? s.content : s.content ? [s.content] : [];
              for (const node of custom) {
                const nodeId = (node as any)?.id;
                pages.push({ id: typeof nodeId === 'string' ? nodeId : 'slot-custom', title: 'Custom', content: node });
              }
              if (pages.length === 0 && !allowEmptyPages) return null;
              return { className: s.className ?? '', style: s.style ?? '', alpine: s.alpine ?? {}, pages };
            };
            const nfSlot = slot(nfTpl.layout.notFound404) ?? { className: '', style: '', pages: [] };
            const contentPage = {
              id: '404',
              title: 'Not Found',
              slug: requestPath,
              locale,
              content: { id: 'not-found', type: 'container', blocks: nfSlot.pages.map((p: any) => p.content), css: { css: nfSlot.className, container: '' }, style: nfSlot.style },
              websiteId: nfWebsiteId,
              published: true,
              kind: 'content' as const,
              seo: null,
              sitemap: null,
              themeId: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            const nfLayout = {
              template: { id: nfTpl.id, name: nfTpl.name },
              header: slot(nfTpl.layout.header),
              aside: slot(nfTpl.layout.aside),
              main: slot(nfTpl.layout.main, true),
              footer: slot(nfTpl.layout.footer),
              notFound404: null,
            };
            res.json(sanitizePublicGatewayContent({ page: contentPage, params: {}, layout: nfLayout }));
            return;
          }
        } catch { /* fall through to 404 */ }
      }
      res.status(404).json({ error: 'Page not found' });
      return;
    }

    // Website Template composition (docs/plans/cms/website-templates.md):
    // when the website has templates, resolve the one for this path
    // (path-pattern override, else the default) and attach the module pages
    // that fill its header/aside/footer slots. Non-breaking - a website with
    // no templates keeps the plain `{ page, params }` response. The website
    // is taken from the explicit ?websiteId query param, else from the
    // resolved page's own websiteId - so headless consumers that don't know
    // the website up front (e.g. whoobe-one-spike's public renderer) still
    // get the composed layout.
    let layout: Record<string, unknown> | null = null;
    const layoutWebsiteId = websiteId ?? page.websiteId;
    if (layoutWebsiteId) {
      try {
        const template = await getWebsiteTemplateForPath(layoutWebsiteId, templatePath, locale);
        if (template) {
          const website = await getWebsite(layoutWebsiteId);
          const modules = await listPublishedModulePages(layoutWebsiteId, locale, website?.defaultLocale ?? null, draft);
          const byId = new Map(modules.map((m) => [m.id, m]));
const snippetIds = new Set<string>();
          for (const slot of [template.layout.header, template.layout.appHeader, template.layout.aside, template.layout.footer, template.layout.appFooter, template.layout.main, template.layout.notFound404]) {
            for (const sid of slot?.snippetIds ?? []) snippetIds.add(sid);
          }
          const snippets = await Promise.all([...snippetIds].map((id) => getWhoobeOneSnippet(id)));
          const snippetById = new Map(snippets.filter((s): s is NonNullable<typeof s> => !!s).map((s) => [s.id, s]));
          const slot = (s: { pageIds: string[]; snippetIds?: string[] | null; className?: string | null; style?: string | null; content?: unknown; alpine?: Record<string, string> | null } | null | undefined, allowEmptyPages = false) => {
            if (!s || (s.pageIds.length === 0 && !s.snippetIds?.length && !s.content && !allowEmptyPages)) return null;
            const pages = s.pageIds
              .map((id) => byId.get(id))
              .filter((m): m is NonNullable<typeof m> => !!m)
              .map((m) => ({ id: m.id, title: m.title, content: m.content }));
            // Reusable snippets (whoobe_one_snippets) - each as a pseudo-page.
            for (const snippetId of s.snippetIds ?? []) {
              const snippet = snippetById.get(snippetId);
              if (snippet) pages.push({ id: snippet.id, title: snippet.name, content: snippet.node });
            }
            // Directly-authored slot elements (a node or an array of nodes) -
            // included after the module pages, each as a pseudo-page so both
            // the spike renderer and the headless SDK compose them unchanged.
            const custom = Array.isArray(s.content) ? s.content : s.content ? [s.content] : [];
            for (const node of custom) {
              const id = (node as { id?: unknown } | null)?.id;
              pages.push({ id: typeof id === 'string' ? id : 'slot-custom', title: 'Custom', content: node });
            }
            if (pages.length === 0 && !allowEmptyPages) return null;
            return { className: s.className ?? '', style: s.style ?? '', alpine: s.alpine ?? {}, pages };
          };
          layout = {
            template: { id: template.id, name: template.name },
            header: slot(template.layout.appHeader ?? template.layout.header),
            aside: slot(template.layout.aside),
            main: slot(template.layout.main, true),
            footer: slot(template.layout.appFooter ?? template.layout.footer),
            notFound404: slot(template.layout.notFound404),
            body: slot(template.layout.body, true),
          };
        }
      } catch (templateError) {
        // A broken template must never turn a valid page into a 500.
        logger.warn({ err: templateError }, 'Website template resolution failed');
      }
    }

    const cdnMirrors = await resolveContentCdnMirrors(page.content, await cdnProviderOf(page.websiteId));
    const body: Record<string, unknown> = { page, params };
    if (draft) body.draftPreview = true;
    if (layout) body.layout = layout;
    if (Object.keys(cdnMirrors).length > 0) body.cdnMirrors = cdnMirrors;
    const isEditor = await isEditorRequest(req);
    // Dynamic-page SEO tokens (see resolvePublicPageSeo). The editor keeps the
    // raw templates in page.seo (it edits them) and gets the resolved copy
    // next to it; every other consumer gets the resolved values in page.seo.
    const resolvedSeo = await resolvePublicPageSeo(page, params, `${req.protocol}://${req.get('host')}`);
    if (resolvedSeo !== page.seo) {
      body.seoResolved = resolvedSeo;
      if (!isEditor) body.page = { ...page, seo: resolvedSeo };
    }
    res.json(isEditor ? body : sanitizePublicGatewayContent(body));
  } catch (error: any) {
    logger.error({ err: error }, 'Public page lookup error');
    res.status(500).json({ error: error.message || 'Failed to look up page' });
  }
});

// Public page lookup without locale in the URL — SEO-friendly format
// /{rootPath}/{slug} used by Website > Paths preview links. The page's
// own locale is resolved from the DB record.
app.get('/public/page/*', async (req: Request, res: Response): Promise<void> => {
  try {
    let websiteId = typeof req.query.websiteId === 'string' ? req.query.websiteId : null;
    let requestPath = '/' + (req.params[0] ?? '');
    const templatePath = requestPath;
    const draft = await isDraftPreviewRequest(req);
    if (draft) res.setHeader('Cache-Control', 'no-store');

    // Auto-detect rootPath from the first path segment.
    if (!websiteId && requestPath !== '/') {
      const segs = requestPath.split('/').filter(Boolean);
      if (segs.length >= 1) {
        const candidate = '/' + segs[0];
        const site = await getWebsiteByRootPath(candidate);
        if (site) {
          websiteId = site.id;
          requestPath = requestPath.slice(candidate.length) || '/';
        }
      }
    }

    // Look up the page by slug + websiteId without locale filtering.
    // Try both with and without leading '/' since page slugs may be stored
    // either way (PageCreateForm prefixes, PagePickerDrawer quick-create does not).
    let page = await getPublishedWhoobePageBySlugAnyLocale(requestPath, websiteId, draft);
    if (!page && requestPath.startsWith('/')) {
      page = await getPublishedWhoobePageBySlugAnyLocale(requestPath.slice(1), websiteId, draft);
    }
    let params: Record<string, string> = {};

    if (!page) {
      // Dynamic-slug fallback: the literal lookup missed, so scan published
      // pages for a dynamic pattern ({placeholder}) that matches this path.
      const candidates = await listPublishedWhoobePages(websiteId, draft);
      const dynamicCandidates = candidates.filter((p) => isDynamicSlug(p.slug));
      const matched = matchPagePath(dynamicCandidates, requestPath);
      if (matched) {
        page = matched.page;
        params = matched.params;
      }
    }

    if (!page) {
      // Return the website's 404 template content when available
      const nfWebsiteId = websiteId ?? null;
      if (nfWebsiteId) {
        try {
          const nfWebsite = await getWebsite(nfWebsiteId);
          const nfTpl = await getDefaultWebsiteTemplate(nfWebsiteId);
          if (nfTpl?.layout?.notFound404) {
            const nfLocale = nfWebsite?.defaultLocale ?? 'en';
            const modules = await listPublishedModulePages(nfWebsiteId, nfLocale, nfWebsite?.defaultLocale ?? null, draft);
            const byId = new Map(modules.map((m: any) => [m.id, m]));
            const snippetIds = new Set<string>();
            for (const sid of nfTpl.layout.notFound404.snippetIds ?? []) snippetIds.add(sid);
            const snippets = await Promise.all([...snippetIds].map((id: string) => getWhoobeOneSnippet(id)));
            const snippetById = new Map(snippets.filter((s): s is NonNullable<typeof s> => !!s).map((s: any) => [s.id, s]));
            const slot = (s: any, allowEmptyPages = false) => {
              if (!s || (s.pageIds?.length === 0 && !s.snippetIds?.length && !s.content && !allowEmptyPages)) return null;
              const pages = (s.pageIds ?? []).map((id: string) => byId.get(id)).filter(Boolean).map((m: any) => ({ id: m.id, title: m.title, content: m.content }));
              for (const snippetId of s.snippetIds ?? []) {
                const snippet = snippetById.get(snippetId);
                if (snippet) pages.push({ id: snippet.id, title: snippet.name, content: snippet.node });
              }
              const custom = Array.isArray(s.content) ? s.content : s.content ? [s.content] : [];
              for (const node of custom) {
                const nodeId = (node as any)?.id;
                pages.push({ id: typeof nodeId === 'string' ? nodeId : 'slot-custom', title: 'Custom', content: node });
              }
              if (pages.length === 0 && !allowEmptyPages) return null;
              return { className: s.className ?? '', style: s.style ?? '', alpine: s.alpine ?? {}, pages };
            };
            const nfSlot = slot(nfTpl.layout.notFound404) ?? { className: '', style: '', pages: [] };
            const contentPage = {
              id: '404',
              title: 'Not Found',
              slug: requestPath,
              locale: nfWebsite?.defaultLocale ?? 'en',
              content: { id: 'not-found', type: 'container', blocks: nfSlot.pages.map((p: any) => p.content), css: { css: nfSlot.className, container: '' }, style: nfSlot.style },
              websiteId: nfWebsiteId,
              published: true,
              kind: 'content' as const,
              seo: null,
              sitemap: null,
              themeId: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            const nfLayout = {
              template: { id: nfTpl.id, name: nfTpl.name },
              header: slot(nfTpl.layout.header),
              aside: slot(nfTpl.layout.aside),
              main: slot(nfTpl.layout.main, true),
              footer: slot(nfTpl.layout.footer),
              notFound404: null,
            };
            res.json(sanitizePublicGatewayContent({ page: contentPage, params: {}, layout: nfLayout }));
            return;
          }
        } catch { /* fall through to 404 */ }
      }
      res.status(404).json({ error: 'Page not found' });
      return;
    }

    const locale = page.locale || 'en';
    let layout: Record<string, unknown> | null = null;
    const layoutWebsiteId = websiteId ?? page.websiteId;
    if (layoutWebsiteId) {
      try {
        const template = await getWebsiteTemplateForPath(layoutWebsiteId, templatePath, locale);
        if (template) {
          const website = await getWebsite(layoutWebsiteId);
          const modules = await listPublishedModulePages(layoutWebsiteId, locale, website?.defaultLocale ?? null, draft);
          const byId = new Map(modules.map((m) => [m.id, m]));
const snippetIds = new Set<string>();
          for (const slot of [template.layout.header, template.layout.appHeader, template.layout.aside, template.layout.footer, template.layout.appFooter, template.layout.main, template.layout.notFound404]) {
            for (const sid of slot?.snippetIds ?? []) snippetIds.add(sid);
          }
          const snippets = await Promise.all([...snippetIds].map((id) => getWhoobeOneSnippet(id)));
          const snippetById = new Map(snippets.filter((s): s is NonNullable<typeof s> => !!s).map((s) => [s.id, s]));
          const slot = (s: { pageIds: string[]; snippetIds?: string[] | null; className?: string | null; style?: string | null; content?: unknown; alpine?: Record<string, string> | null } | null | undefined, allowEmptyPages = false) => {
            if (!s || (s.pageIds.length === 0 && !s.snippetIds?.length && !s.content && !allowEmptyPages)) return null;
            const pages = s.pageIds
              .map((id) => byId.get(id))
              .filter((m): m is NonNullable<typeof m> => !!m)
              .map((m) => ({ id: m.id, title: m.title, content: m.content }));
            for (const snippetId of s.snippetIds ?? []) {
              const snippet = snippetById.get(snippetId);
              if (snippet) pages.push({ id: snippet.id, title: snippet.name, content: snippet.node });
            }
            const custom = Array.isArray(s.content) ? s.content : s.content ? [s.content] : [];
            for (const node of custom) {
              const id = (node as { id?: unknown } | null)?.id;
              pages.push({ id: typeof id === 'string' ? id : 'slot-custom', title: 'Custom', content: node });
            }
            if (pages.length === 0 && !allowEmptyPages) return null;
            return { className: s.className ?? '', style: s.style ?? '', alpine: s.alpine ?? {}, pages };
          };
          layout = {
            template: { id: template.id, name: template.name },
            header: slot(template.layout.appHeader ?? template.layout.header),
            aside: slot(template.layout.aside),
            main: slot(template.layout.main, true),
            footer: slot(template.layout.appFooter ?? template.layout.footer),
            notFound404: slot(template.layout.notFound404),
            body: slot(template.layout.body, true),
          };
        }
      } catch (templateError) {
        logger.warn({ err: templateError }, 'Website template resolution failed (no-locale)');
      }
    }

    const cdnMirrors = await resolveContentCdnMirrors(page.content, await cdnProviderOf(page.websiteId));
    const body: Record<string, unknown> = { page, params };
    if (draft) body.draftPreview = true;
    if (layout) body.layout = layout;
    if (Object.keys(cdnMirrors).length > 0) body.cdnMirrors = cdnMirrors;
    const isEditor = await isEditorRequest(req);
    // Dynamic-page SEO tokens (see resolvePublicPageSeo). The editor keeps the
    // raw templates in page.seo (it edits them) and gets the resolved copy
    // next to it; every other consumer gets the resolved values in page.seo.
    const resolvedSeo = await resolvePublicPageSeo(page, params, `${req.protocol}://${req.get('host')}`);
    if (resolvedSeo !== page.seo) {
      body.seoResolved = resolvedSeo;
      if (!isEditor) body.page = { ...page, seo: resolvedSeo };
    }
    res.json(isEditor ? body : sanitizePublicGatewayContent(body));
  } catch (error: any) {
    logger.error({ err: error }, 'Public page lookup error (no-locale)');
    res.status(500).json({ error: error.message || 'Failed to look up page' });
  }
});

// Public 404 — returns the default template's notFound404 slot composition
// so the client can render it with the website's header/footer shell.
app.get('/public/404/:websiteId', async (req: Request, res: Response): Promise<void> => {
  try {
    const website = await getWebsite(req.params.websiteId);
    if (!website) { res.status(404).json({ error: 'Website not found' }); return; }
    const tpl = await getDefaultWebsiteTemplate(req.params.websiteId);
    if (!tpl?.layout?.notFound404) { res.json({ notFound: null }); return; }
    const modules = await listPublishedModulePages(req.params.websiteId, '', website?.defaultLocale ?? null);
    const byId = new Map(modules.map((m: any) => [m.id, m]));
    const snippetIds = new Set<string>();
    for (const sid of tpl.layout.notFound404.snippetIds ?? []) snippetIds.add(sid);
    const snippets = await Promise.all([...snippetIds].map((id: string) => getWhoobeOneSnippet(id)));
    const snippetById = new Map(snippets.filter((s): s is NonNullable<typeof s> => !!s).map((s: NonNullable<typeof snippets[number]>) => [s.id, s]));
    const nf = tpl.layout.notFound404;
    const pages: { id: string; title: string; content: unknown }[] = (nf.pageIds ?? [])
      .map((id: string) => byId.get(id) as any)
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map((m: any) => ({ id: m.id, title: m.title, content: m.content }));
    for (const snippetId of nf.snippetIds ?? []) {
      const snippet = snippetById.get(snippetId);
      if (snippet) pages.push({ id: snippet.id, title: snippet.name, content: snippet.node });
    }
    const custom = Array.isArray(nf.content) ? nf.content : nf.content ? [nf.content] : [];
    for (const node of custom) {
      const nodeId = (node as { id?: unknown } | null)?.id;
      pages.push({ id: typeof nodeId === 'string' ? nodeId : '404-custom', title: 'Custom', content: node });
    }
    res.json(sanitizePublicGatewayContent({
      notFound: {
        className: nf.className ?? '',
        style: nf.style ?? '',
        pages,
      },
    }));
  } catch (error: any) {
    logger.error({ err: error }, 'Public 404 lookup error');
    res.status(500).json({ error: error.message || 'Failed to look up 404' });
  }
});

app.get('/public/sitemap.xml', async (req: Request, res: Response): Promise<void> => {
  try {
    const websiteId = typeof req.query.websiteId === 'string' ? req.query.websiteId : null;
    const pages = await listPublishedWhoobePages(websiteId);
    const sitemapPages = pages
      .filter((p) => p.sitemap?.included !== false)
      .filter((p) => !isDynamicSlug(p.slug));

    const baseUrl = process.env.PUBLIC_SITE_URL || 'https://example.com';

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    for (const page of sitemapPages) {
      const loc = `${baseUrl}${page.slug}`;
      const lastmod = page.updatedAt instanceof Date ? page.updatedAt.toISOString() : new Date(page.updatedAt).toISOString();
      xml += '  <url>\n';
      xml += `    <loc>${escapeXml(loc)}</loc>\n`;
      xml += `    <lastmod>${lastmod}</lastmod>\n`;
      if (page.sitemap?.changefreq) {
        xml += `    <changefreq>${page.sitemap.changefreq}</changefreq>\n`;
      }
      if (page.sitemap?.priority !== null && page.sitemap?.priority !== undefined) {
        xml += `    <priority>${page.sitemap.priority.toFixed(1)}</priority>\n`;
      }
      xml += '  </url>\n';
    }
    xml += '</urlset>';

    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (error: any) {
    logger.error({ err: error }, 'Sitemap generation error');
    res.status(500).json({ error: error.message || 'Failed to generate sitemap' });
  }
});

app.get('/public/robots.txt', async (_req: Request, res: Response): Promise<void> => {
  const baseUrl = process.env.PUBLIC_SITE_URL || 'https://example.com';
  const content = [
    'User-agent: *',
    `Allow: /`,
    '',
    `Sitemap: ${baseUrl}/public/sitemap.xml`,
    '',
  ].join('\n');

  res.set('Content-Type', 'text/plain');
  res.send(content);
});

// Public website list — no auth, returns all websites with id/name/slug.
// Used by publish-mobile.sh to let the user pick a website interactively.
app.get('/public/websites', async (_req: Request, res: Response): Promise<void> => {
  try {
    const all = await listWebsites();
    res.json({ websites: all.map((w) => ({ id: w.id, name: w.name })) });
  } catch (error: any) {
    logger.error({ err: error }, 'Public websites list error');
    res.status(500).json({ error: error.message || 'Failed to list websites' });
  }
});

const PUBLIC_WEBSITE_SETTINGS = ['themes', 'defaultThemeId'] as const;

// Public website info endpoint — no auth, returns website config + themes.
// Used by the publish CLI to fetch website metadata at build time.
app.get('/public/websites/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const website = await getWebsite(req.params.id);
    if (!website) {
      res.status(404).json({ error: 'Website not found' });
      return;
    }
    const themes = ((website.settings as Record<string, unknown> ?? {}).themes ?? []) as any[];
    const defaultThemeId = (website.settings as Record<string, unknown> ?? {}).defaultThemeId ?? (Array.isArray(themes) && themes.length > 0 ? themes[0].id : null);
    // Also include the global theme if the website references one
    let globalTheme: Record<string, unknown> | null = null;
    if (website.themeId) {
      const gt = await getTheme(website.themeId);
      if (gt) {
        globalTheme = {
          id: gt.id,
          name: gt.name,
          colors: gt.colors,
          fonts: gt.fonts,
          styles: gt.styles,
          tailwindClasses: gt.tailwindClasses,
        } as Record<string, unknown>;
      }
    }
    // Fetch paths with page IDs and templates
    const paths = await listWebsitePaths(website.id);
    const templates = await listWebsiteTemplates(website.id);
    const resolvedPaths = paths.map(path => {
      const ids = new Set<string>();
      function collect(items: MenuItem[]): void {
        for (const item of items) {
          if (item.pageId) ids.add(item.pageId);
          if (item.children?.length) collect(item.children);
        }
      }
      collect(path.items);
      return { ...path, pageIds: [...ids] };
    });
    // `settings` is an administration blob (logging, autosave, CDN mirror, Alpine presets catalog, ...): only an allow-list
    // goes out, so a setting added later is private by default (F-051). The publish CLI and the mobile-app generator read
    // the themes from the separate top-level fields; the website columns (name, rootPath, locales, pwaConfig) are not in it.
    const allSettings = (website.settings ?? {}) as Record<string, unknown>;
    const publicSettings = Object.fromEntries(PUBLIC_WEBSITE_SETTINGS.filter((k) => k in allSettings).map((k) => [k, allSettings[k]]));
    res.json(sanitizePublicGatewayContent({ website: { ...website, settings: publicSettings }, themes: [...themes, ...(globalTheme ? [globalTheme] : [])], defaultThemeId, paths: resolvedPaths, templates }));
  } catch (error: any) {
    logger.error({ err: error }, 'Public website info error');
    res.status(500).json({ error: error.message || 'Failed to get website info' });
  }
});

// Public pages list — no auth, returns all published pages for a website.
app.get('/public/pages', async (req: Request, res: Response): Promise<void> => {
  try {
    const websiteId = typeof req.query.websiteId === 'string' ? req.query.websiteId : null;
    const pages = await listPublishedWhoobePages(websiteId);
    res.json(sanitizePublicGatewayContent({ pages }));
  } catch (error: any) {
    logger.error({ err: error }, 'Public pages list error');
    res.status(500).json({ error: error.message || 'Failed to list pages' });
  }
});

// Public snippet lookup — no auth.
app.get('/public/snippets/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const snippet = await getWhoobeOneSnippet(req.params.id);
    if (!snippet) {
      res.status(404).json({ error: 'Snippet not found' });
      return;
    }
    res.json(sanitizePublicGatewayContent({ snippet }));
  } catch (error: any) {
    logger.error({ err: error }, 'Public snippet lookup error');
    res.status(500).json({ error: error.message || 'Failed to get snippet' });
  }
});

// GET /public/assets/:uuid — resolve a DAM asset UUID to its public URL.
// The custom fonts a published site needs (the site generators copy the files): only faces whose file is public and still a woff2.
// Nothing here is secret: the files are public assets, and a face is listed only when it is.
app.get('/public/fonts', async (_req: Request, res: Response): Promise<void> => {
  try {
    const faces: { family: string; weight: number; style: string; url: string }[] = [];
    for (const f of await listCustomFonts()) {
      const asset = await getAssetByPath(f.assetPath);
      if (asset && asset.isPublic && asset.fileType === 'WOFF2') faces.push({ family: f.family, weight: f.weight, style: f.style, url: `/dam-asset/${asset.s3Key}` });
    }
    res.json({ fonts: faces });
  } catch (error) {
    logger.error({ err: error }, 'Public fonts list error');
    res.status(500).json({ error: 'Failed to list the fonts' });
  }
});

// Used by the headless SDK's resolvers when images are stored as UUIDs.
app.get('/public/assets/:uuid', async (req: Request, res: Response): Promise<void> => {
  try {
    const asset = await getAssetById(req.params.uuid);
    if (!asset) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }
    if (!asset.isPublic) {
      res.status(403).json({ error: 'Asset is not public' });
      return;
    }
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json({ url: `${baseUrl}/dam-asset/${asset.s3Key}` });
  } catch (error: any) {
    logger.error({ err: error }, 'Public asset lookup error');
    res.status(500).json({ error: error.message || 'Failed to resolve asset' });
  }
});

// GET /public/dam/assets/mirror-status?paths=/uploads/a.jpg,<uuid>,...
// Reports whether each given DAM reference (pimcore path or asset UUID)
// already has a CDN mirror, and its asset id — used by the publish CDN-sync
// tooling (packages/publish's sync-cdn-assets) to know which referenced
// assets still need POST /api/v1/dam/assets/:id/mirror-cdn, without needing
// its own DB access or exposing anything not already public once mirrored.
const MIRROR_STATUS_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
app.get('/public/dam/assets/mirror-status', async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = typeof req.query.paths === 'string' ? req.query.paths : '';
    const refs = raw.split(',').map((r) => r.trim()).filter(Boolean);
    // with ?provider= only a mirror at THAT provider counts (two websites may use two CDNs for one shared asset)
    const provider = typeof req.query.provider === 'string' && req.query.provider ? req.query.provider : null;
    const status: Record<string, { mirrored: boolean; assetId: string | null }> = {};
    await Promise.all(
      refs.map(async (ref) => {
        try {
          const asset = MIRROR_STATUS_UUID_RE.test(ref) ? await getAssetById(ref) : await getAssetByPath(ref);
          status[ref] = { mirrored: !!asset && (provider ? !!asset.cdnMirrors?.[provider] : Object.keys(asset.cdnMirrors ?? {}).length > 0), assetId: asset?.id ?? null };
        } catch {
          status[ref] = { mirrored: false, assetId: null };
        }
      }),
    );
    res.json({ status });
  } catch (error: any) {
    logger.error({ err: error }, 'Mirror status lookup error');
    res.status(500).json({ error: error.message || 'Failed to resolve mirror status' });
  }
});

// ---------------------------------------------------------------------------
// PWA / Mobile app public endpoints
// ---------------------------------------------------------------------------

// GET /public/apps/:websiteId — returns the full PWA manifest + page tree
app.get('/public/apps/:websiteId', async (req: Request, res: Response): Promise<void> => {
  try {
    const website = await getWebsite(req.params.websiteId);
    if (!website) {
      res.status(404).json({ error: 'Website not found' });
      return;
    }
    const pages = await listPublishedWhoobePages(website.id);
    const paths = await listWebsitePaths(website.id);
    res.json(sanitizePublicGatewayContent({
      website: {
        id: website.id,
        name: website.name,
        rootPath: website.rootPath,
        domains: website.domains,
      },
      // public: only what an app needs. The push provider key never appears here (F-059), nor the flag that says one is set
      pwaConfig: publicPwaConfig(website.pwaConfig),
      pages,
      paths,
    }));
  } catch (error: any) {
    logger.error({ err: error }, 'Public apps info error');
    res.status(500).json({ error: error.message || 'Failed to get app info' });
  }
});

// POST /pwa/subscribe — subscribe a device to push notifications
// Unauthenticated write: bounded per client address (20 / 10 min) so it cannot be used to fill the table.
const pwaSubscribeLimiter = createFixedWindowLimiter({ max: 20, windowMs: 10 * 60 * 1000 });

app.post('/pwa/subscribe', async (req: Request, res: Response): Promise<void> => {
  if (pwaSubscribeLimiter.hit(req.ip ?? 'unknown')) {
    res.status(429).json({ error: 'Too many requests. Try again later.' });
    return;
  }
  try {
    const { websiteId, provider, subscription } = req.body;
    if (!websiteId || !subscription?.endpoint) {
      res.status(400).json({ error: 'websiteId and subscription.endpoint are required' });
      return;
    }
    const record = await createSubscription({
      websiteId,
      provider: provider ?? 'self',
      endpoint: subscription.endpoint,
      keys: subscription.keys ?? {},
      userAgent: req.headers['user-agent'] ?? null,
    });
    res.status(201).json({ subscription: record });
  } catch (error: any) {
    logger.error({ err: error }, 'Push subscribe error');
    res.status(500).json({ error: error.message || 'Failed to subscribe' });
  }
});

// POST /pwa/send — send a push notification to all subscribers of a website
app.post('/pwa/send', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { websiteId, title, body, icon, data } = req.body;
    if (!websiteId || !title || !body) {
      res.status(400).json({ error: 'websiteId, title, and body are required' });
      return;
    }

    const website = await getWebsite(websiteId);
    if (!website) {
      res.status(404).json({ error: 'Website not found' });
      return;
    }

    const pwaConfig = (website.pwaConfig ?? {}) as Record<string, unknown>;
    // the website record never carries the provider key (F-059); it is read, decrypted, only to send
    const pushConfig = { ...((pwaConfig.push ?? {}) as Record<string, unknown>), onesignalApiKey: (await getWebsitePushApiKey(websiteId)) ?? undefined } as Record<string, unknown>;
    const providerName = (pushConfig.provider ?? 'self') as PushProviderName;

    const initError = initializePushProvider(providerName, pushConfig);
    if (initError) {
      res.status(400).json({ error: `Push provider misconfigured: ${initError}` });
      return;
    }

    const subscriptions = await listSubscriptions(websiteId);
    if (subscriptions.length === 0) {
      res.json({ success: true, sent: 0, failed: 0, message: 'No subscribers' });
      return;
    }

    const recipients = subscriptions.map((s) => ({
      endpoint: s.endpoint,
      keys: { ...(s.keys ?? {}), provider: s.provider },
    }));

    const result = await sendPushNotification(providerName, recipients, {
      title,
      body,
      icon,
      data: data ?? {},
    }, pushConfig);

    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Push send error');
    res.status(500).json({ error: error.message || 'Failed to send push notification' });
  }
});

// POST /whoobe-one/websites/:id/generate-pwa — generate a PWA Nuxt site for
// preview. Runs the publish generator inside the monorepo's sites/ directory
// so workshop: workspace:* dependencies resolve correctly. Cleanup happens
// after 5 minutes.
app.post('/whoobe-one/websites/:id/generate-pwa', requirePermission(PERMISSIONS.SETTINGS_MANAGE), audited(AUDIT.websitePwa), async (req: Request, res: Response): Promise<void> => {
  try {
    const { join } = await import('node:path');
    const { mkdir, readdir, readFile, rm } = await import('node:fs/promises');
    const { generateNuxtSite } = await import('@whoobe-cms/publish');
    const { existsSync } = await import('node:fs');

    const websiteId = req.params.id;
    const website = await getWebsite(websiteId);
    if (!website) {
      res.status(404).json({ error: 'Website not found' });
      return;
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const monorepoRoot = join(import.meta.dirname, '..', '..', '..');
    const outDir = join(monorepoRoot, 'sites', '_preview');

    // Ensure the output directory exists (clean slate)
    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });

    // Stream logs via response.write for real-time progress
    const log = (msg: string) => {
      res.write(JSON.stringify({ type: 'log', message: msg }) + '\n');
    };

    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    log(`Generating PWA site for "${website.name}"...`);
    log(`Output directory: ${outDir}`);

    // Override console.log to capture generator output
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      log(args.map((a) => String(a)).join(' '));
    };

    try {
      await generateNuxtSite({
        apiUrl: baseUrl,
        websiteId,
        outDir,
        framework: 'vue',
        revalidate: 60,
        domain: req.hostname,
        monorepoRoot: join(import.meta.dirname, '..', '..', '..'),
        appOnly: true,
      });

      // Read generated file tree
      const fileTree: Array<{ path: string; size: number }> = [];
      async function walkDir(dir: string, prefix: string): Promise<void> {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          const fullPath = join(dir, e.name);
          const relPath = prefix ? `${prefix}/${e.name}` : e.name;
          if (e.isDirectory()) {
            if (!relPath.startsWith('node_modules')) {
              await walkDir(fullPath, relPath);
            }
          } else {
            const stat = await import('node:fs').then((fs) => fs.promises.stat(fullPath));
            fileTree.push({ path: relPath, size: stat.size });
          }
        }
      }
      await walkDir(outDir, '');

      // Read key files for preview
      const keyFiles = [
        'nuxt.config.ts',
        'public/manifest.json',
        'app.vue',
        'pages/[...slug].vue',
        'error.vue',
        'components/AppShell.vue',
        'components/BottomNav.vue',
        'components/InstallPrompt.vue',
        'composables/useInstallPrompt.ts',
        'composables/useOfflineQueue.ts',
        'composables/usePushNotifications.ts',
      ];

      const fileContents: Record<string, string> = {};
      for (const f of keyFiles) {
        const fullPath = join(outDir, f);
        if (existsSync(fullPath)) {
          fileContents[f] = await readFile(fullPath, 'utf-8');
        }
      }

      res.write(JSON.stringify({
        type: 'done',
        fileTree,
        fileContents,
        outDir,
        websiteName: website.name,
      }) + '\n');
      res.end();
    } finally {
      console.log = origLog;
      // Cleanup after 5 minutes (allow time for the admin to inspect)
      setTimeout(() => rm(outDir, { recursive: true, force: true }).catch(() => {}), 5 * 60 * 1000);
    }
  } catch (error: any) {
    logger.error({ err: error }, 'Generate PWA error');
    res.status(500).json({ error: error.message || 'Failed to generate PWA site' });
  }
});

// ---------------------------------------------------------------------------
// Public search (headless) - see docs/plans/search-engine/search-engine-plan.md
// §7. No auth, published-only, respects per-page search.indexable (enforced
// at index time via indexer.ts). The response contract is the website's
// integration point (whoobe-one-spike's SearchBox) and the future SSR
// renderer's.
const SEARCH_TYPES = ['page', 'object', 'class', 'asset'];

function parseSearchQuery(req: Request): { error?: string; options?: import('@whoobe-cms/core/server').SearchOptions } {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < 2) return { error: 'Query parameter "q" must be at least 2 characters' };

  // type accepts one value, several repeated (?type=object&type=asset) or a
  // comma-separated list (?type=object,asset) - the admin search toggles
  // multiple types on/off simultaneously.
  const rawTypes = Array.isArray(req.query.type) ? req.query.type : typeof req.query.type === 'string' ? req.query.type.split(',') : [];
  const types = rawTypes
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const invalid = types.find((t) => !SEARCH_TYPES.includes(t));
  if (invalid) {
    return { error: `Invalid "type": ${invalid} (expected page, object, class or asset)` };
  }
  const page = Number.parseInt(typeof req.query.page === 'string' ? req.query.page : '1', 10);
  const pageSize = Number.parseInt(typeof req.query.pageSize === 'string' ? req.query.pageSize : '20', 10);
  const sort = req.query.sort === 'date' ? 'date' : 'relevance';
  const includeUnpublished = req.query.includeUnpublished === 'true';

  return {
    options: {
      q,
      locale: typeof req.query.locale === 'string' && req.query.locale ? req.query.locale : 'en',
      websiteId: typeof req.query.websiteId === 'string' && req.query.websiteId ? req.query.websiteId : null,
      type: (types.length === 1 ? types[0] : types.length > 1 ? types : null) as
        | import('@whoobe-cms/core/server').SearchDocumentType
        | import('@whoobe-cms/core/server').SearchDocumentType[]
        | null,
      classId: typeof req.query.classId === 'string' && req.query.classId ? req.query.classId : null,
      includeUnpublished,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 20,
      sort,
    },
  };
}

function withSearchUrls<T extends { type: string; path: string }>(results: T[], locale: string): Array<T & { url: string | null }> {
  const baseUrl = process.env.PUBLIC_SITE_URL || '';
  return results.map((row) => {
    const url = row.type === 'page' && baseUrl && row.path ? `${baseUrl}${row.path.startsWith('/') ? '' : '/'}${row.path}` : null;
    return { ...row, url };
  });
}

app.get('/public/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = parseSearchQuery(req);
    if (parsed.error || !parsed.options) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    // parseSearchQuery is shared with the admin search, which may list drafts on request: never here.
    parsed.options.includeUnpublished = false;
    const results = await searchContent(parsed.options);
    res.json({ ...results, results: withSearchUrls(results.results, parsed.options.locale ?? 'en') });
  } catch (error: any) {
    logger.error({ err: error }, 'Public search error');
    res.status(500).json({ error: error.message || 'Search failed' });
  }
});

// Data Object classes (Pimcore's "Classes" concept) - see docs/plans/
// datamodel/advanced-data-modeling-plan.md §4.1/§6. Reuses the same
// PERMISSIONS.OBJECTS_* triad every other resource in this file does
// (documents/snippets/templates/kits/pages) rather than inventing
// class-specific permission strings - that's this codebase's own existing
// convention for "any admin-managed content", not something this plan
// introduces new permissions for.
app.get('/data-classes', requireAnyPermission(PERMISSIONS.DATA_OBJECTS_LIST, PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const classes = await listDataClasses();
    res.json({ classes });
  } catch (error: any) {
    logger.error({ err: error }, 'List data classes error');
    res.status(500).json({ error: error.message || 'Failed to list classes' });
  }
});

app.get('/data-classes/:id', requireAnyPermission(PERMISSIONS.DATA_OBJECTS_VIEW, PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const dataClass = await getDataClass(req.params.id);
    if (!dataClass) {
      res.status(404).json({ error: 'Class not found' });
      return;
    }
    res.json({ class: dataClass });
  } catch (error: any) {
    logger.error({ err: error }, 'Get data class error');
    res.status(500).json({ error: error.message || 'Failed to get class' });
  }
});

app.post('/data-classes', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, label, fields, viewConfig, pimcoreId } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || typeof label !== 'string' || !label.trim() || !Array.isArray(fields)) {
      res.status(400).json({ error: 'name, label, and fields are required' });
      return;
    }

    const dataClass = await createDataClass({
      name: name.trim(),
      label: label.trim(),
      fields,
      viewConfig: viewConfig ?? null,
      pimcoreId: typeof pimcoreId === 'string' ? pimcoreId : null,
    });
    res.status(201).json({ class: dataClass });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ error: `A class named "${req.body?.name}" already exists` });
      return;
    }
    logger.error({ err: error }, 'Create data class error');
    res.status(500).json({ error: error.message || 'Failed to create class' });
  }
});

app.patch('/data-classes/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, label, fields, viewConfig, confirmTypeChange, retentionDays } = req.body ?? {};

    // Retention deletes data by itself, so it is not an editor's setting: it needs the data subject permission (admin).
    let retentionBefore: number | null | undefined;
    if (retentionDays !== undefined) {
      if (retentionDays !== null && (typeof retentionDays !== 'number' || !Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 36500)) {
        res.status(400).json({ error: 'retentionDays must be a whole number of days from 1 to 36500, or null to keep the objects' });
        return;
      }
      if (!(await getEffectivePermissions((req as AuthenticatedRequest).user!.id)).includes(PERMISSIONS.DATA_SUBJECT_MANAGE)) {
        res.status(403).json({ error: 'Setting a retention period needs the data-subject permission' });
        return;
      }
      retentionBefore = (await getDataClass(req.params.id))?.retentionDays;
    }

    // Guardrail (docs/plans/datamodel/native-class-authoring-plan.md §3.1):
    // once a class has real objects, a field's `name` disappearing or its
    // `fieldType` changing would silently orphan/invalidate data already
    // stored in those objects' `attributes` JSONB - blocked outright rather
    // than allowed to break quietly. Adding new fields, or editing
    // title/mandatory/localized/options on a surviving same-name-same-type
    // field, is unrestricted. A `fieldType` change is allowed, but only when
    // the caller sends `confirmTypeChange: true` after being warned (the
    // stored values aren't touched, so some may no longer fit the new type).
    if (Array.isArray(fields)) {
      const existing = await getDataClass(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Class not found' });
        return;
      }
      const objects = await listDataObjects(req.params.id);
      if (objects.length > 0) {
        const oldFieldsByName = new Map(existing.fields.map((f) => [f.name, f]));
        const newFieldsByName = new Map(fields.map((f: { name: string }) => [f.name, f]));
        const removed = [...oldFieldsByName.keys()].filter((name) => !newFieldsByName.has(name));
        const typeChanges = [...oldFieldsByName.entries()]
          .filter(([name, old]) => newFieldsByName.has(name) && (newFieldsByName.get(name) as any).fieldType !== old.fieldType)
          .map(([name, old]) => ({ name, from: old.fieldType, to: (newFieldsByName.get(name) as any).fieldType as string }));
        if (removed.length > 0) {
          res.status(409).json({
            error: `Cannot remove or rename these fields while ${objects.length} object(s) exist for this class: ${removed.join(', ')}. Remove the objects first, or keep the field name unchanged.`,
          });
          return;
        }
        if (typeChanges.length > 0 && confirmTypeChange !== true) {
          res.status(409).json({
            code: 'FIELD_TYPE_CHANGE_NEEDS_CONFIRMATION',
            error: `Changing the type of ${typeChanges.map((c) => c.name).join(', ')} affects ${objects.length} existing object(s).`,
            typeChanges,
            objectCount: objects.length,
          });
          return;
        }
      }
    }

    const dataClass = await updateDataClass(req.params.id, {
      name: typeof name === 'string' ? name : undefined,
      label: typeof label === 'string' ? label : undefined,
      fields: Array.isArray(fields) ? fields : undefined,
      viewConfig: viewConfig !== undefined ? viewConfig : undefined,
      retentionDays: retentionDays !== undefined ? retentionDays : undefined,
    });
    if (!dataClass) {
      res.status(404).json({ error: 'Class not found' });
      return;
    }
    if (retentionDays !== undefined && retentionBefore !== dataClass.retentionDays) {
      const u = (req as AuthenticatedRequest).user!;
      void insertAuditSafe({ actor: { type: 'user', id: u.id, label: u.email }, ip: req.ip, action: 'data_class.retention_update', targetType: 'data_class', targetId: dataClass.id, targetLabel: dataClass.name, before: { retentionDays: retentionBefore ?? null }, after: { retentionDays: dataClass.retentionDays } }, (err) => logger.error({ err }, 'audit: retention row lost'));
    }
    res.json({ class: dataClass });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ error: `A class named "${req.body?.name}" already exists` });
      return;
    }
    logger.error({ err: error }, 'Update data class error');
    res.status(500).json({ error: error.message || 'Failed to update class' });
  }
});

app.delete('/data-classes/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    // Guardrail: deleteDataClass has no cascade (data_objects.classId is a
    // plain uuid, not a real FK - advanced-data-modeling-plan.md §4.2's
    // Phase 1 note on drizzle-kit's cross-file FK limit), so deleting a
    // class with existing objects would silently orphan them rather than
    // erroring - blocked outright instead.
    const objects = await listDataObjects(req.params.id);
    if (objects.length > 0) {
      res.status(409).json({ error: `Cannot delete this class: ${objects.length} object(s) still belong to it. Delete those objects first.` });
      return;
    }
    await deleteDataClass(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Delete data class error');
    res.status(500).json({ error: error.message || 'Failed to delete class' });
  }
});

// "Empty data": removes every object of a class (all locales, published or not) and keeps the class. Irreversible, so the caller must
// send the class name back as `confirm` (the dashboard asks the user to type it); GET gives the number to show in that question.
app.get('/data-classes/:id/object-count', requireAnyPermission(PERMISSIONS.DATA_OBJECTS_LIST, PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    res.json({ count: await countDataObjectsByClassId(req.params.id) });
  } catch (error: any) {
    logger.error({ err: error }, 'Count data objects error');
    res.status(500).json({ error: error.message || 'Failed to count objects' });
  }
});

app.post('/data-classes/:id/empty', requireAnyPermission(PERMISSIONS.DATA_OBJECTS_DELETE, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const dataClass = await getDataClass(req.params.id);
    if (!dataClass) {
      res.status(404).json({ error: 'Class not found' });
      return;
    }
    if (req.body?.confirm !== dataClass.name) {
      res.status(400).json({ error: `Send the class name ("${dataClass.name}") as "confirm" to empty it` });
      return;
    }
    const deleted = await deleteDataObjectsByClassId(dataClass.id, { actor: eventActorOf(req) });
    logger.warn({ classId: dataClass.id, className: dataClass.name, deleted, userId: (req as any).user?.id }, 'Data class emptied');
    res.json({ deleted });
  } catch (error: any) {
    logger.error({ err: error }, 'Empty data class error');
    res.status(500).json({ error: error.message || 'Failed to empty the class' });
  }
});

// Component Types - docs/plans/datamodel/component-fields-plan.md. This
// plan's own name for Pimcore's "Field Collection" concept - a named,
// reusable field-list definition a `fieldcollections`-type class field can
// reference by name (`allowedComponentTypes`). Same PERMISSIONS.OBJECTS_*
// triad as every other resource in this file, per that plan's own §3.
// Phase 1 scope only: no in-use guardrail on delete yet (component-fields-
// plan.md §2.5/Phase 4 is real, separate work - deliberately not built
// here, same as this plan's own stated phase boundary).
app.get('/data-components', requireAnyPermission(PERMISSIONS.COMPONENTS_LIST, PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const components = await listDataComponents();
    res.json({ components });
  } catch (error: any) {
    logger.error({ err: error }, 'List data components error');
    res.status(500).json({ error: error.message || 'Failed to list components' });
  }
});

app.get('/data-components/:id', requireAnyPermission(PERMISSIONS.COMPONENTS_VIEW, PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const component = await getDataComponent(req.params.id);
    if (!component) {
      res.status(404).json({ error: 'Component not found' });
      return;
    }
    res.json({ component });
  } catch (error: any) {
    logger.error({ err: error }, 'Get data component error');
    res.status(500).json({ error: error.message || 'Failed to get component' });
  }
});

// Real in-use check - component-fields-plan.md §2.5/Phase 4. Lets
// ComponentSettingsCard.vue show a live warning the same way
// ClassSettingsCard.vue's own `objectCount` already does for classes,
// rather than only surfacing the guardrail reactively via a 409 on save.
app.get('/data-components/:id/usage', requireAnyPermission(PERMISSIONS.COMPONENTS_VIEW, PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const component = await getDataComponent(req.params.id);
    if (!component) {
      res.status(404).json({ error: 'Component not found' });
      return;
    }
    const inUse = await isDataComponentInUse(component.name);
    res.json({ inUse });
  } catch (error: any) {
    logger.error({ err: error }, 'Get data component usage error');
    res.status(500).json({ error: error.message || 'Failed to check component usage' });
  }
});

app.post('/data-components', requireAnyPermission(PERMISSIONS.COMPONENTS_CREATE, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, label, fields } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || typeof label !== 'string' || !label.trim() || !Array.isArray(fields)) {
      res.status(400).json({ error: 'name, label, and fields are required' });
      return;
    }

    const component = await createDataComponent({ name: name.trim(), label: label.trim(), fields });
    res.status(201).json({ component });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ error: `A component named "${req.body?.name}" already exists` });
      return;
    }
    logger.error({ err: error }, 'Create data component error');
    res.status(500).json({ error: error.message || 'Failed to create component' });
  }
});

app.patch('/data-components/:id', requireAnyPermission(PERMISSIONS.COMPONENTS_EDIT, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, label, fields, confirmTypeChange } = req.body ?? {};

    // Guardrail (component-fields-plan.md §2.5/Phase 4) - mirrors PATCH
    // /data-classes/:id's own field-rename/type-change block, one level
    // down: while this Component is referenced by any object's own
    // fieldcollections item, a field disappearing or changing type would
    // silently invalidate data already stored under the old shape.
    if (Array.isArray(fields)) {
      const existing = await getDataComponent(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Component not found' });
        return;
      }
      const inUse = await isDataComponentInUse(existing.name);
      if (inUse) {
        const oldFieldsByName = new Map(existing.fields.map((f) => [f.name, f]));
        const newFieldsByName = new Map(fields.map((f: { name: string }) => [f.name, f]));
        const removed = [...oldFieldsByName.keys()].filter((name) => !newFieldsByName.has(name));
        const typeChanges = [...oldFieldsByName.entries()]
          .filter(([name, old]) => newFieldsByName.has(name) && (newFieldsByName.get(name) as any).fieldType !== old.fieldType)
          .map(([name, old]) => ({ name, from: old.fieldType, to: (newFieldsByName.get(name) as any).fieldType as string }));
        if (removed.length > 0) {
          res.status(409).json({
            error: `Cannot remove or rename these fields while this component is referenced by an existing object: ${removed.join(', ')}. Keep the field name unchanged, or remove the references first.`,
          });
          return;
        }
        // Same as PATCH /data-classes/:id: a type change needs an explicit confirmation.
        if (typeChanges.length > 0 && confirmTypeChange !== true) {
          res.status(409).json({
            code: 'FIELD_TYPE_CHANGE_NEEDS_CONFIRMATION',
            error: `Changing the type of ${typeChanges.map((c) => c.name).join(', ')} affects objects that use this component.`,
            typeChanges,
            objectCount: null,
          });
          return;
        }
      }
    }

    const component = await updateDataComponent(req.params.id, {
      name: typeof name === 'string' ? name : undefined,
      label: typeof label === 'string' ? label : undefined,
      fields: Array.isArray(fields) ? fields : undefined,
    });
    if (!component) {
      res.status(404).json({ error: 'Component not found' });
      return;
    }
    res.json({ component });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ error: `A component named "${req.body?.name}" already exists` });
      return;
    }
    logger.error({ err: error }, 'Update data component error');
    res.status(500).json({ error: error.message || 'Failed to update component' });
  }
});

app.delete('/data-components/:id', requireAnyPermission(PERMISSIONS.COMPONENTS_DELETE, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const component = await getDataComponent(req.params.id);
    if (!component) {
      res.status(404).json({ error: 'Component not found' });
      return;
    }
    const inUse = await isDataComponentInUse(component.name);
    if (inUse) {
      res.status(409).json({ error: 'Cannot delete this component: at least one existing object still references it. Remove those references first.' });
      return;
    }
    await deleteDataComponent(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Delete data component error');
    res.status(500).json({ error: error.message || 'Failed to delete component' });
  }
});

// Migration sources - configured connections to a source Pimcore install,
// letting an admin trigger migrate-classes/migrate-objects on demand from
// the Class Builder instead of needing shell/DB/filesystem access to run
// packages/migration-tool's CLI directly - docs/plans/datamodel/native-
// class-authoring-plan.md §3.4/Phase 4. `listMigrationSources`/
// `getMigrationSource` never return the encrypted password (see that
// records module's own `toRecord` stripping it) - only
// `getMigrationSourceConnectionConfig`, used here strictly server-side to
// build a real DB connection, ever decrypts it.
app.get('/migration-sources', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (_req: Request, res: Response): Promise<void> => {
  try {
    const sources = await listMigrationSources();
    res.json({ sources });
  } catch (error: any) {
    logger.error({ err: error }, 'List migration sources error');
    res.status(500).json({ error: error.message || 'Failed to list migration sources' });
  }
});

app.post('/migration-sources', requirePermission(PERMISSIONS.OBJECTS_WRITE), audited(AUDIT.migrationSourceCreate), async (req: Request, res: Response): Promise<void> => {
  try {
    const { label, dbHost, dbPort, dbUser, dbPassword, dbName, classesPath } = req.body ?? {};
    if (
      typeof label !== 'string' || !label.trim() ||
      typeof dbHost !== 'string' || !dbHost.trim() ||
      typeof dbUser !== 'string' || !dbUser.trim() ||
      typeof dbPassword !== 'string' || !dbPassword ||
      typeof dbName !== 'string' || !dbName.trim() ||
      typeof classesPath !== 'string' || !classesPath.trim()
    ) {
      res.status(400).json({ error: 'label, dbHost, dbUser, dbPassword, dbName, and classesPath are required' });
      return;
    }
    const source = await createMigrationSource({
      label: label.trim(),
      dbHost: dbHost.trim(),
      dbPort: typeof dbPort === 'number' ? dbPort : 3306,
      dbUser: dbUser.trim(),
      dbPassword,
      dbName: dbName.trim(),
      classesPath: classesPath.trim(),
    });
    res.status(201).json({ source });
  } catch (error: any) {
    logger.error({ err: error }, 'Create migration source error');
    res.status(500).json({ error: error.message || 'Failed to create migration source' });
  }
});

app.patch('/migration-sources/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), audited(AUDIT.migrationSourceUpdate), async (req: Request, res: Response): Promise<void> => {
  try {
    const { label, dbHost, dbPort, dbUser, dbPassword, dbName, classesPath } = req.body ?? {};
    const source = await updateMigrationSource(req.params.id, {
      label: typeof label === 'string' ? label : undefined,
      dbHost: typeof dbHost === 'string' ? dbHost : undefined,
      dbPort: typeof dbPort === 'number' ? dbPort : undefined,
      dbUser: typeof dbUser === 'string' ? dbUser : undefined,
      // Omitted entirely (not just falsy) keeps the currently-stored
      // password - see updateMigrationSource's own doc comment.
      dbPassword: typeof dbPassword === 'string' && dbPassword ? dbPassword : undefined,
      dbName: typeof dbName === 'string' ? dbName : undefined,
      classesPath: typeof classesPath === 'string' ? classesPath : undefined,
    });
    if (!source) {
      res.status(404).json({ error: 'Migration source not found' });
      return;
    }
    res.json({ source });
  } catch (error: any) {
    logger.error({ err: error }, 'Update migration source error');
    res.status(500).json({ error: error.message || 'Failed to update migration source' });
  }
});

app.delete('/migration-sources/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), audited(AUDIT.migrationSourceDelete), async (req: Request, res: Response): Promise<void> => {
  try {
    await deleteMigrationSource(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Delete migration source error');
    res.status(500).json({ error: error.message || 'Failed to delete migration source' });
  }
});

// Wraps packages/migration-tool's real migrate-classes/migrate-objects
// logic (runClassMigration/runObjectMigration, refactored from the CLI-
// only migrateClasses/migrateObjects to accept per-request config rather
// than reading process.env - see cli.ts's own comment on those exports)
// rather than reimplementing it, per this plan's own explicit intent.
app.post(
  '/migration-sources/:id/import-classes',
  requirePermission(PERMISSIONS.OBJECTS_WRITE),
  audited(AUDIT.migrationImportClasses),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const source = await getMigrationSource(req.params.id);
      if (!source) {
        res.status(404).json({ error: 'Migration source not found' });
        return;
      }
      const { dryRun, className, overrides } = req.body ?? {};
      const result = await runClassMigration({
        classesDir: source.classesPath,
        dryRun: dryRun === true,
        className: typeof className === 'string' && className ? className : undefined,
        // the user's own choice of fields per class (see /preview-classes): used instead of the parsed ones
        overrides: overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : undefined,
      });
      res.json({ result });
    } catch (error: any) {
      logger.error({ err: error }, 'Import classes error');
      res.status(500).json({ error: error.message || 'Failed to import classes' });
    }
  }
);

// What importing the classes would make (fields and types as parsed), without writing: the screen where the user chooses them.
app.post(
  '/migration-sources/:id/preview-classes',
  requirePermission(PERMISSIONS.OBJECTS_WRITE),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const source = await getMigrationSource(req.params.id);
      if (!source) {
        res.status(404).json({ error: 'Migration source not found' });
        return;
      }
      res.json({ classes: previewClassMigration({ classesDir: source.classesPath }) });
    } catch (error: any) {
      logger.error({ err: error }, 'Preview classes error');
      res.status(500).json({ error: error.message || 'Failed to read the class definitions' });
    }
  }
);

// Object imports started with `background: true` run on after the response; the browser polls the job for "processed of total".
const migrationJobs = createMigrationJobRegistry();

app.get(
  '/migration-sources/import-jobs/:jobId',
  requirePermission(PERMISSIONS.OBJECTS_WRITE),
  (req: Request, res: Response): void => {
    const job = migrationJobs.get(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Import job not found (the server may have restarted)' });
      return;
    }
    res.json({ job });
  }
);

app.post(
  '/migration-sources/:id/import-objects',
  requirePermission(PERMISSIONS.OBJECTS_WRITE),
  audited(AUDIT.migrationImportObjects),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { className, dryRun, limit, clear, background } = req.body ?? {};
      if (typeof className !== 'string' || !className.trim()) {
        res.status(400).json({ error: 'className is required' });
        return;
      }
      const resolved = await getMigrationSourceConnectionConfig(req.params.id);
      if (!resolved) {
        res.status(404).json({ error: 'Migration source not found' });
        return;
      }
      if (background === true) {
        const already = migrationJobs.running(req.params.id, className.trim());
        if (already) {
          res.status(202).json({ jobId: already.id, alreadyRunning: true });
          return;
        }
        const job = migrationJobs.start(req.params.id, className.trim());
        runObjectMigration({
          className: className.trim(),
          source: 'mysql',
          sourceConfig: { ...resolved.connection } as Record<string, unknown>,
          dryRun: dryRun === true,
          limit: typeof limit === 'number' ? limit : undefined,
          clear: clear === true,
          onProgress: (processed, total) => migrationJobs.progress(job.id, processed, total),
        })
          .then((result) => migrationJobs.finish(job.id, result))
          .catch((error: any) => {
            logger.error({ err: error }, 'Import objects (background) error');
            migrationJobs.fail(job.id, error?.message || 'Failed to import objects');
          });
        res.status(202).json({ jobId: job.id });
        return;
      }
      const result = await runObjectMigration({
        className: className.trim(),
        source: 'mysql',
        // runObjectMigration's sourceConfig is a plain Record (it hands
        // this straight to createPimcoreSourceAdapter, which is adapter-
        // name-agnostic and so can't know the mysql adapter's own typed
        // shape) - MigrationSourceConnectionConfig is that same shape,
        // just named for readability at this call site.
        sourceConfig: { ...resolved.connection } as Record<string, unknown>,
        dryRun: dryRun === true,
        limit: typeof limit === 'number' ? limit : undefined,
        clear: clear === true,
      });
      res.json({ result });
    } catch (error: any) {
      logger.error({ err: error }, 'Import objects error');
      res.status(500).json({ error: error.message || 'Failed to import objects' });
    }
  }
);

// Document import + promote - the Documents → Pages migration
// (docs/plans/cms/documents-migration.md §3 Phase 1). import-documents
// wraps runDocumentMigration; with `staging: true` it lands converted pages
// in whoobe_pages_staging (review first, promote later) instead of touching
// the live pages table, and promote-documents copies those staged rows into
// whoobe_pages via the same upsert primitive the direct path uses.
app.post(
  '/migration-sources/:id/import-documents',
  requirePermission(PERMISSIONS.OBJECTS_WRITE),
  audited(AUDIT.migrationImportDocuments),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { dryRun, limit, staging } = req.body ?? {};
      const resolved = await getMigrationSourceConnectionConfig(req.params.id);
      if (!resolved) {
        res.status(404).json({ error: 'Migration source not found' });
        return;
      }
      const result = await runDocumentMigration({
        source: 'mysql',
        sourceConfig: { ...resolved.connection } as Record<string, unknown>,
        dryRun: dryRun === true,
        limit: typeof limit === 'number' ? limit : undefined,
        staging: staging === true,
      });
      res.json({ result });
    } catch (error: any) {
      logger.error({ err: error }, 'Import documents error');
      res.status(500).json({ error: error.message || 'Failed to import documents' });
    }
  }
);

app.post(
  '/migration-sources/:id/promote-documents',
  requirePermission(PERMISSIONS.OBJECTS_WRITE),
  audited(AUDIT.migrationPromoteDocuments),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { dryRun, clear } = req.body ?? {};
      const result = await runPromoteDocuments({
        dryRun: dryRun === true,
        clear: clear === true,
      });
      res.json({ result });
    } catch (error: any) {
      logger.error({ err: error }, 'Promote documents error');
      res.status(500).json({ error: error.message || 'Failed to promote documents' });
    }
  }
);

// Extract embedded collectionTypes from migrated classes into standalone
// data_components records - the CLI's extract-collection-types command,
// exposed through the migration source UI so admins can run it after
// importing classes, no shell access needed. Does not need the Pimcore DB
// (reads data_classes, writes data_components).
app.post(
  '/migration-sources/:id/extract-components',
  requirePermission(PERMISSIONS.OBJECTS_WRITE),
  audited(AUDIT.migrationExtractComponents),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { dryRun, className, clear } = req.body ?? {};
      const result = await runExtractCollectionTypes({
        dryRun: dryRun === true,
        className: typeof className === 'string' && className ? className : undefined,
        clear: clear === true,
      });
      res.json({ result });
    } catch (error: any) {
      logger.error({ err: error }, 'Extract components error');
      res.status(500).json({ error: error.message || 'Failed to extract components' });
    }
  }
);

// Data Object instances (Pimcore's PIM/MDM "Objects") - see docs/plans/
// datamodel/advanced-data-modeling-plan.md §4.2/§6. `?classId=` supports
// ObjectsView.vue's own class filter (§6.2) - a plain query param, not a
// separate route, since it's an optional narrowing of the same list.
app.get('/data-objects', requireAnyPermission(PERMISSIONS.DATA_OBJECTS_LIST, PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined;
    const objects = await listDataObjects(classId);
    res.json({ objects });
  } catch (error: any) {
    logger.error({ err: error }, 'List data objects error');
    res.status(500).json({ error: error.message || 'Failed to list objects' });
  }
});

// Batch actions: publish/unpublish, delete, resolve-assets. Registered
// before /batch and /:id so the path is not captured as an id.
app.post(
  '/data-objects/batch',
  requireAnyPermission(PERMISSIONS.DATA_OBJECTS_CREATE, PERMISSIONS.OBJECTS_WRITE),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { ids, action } = req.body ?? {};
      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: 'ids[] is required' });
        return;
      }
      switch (action) {
        case 'publish':
        case 'unpublish': {
          const published = action === 'publish';
          let succeeded = 0;
          const errors: { id: string; message: string }[] = [];
          for (const id of ids) {
            try {
              const existing = await getDataObject(id);
              if (existing && !mayChangePublished(req, existing.published, published)) {
                errors.push({ id, message: PUBLISH_DENIED.error });
                continue;
              }
              await updateDataObject(id, { published }, { actor: eventActorOf(req) });
              succeeded++;
            } catch (e: any) {
              errors.push({ id, message: e.message });
            }
          }
          res.json({ succeeded, failed: errors.length, errors });
          return;
        }
        case 'delete': {
          let succeeded = 0;
          const errors: { id: string; message: string }[] = [];
          for (const id of ids) {
            try {
              await deleteDataObject(id, { actor: eventActorOf(req) });
              succeeded++;
            } catch (e: any) {
              errors.push({ id, message: e.message });
            }
          }
          res.json({ succeeded, failed: errors.length, errors });
          return;
        }
        case 'resolve-assets': {
          const objects = await getDataObjectsByIds(ids);
          const results: Record<string, Record<string, unknown>> = {};
          for (const obj of objects) {
            const resolved: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(obj.attributes)) {
              if (value && typeof value === 'object' && 'assetId' in (value as any)) {
                resolved[key] = value;
              }
            }
            results[obj.id] = resolved;
          }
          res.json({ results });
          return;
        }
        default:
          res.status(400).json({ error: `Unknown action "${action}". Use publish, unpublish, or delete.` });
      }
    } catch (error: any) {
      logger.error({ err: error }, 'Batch action error');
      res.status(500).json({ error: error.message || 'Failed to process batch action' });
    }
  }
);

// Batch-fetch multiple objects by id - one round-trip for the editor's
// data-binding resolution instead of N single-object requests. Must be
// registered BEFORE the `/:id` route below (Express matches in order, and
// "batch" would otherwise be captured as an :id).
app.get(
  '/data-objects/batch',
  requireAnyPermission(PERMISSIONS.DATA_OBJECTS_LIST, PERMISSIONS.OBJECTS_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const ids = (typeof req.query.ids === 'string' ? req.query.ids : '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const objects = await getDataObjectsByIds(ids);
      res.json({ objects });
    } catch (error: any) {
      logger.error({ err: error }, 'Batch get data objects error');
      res.status(500).json({ error: error.message || 'Failed to batch get objects' });
    }
  }
);

app.get('/data-objects/:id', requireAnyPermission(PERMISSIONS.DATA_OBJECTS_VIEW, PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const dataObject = await getDataObject(req.params.id);
    if (!dataObject) {
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    res.json({ object: dataObject });
  } catch (error: any) {
    logger.error({ err: error }, 'Get data object error');
    res.status(500).json({ error: error.message || 'Failed to get object' });
  }
});

// Every locale variant of the same logical object - same role
// /whoobe-one/pages/:id/translations plays for pages.
app.get(
  '/data-objects/:id/translations',
  requireAnyPermission(PERMISSIONS.DATA_OBJECTS_VIEW, PERMISSIONS.OBJECTS_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const dataObject = await getDataObject(req.params.id);
      if (!dataObject) {
        res.status(404).json({ error: 'Object not found' });
        return;
      }
      const translations = await listDataObjectTranslations(dataObject.translationGroupId);
      res.json({ translations });
    } catch (error: any) {
      logger.error({ err: error }, 'List data object translations error');
      res.status(500).json({ error: error.message || 'Failed to list object translations' });
    }
  }
);

// Same lookup, keyed directly by translationGroupId rather than resolved
// from one specific locale row's id first - MasterObjectTab.vue (admin-
// dashboard) opens a tab per logical record (docs/plans/datamodel/
// data-objects-views-editing.md), and needs this decoupled from
// ObjectsView.vue's own list-level store state (which can be pointed at
// a different class entirely while this tab stays open in the
// background - see that component's own comment on why it doesn't just
// filter the shared list store instead).
app.get(
  '/data-objects/translations/:translationGroupId',
  requireAnyPermission(PERMISSIONS.DATA_OBJECTS_VIEW, PERMISSIONS.OBJECTS_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const translations = await listDataObjectTranslations(req.params.translationGroupId);
      res.json({ translations });
    } catch (error: any) {
      logger.error({ err: error }, 'List data object translations by group error');
      res.status(500).json({ error: error.message || 'Failed to list object translations' });
    }
  }
);

app.post('/data-objects', requireAnyPermission(PERMISSIONS.DATA_OBJECTS_CREATE, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { classId, key, path, parentId, translationGroupId, locale, attributes, pimcoreId } = req.body ?? {};
    if (typeof classId !== 'string' || !classId.trim() || typeof key !== 'string' || !key.trim() || attributes == null) {
      res.status(400).json({ error: 'classId, key, and attributes are required' });
      return;
    }

    const dataObject = await createDataObject({
      classId,
      key: key.trim(),
      path: typeof path === 'string' ? path : undefined,
      parentId: typeof parentId === 'string' ? parentId : null,
      translationGroupId: typeof translationGroupId === 'string' ? translationGroupId : undefined,
      locale: typeof locale === 'string' ? locale : undefined,
      attributes,
      pimcoreId: typeof pimcoreId === 'string' ? pimcoreId : null,
    }, { actor: eventActorOf(req) });
    res.status(201).json({ object: dataObject });
  } catch (error: any) {
    if (error?.code === 'UNIQUE_VIOLATION') {
      res.status(409).json({ error: error.message, field: error.field });
      return;
    }
    if (error?.code === '23505') {
      res.status(409).json({ error: `An object with key "${req.body?.key}" already exists for this class` });
      return;
    }
    logger.error({ err: error }, 'Create data object error');
    res.status(500).json({ error: error.message || 'Failed to create object' });
  }
});

// Import many objects of one class at once (the class-from-file / Integration import): one transaction per request, so the client sends
// chunks. Registered before /data-objects/:id like /batch. Drafts only.
const BULK_IMPORT_MAX_ROWS = 500;
app.post('/data-objects/bulk', requireAnyPermission(PERMISSIONS.DATA_OBJECTS_CREATE, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { classId, rows, onConflict, locale } = req.body ?? {};
    if (typeof classId !== 'string' || !classId.trim() || !Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: 'classId and a non-empty rows array are required' });
      return;
    }
    if (rows.length > BULK_IMPORT_MAX_ROWS) {
      res.status(400).json({ error: `At most ${BULK_IMPORT_MAX_ROWS} rows per request` });
      return;
    }
    if (rows.some((r: any) => !r || typeof r !== 'object' || !r.attributes || typeof r.attributes !== 'object' || Array.isArray(r.attributes) || (r.key != null && typeof r.key !== 'string'))) {
      res.status(400).json({ error: 'Every row needs an attributes object (and, optionally, a string key)' });
      return;
    }
    if (onConflict != null && onConflict !== 'skip' && onConflict !== 'update') {
      res.status(400).json({ error: "onConflict must be 'skip' or 'update'" });
      return;
    }
    const result = await bulkImportDataObjects(classId, rows, { onConflict: onConflict ?? 'skip', locale: typeof locale === 'string' ? locale : undefined, actor: eventActorOf(req) });
    res.status(201).json(result);
  } catch (error: any) {
    if (error?.message === 'Class not found') {
      res.status(404).json({ error: 'Class not found' });
      return;
    }
    logger.error({ err: error }, 'Bulk import data objects error');
    res.status(500).json({ error: error.message || 'Failed to import objects' });
  }
});

app.patch('/data-objects/:id', requireAnyPermission(PERMISSIONS.DATA_OBJECTS_EDIT, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { key, path, parentId, published, workflowState, attributes } = req.body ?? {};

    if (typeof published === 'boolean') {
      const existing = await getDataObject(req.params.id);
      if (existing && !mayChangePublished(req, existing.published, published)) {
        res.status(403).json(PUBLISH_DENIED);
        return;
      }
    }

    const dataObject = await updateDataObject(req.params.id, {
      key: typeof key === 'string' ? key : undefined,
      path: typeof path === 'string' ? path : undefined,
      parentId: parentId === null || typeof parentId === 'string' ? parentId : undefined,
      published: typeof published === 'boolean' ? published : undefined,
      workflowState: workflowState === null || typeof workflowState === 'string' ? workflowState : undefined,
      attributes: attributes !== undefined ? attributes : undefined,
    }, { actor: eventActorOf(req) });
    if (!dataObject) {
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    res.json({ object: dataObject });
  } catch (error: any) {
    if (error?.code === 'UNIQUE_VIOLATION') {
      res.status(409).json({ error: error.message, field: error.field });
      return;
    }
    if (error?.code === '23505') {
      res.status(409).json({ error: `An object with key "${req.body?.key}" already exists for this class` });
      return;
    }
    logger.error({ err: error }, 'Update data object error');
    res.status(500).json({ error: error.message || 'Failed to update object' });
  }
});

app.delete('/data-objects/:id', requireAnyPermission(PERMISSIONS.DATA_OBJECTS_DELETE, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    await deleteDataObject(req.params.id, { actor: eventActorOf(req) });
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Delete data object error');
    res.status(500).json({ error: error.message || 'Failed to delete object' });
  }
});

// Public Data Object API - see docs/plans/backend/object-publish-
// workflow-plan.md §2.2/§7 Phase 1. Deliberately no requireAuth/
// requirePermission here at all (matching /auth/login's own precedent
// for a genuinely public route in this file) - visibility is enforced by
// always going through listPublishedDataObjects/getPublishedDataObject
// (§2.2's "one shared place", packages/core), never by re-deriving a
// `published = true` filter here. `?class=<Name>` resolves to a classId
// the same way the admin `/data-objects?classId=` route already expects
// one, just accepting the human name instead (a public consumer has no
// reason to know an internal class uuid).
app.get('/public/data-objects', async (req: Request, res: Response): Promise<void> => {
  try {
    const className = typeof req.query.class === 'string' ? req.query.class : undefined;
    const locale = typeof req.query.locale === 'string' ? req.query.locale : undefined;
    let classId: string | undefined;
    if (className) {
      const dataClass = await getDataClassByName(className);
      if (!dataClass) {
        res.json({ objects: [] });
        return;
      }
      classId = dataClass.id;
    }
    const objects = await listPublishedDataObjects(classId, locale);
    res.json({ objects });
  } catch (error: any) {
    logger.error({ err: error }, 'List public data objects error');
    res.status(500).json({ error: error.message || 'Failed to list objects' });
  }
});

// Public batch-fetch by id - same published-only gate as the single-object
// endpoint. Must be registered BEFORE the `/:id` route below.
app.get('/public/data-objects/batch', async (req: Request, res: Response): Promise<void> => {
  try {
    const ids = (typeof req.query.ids === 'string' ? req.query.ids : '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const objects = await getPublishedDataObjectsByIds(ids);
    res.json({ objects });
  } catch (error: any) {
    logger.error({ err: error }, 'Batch get public data objects error');
    res.status(500).json({ error: error.message || 'Failed to batch get objects' });
  }
});

// --- Admin query endpoint (no published filter) ---

app.post(
  '/data-objects/query',
  requireAnyPermission(PERMISSIONS.DATA_OBJECTS_LIST, PERMISSIONS.OBJECTS_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { class: className, filters, orderBy, offset, limit, locale } = req.body ?? {};
      if (!className) {
        res.status(400).json({ error: 'class (name) is required' });
        return;
      }
      const dataClass = await getDataClassByName(className);
      if (!dataClass) {
        res.json({ objects: [] });
        return;
      }
      const validOrderBy =
        orderBy && typeof orderBy === 'object' &&
        typeof orderBy.field === 'string' &&
        (orderBy.direction === 'asc' || orderBy.direction === 'desc')
          ? { field: orderBy.field, direction: orderBy.direction }
          : undefined;
      const objects = await queryDataObjects(dataClass.id, {
        filters: Array.isArray(filters) ? filters : undefined,
        orderBy: validOrderBy,
        offset: typeof offset === 'number' && offset > 0 ? offset : undefined,
        limit: typeof limit === 'number' ? limit : undefined,
        locale: typeof locale === 'string' ? locale : undefined,
      });
      res.json({ objects });
    } catch (error: any) {
      logger.error({ err: error }, 'Query data objects error');
      res.status(500).json({ error: error.message || 'Failed to query objects' });
    }
  }
);

// --- Public query endpoint (published only) ---

app.post('/public/data-objects/query', async (req: Request, res: Response): Promise<void> => {
  try {
    const { class: className, filters, orderBy, offset, limit, locale } = req.body ?? {};
    if (!className) {
      res.status(400).json({ error: 'class (name) is required' });
      return;
    }
    const dataClass = await getDataClassByName(className);
    if (!dataClass) {
      res.json({ objects: [] });
      return;
    }
    const validOrderBy =
      orderBy && typeof orderBy === 'object' &&
      typeof orderBy.field === 'string' &&
      (orderBy.direction === 'asc' || orderBy.direction === 'desc')
        ? { field: orderBy.field, direction: orderBy.direction }
        : undefined;
    const objects = await queryPublishedDataObjects(dataClass.id, {
      filters: Array.isArray(filters) ? filters : undefined,
      orderBy: validOrderBy,
      offset: typeof offset === 'number' && offset > 0 ? offset : undefined,
      limit: typeof limit === 'number' ? limit : undefined,
      locale: typeof locale === 'string' ? locale : undefined,
    });
    res.json({ objects });
  } catch (error: any) {
    logger.error({ err: error }, 'Query public data objects error');
    res.status(500).json({ error: error.message || 'Failed to query objects' });
  }
});

// --- File upload in forms (docs/plans/forms/form-upload-plan.md) ---
// Step 1, the "intent": the page asks to send one file for an Upload field. Nothing the visitor says is trusted beyond the field's
// id: the website, its limits and the data class come from the page the field is authored in. The answer is a short-lived signed
// ticket and the address to send the bytes to (asset-processor, PUT /public/upload-data/<ticket>, where the size and the content are
// checked again as the bytes arrive). Step 2 is the form submission, which refers to the uploads by id (attachSubmittedUploads).
const authoredUploadFields = createAuthoredUploadFieldsCache(async () => (await listWhoobePages()).map((p) => ({ content: p.content, websiteId: p.websiteId })));
const uploadIntentLimiter = createFixedWindowLimiter({ max: envLimit('UPLOAD_INTENT_RATE_LIMIT_PER_MINUTE', 20), windowMs: 60_000 });
const UPLOAD_TICKET_TTL_SECONDS = 600;

function websiteUploadLimits(website: { settings?: unknown } | null) {
  return normalizeUploadLimits((website?.settings as Record<string, unknown> | null | undefined)?.uploads);
}

app.post('/public/uploads/intent', async (req: Request, res: Response): Promise<void> => {
  try {
    const secret = uploadTokenSecret();
    if (!secret) { res.status(503).json({ error: 'File upload is not configured on this server' }); return; }
    if (uploadIntentLimiter.hit(req.ip ?? 'unknown')) { res.status(429).json({ error: 'Too many uploads, please try again later' }); return; }
    const { fieldId, filename, size, websiteId: websiteHint } = req.body ?? {};
    const field = typeof fieldId === 'string' ? await authoredUploadFields.lookup(fieldId, typeof websiteHint === 'string' ? websiteHint : null) : null;
    const website = field?.websiteId ? await getWebsite(field.websiteId) : null;
    if (!field || !website) { res.status(404).json({ error: 'Upload field not found' }); return; }
    const limits = effectiveUploadLimits(websiteUploadLimits(website), field.config);
    const verdict = checkUploadIntent(limits, { filename, size }, await websiteUploadBytesToday(website.id));
    if (!verdict.ok) {
      const status = { disabled: 403, name: 400, empty: 400, 'extension-blocked': 415, 'extension-not-allowed': 415, 'too-large': 413, quota: 429 }[verdict.reason];
      res.status(status).json({ error: verdict.message, reason: verdict.reason });
      return;
    }
    const row = await createFormUpload({ websiteId: website.id, formRef: field.fieldId, extension: verdict.extension, originalName: displayFileName(String(filename)), declaredSize: size as number });
    const token = signUploadTicket({ u: row.id, w: website.id, f: field.fieldId, x: verdict.extension, m: limits.maxFileBytes, e: Math.floor(Date.now() / 1000) + UPLOAD_TICKET_TTL_SECONDS }, secret);
    res.status(201).json({ uploadId: row.id, uploadUrl: `${uploadBaseUrl(req)}${FORM_UPLOAD_PUT_PATH}/${token}`, expiresIn: UPLOAD_TICKET_TTL_SECONDS, maxBytes: limits.maxFileBytes });
  } catch (error: any) {
    logger.error({ err: error }, 'Upload intent error');
    res.status(500).json({ error: 'Failed to prepare the upload' });
  }
});

/** Step 3, on submit: the uploads a submitted form refers to (by id, for the Upload fields of the form's own page) become library
 *  assets, and the attribute is replaced by what the data class field stores (`{assetId}`, or a list of them). Every check is made
 *  before the first file is moved. */
async function attachSubmittedUploads(attributes: Record<string, unknown>, dataClass: { id: string; fields?: unknown }): Promise<void> {
  let names = await authoredUploadFields.namesForClass(dataClass.id);
  // a value that is an upload reference for a field not known yet: the page may have been published a moment ago
  if (Object.entries(attributes).some(([k, v]) => !names.includes(k) && readUploadRefs(v))) {
    await authoredUploadFields.refreshIfOlderThan(2_000);
    names = await authoredUploadFields.namesForClass(dataClass.id);
  }
  for (const name of names) {
    if (!(name in attributes)) continue;
    const ids = readUploadRefs(attributes[name]);
    if (!ids) throw new SubmitUploadError(`"${name}" must be files uploaded through the form`);
    const candidates = await authoredUploadFields.forClassAndName(dataClass.id, name);
    const rows = [];
    for (const id of ids) {
      const row = await getFormUpload(id);
      if (!row || row.status !== 'staged') throw new SubmitUploadError('A file was not uploaded or is no longer available: upload it again');
      rows.push(row);
    }
    // The field is the one the files were approved for: all of them for the same field of the same website
    const first = rows[0];
    const field = candidates.find((c) => c.fieldId === first.formRef && c.websiteId === first.websiteId);
    if (!field || rows.some((r) => r.formRef !== field.fieldId || r.websiteId !== field.websiteId)) throw new SubmitUploadError('A file was not uploaded or is no longer available: upload it again');
    const website = field.websiteId ? await getWebsite(field.websiteId) : null;
    if (!website) throw new SubmitUploadError('Upload field not found', 404);
    const limits = effectiveUploadLimits(websiteUploadLimits(website), field.config);
    if (!limits.enabled) throw new SubmitUploadError('File upload is not enabled for this website', 403);
    if (ids.length > limits.maxFiles) throw new SubmitUploadError(`At most ${limits.maxFiles} file(s) in "${name}"`);
    const classField = (Array.isArray(dataClass.fields) ? dataClass.fields : []).find((f: any) => f?.name === name) as { fieldType?: string } | undefined;
    // What the data class field keeps: one file as {assetId} (a relation without a target, asset, image field); several files as a list of
    // asset ids (`array`) or of {assetId} (`json`). The object relation fields hold data objects, not files.
    const kind = classField?.fieldType;
    const many = kind === 'array' || kind === 'json';
    if (!many && ids.length > 1) throw new SubmitUploadError(`"${name}" takes one file`);
    for (const row of rows) {
      if (!limits.allowedExtensions.includes(row.extension)) throw new SubmitUploadError('This kind of file is not accepted');
    }
    const assets: { assetId: string }[] = [];
    for (const row of rows) {
      const r = await fetch(`${ASSET_PROCESSOR_URL}/api/v1/dam/form-uploads/attach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(DAM_SERVICE_TOKEN ? { Authorization: `Bearer ${DAM_SERVICE_TOKEN}` } : {}) },
        body: JSON.stringify({ uploadId: row.id, websiteId: website.id, formRef: field.fieldId, targetFolder: limits.targetFolder, allowPublicFolder: limits.allowPublicFolder }),
      });
      const body: any = await r.json().catch(() => ({}));
      if (!r.ok || !body?.asset?.id) {
        logger.warn({ status: r.status, error: body?.error }, 'Form upload attach failed');
        throw new SubmitUploadError(r.status === 409 ? 'A file was already used by another submission' : 'The file could not be stored, please try again', r.status === 409 ? 409 : 502);
      }
      assets.push({ assetId: body.asset.id });
    }
    attributes[name] = kind === 'array' ? assets.map((a) => a.assetId) : many ? assets : assets[0];
  }
}

// --- Public form submission endpoint (docs/plans/forms/cms-forms.md) ---
// No requireAuth/requirePermission, same as the query endpoint above - a
// site visitor submitting a page's contact/registration/etc. form has no
// admin session. classId (not class name) since the editor's Form element
// config picks a class by id (FormConfigControl.vue), same as
// createDataObject's own classId param below.
app.post('/public/forms/:classId/submit', async (req: Request, res: Response): Promise<void> => {
  try {
    const rateLimitKey = req.ip ?? 'unknown';
    if (isFormSubmitRateLimited(rateLimitKey)) {
      res.status(429).json({ error: 'Too many submissions, please try again later' });
      return;
    }
    recordFormSubmit(rateLimitKey);

    const { attributes, formConfig } = req.body ?? {};
    if (attributes == null || typeof attributes !== 'object') {
      res.status(400).json({ error: 'attributes is required' });
      return;
    }
    // Hidden decoy field a real visitor never fills in - looks like success
    // to whatever submitted it, without revealing it was a trap or that
    // any validation even ran.
    if ((attributes as Record<string, unknown>)._hp) {
      res.status(204).end();
      return;
    }

    const dataClass = await getDataClass(req.params.classId);
    if (!dataClass) {
      res.status(404).json({ error: 'Form target not found' });
      return;
    }

    // Files the visitor uploaded first (see /public/uploads/intent): turned into assets before the class validates the values
    try {
      await attachSubmittedUploads(attributes as Record<string, unknown>, dataClass as { id: string; fields?: unknown });
    } catch (uploadError) {
      if (uploadError instanceof SubmitUploadError) { res.status(uploadError.status).json({ error: uploadError.message }); return; }
      throw uploadError;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = compileDynamicSchema({ id: dataClass.id, name: dataClass.name, fields: dataClass.fields as any }).parse(
        attributes
      ) as Record<string, unknown>;
    } catch (validationError: any) {
      // zod's own message is a JSON dump of every issue: say it plainly (`lastName: Required`) and keep the per-field map for the client
      const issues: { path?: (string | number)[]; message?: string }[] = Array.isArray(validationError?.issues) ? validationError.issues : [];
      const fieldErrors: Record<string, string> = {};
      for (const issue of issues) fieldErrors[issue.path?.join('.') || '(form)'] = issue.message || 'Invalid';
      const error = issues.length ? Object.entries(fieldErrors).map(([f, m]) => `${f}: ${m}`).join('; ') : validationError?.message || 'Invalid submission';
      res.status(400).json({ error, fields: fieldErrors });
      return;
    }

    // Lands unpublished by default (createDataObject doesn't set
    // `published`) - a deliberate side effect, not an oversight: every
    // submission is a draft an admin has to actively review/publish in
    // Object View before it's visible anywhere, not auto-live.
    await createDataObject({
      classId: dataClass.id,
      key: `sub-${randomUUID()}`,
      attributes: parsed,
    }, { actor: { type: 'system', id: 'form-submission' } });

    // Own try/catch, separate from the main handler's - a misconfigured or
    // failing mailer must never turn a successful Data Object write into a
    // 500 for the visitor. The client includes the Form's own `notify`
    // config in the submit payload (it already has it in hand at submit
    // time), so no separate server-side lookup is needed.
    //
    // Notification emails personalize against what the visitor actually
    // submitted, not the class-validated `parsed` subset - `parsed` drops
    // unknown fields (Zod's z.object() strips by default), so a template
    // referencing {form.message} would render empty for any input that
    // isn't a declared field on the target Data Class. The renderer
    // HTML-escapes every bound/token value, so the raw attributes are safe.
    const submitted = { ...(attributes as Record<string, unknown>) };
    delete submitted._hp;

    const notify = formConfig?.notify;
    if (notify?.enabled) {
      try {
        // The block comes from the visitor's request: it counts only if it is the one an author configured.
        const authored = await authoredFormNotify.lookup(notifyKey(dataClass.id, notify));
        if (!authored) {
          logger.warn({ classId: dataClass.id }, 'Form notify ignored: not the notify block of any form');
          res.status(201).json({ success: true });
          return;
        }
        // A mail template id is the primary reference (docs/plans/forms/
        // mail-templates.md); the legacy templatePageId (a whoobe_pages
        // row) stays supported so already-saved Forms keep working. The
        // recipient comes from notify.recipientEmail when set, otherwise
        // from the template's own (possibly dynamic) `to` field.
        if (notify.mailTemplateId) {
          const template = await getMailTemplate(notify.mailTemplateId);
          // same context sendMailFromTemplate renders with: the submitted fields live under `form`
          const recipient = substituteTokensPlain(String(notify.recipientEmail || template?.to || ''), { form: submitted }).trim();
          if (template && (!isSingleEmail(recipient) || !formNotifyRecipients.take(recipient))) {
            logger.warn({ classId: dataClass.id }, 'Form notify skipped: recipient is not a single address, or over the hourly limit');
          } else if (template) {
            await sendMailFromTemplate({
              template,
              context: { form: submitted },
              to: notify.recipientEmail || undefined,
              subject: notify.subject || undefined,
              websiteId: authored.websiteId,
            });
          } else {
            logger.warn(`Form notify: mail template ${notify.mailTemplateId} not found`);
          }
        } else if (notify.templatePageId && notify.recipientEmail) {
          const page = await getWhoobePage(notify.templatePageId);
          if (page && (!isSingleEmail(String(notify.recipientEmail).trim()) || !formNotifyRecipients.take(String(notify.recipientEmail)))) {
            logger.warn({ classId: dataClass.id }, 'Form notify skipped: recipient is not a single address, or over the hourly limit');
          } else if (page) {
            const imageUrls = await resolveMailImageUrls(page.content);
            const html = buildMailDocument({
              bodyHtml: renderMailTemplate(page.content, submitted, imageUrls),
              fonts: collectMailFonts(page.content),
            });
            await sendMail({
              to: notify.recipientEmail,
              subject: notify.subject || 'New form submission',
              html,
              websiteId: authored.websiteId,
            });
          } else {
            logger.warn(`Form notify: template page ${notify.templatePageId} not found`);
          }
        }
      } catch (notifyError) {
        logger.warn({ err: notifyError }, 'Form notify email failed');
      }
    }

    res.status(201).json({ success: true });
  } catch (error: any) {
    if (error?.code === 'UNIQUE_VIOLATION') {
      // a `unique` field of the class: tell the visitor which one (never what is stored)
      res.status(409).json({ error: `${error.title || error.field} is already in use`, field: error.field });
      return;
    }
    logger.error({ err: error }, 'Form submit error');
    res.status(500).json({ error: 'Failed to submit form' });
  }
});

// Global outgoing-mail config (docs/plans/forms/cms-forms.md's Phase 2) -
// GET never returns the stored password, only whether one is set, so the
// admin-dashboard settings form can't leak it back out over the wire.
// Outgoing-mail configuration. The installation has one DEFAULT configuration; a website may have one of its own
// (`websiteId`), and then its mail goes out with that instead. Each is SMTP or an HTTP mail provider (core's
// mail-providers/*.json: OneSignal ...). Secrets (SMTP password, provider API keys) are write-only: they are encrypted
// at rest and never returned, a blank one on save means "keep the stored value".
async function mailScope(req: Request, res: Response, source: 'query' | 'body'): Promise<{ websiteId: string | null } | null> {
  const raw = source === 'query' ? req.query.websiteId : req.body?.websiteId;
  if (raw === undefined || raw === null || raw === '') return { websiteId: null };
  if (typeof raw !== 'string' || !/^[0-9a-f-]{36}$/i.test(raw) || !(await getWebsite(raw))) {
    res.status(404).json({ error: 'Website not found' });
    return null;
  }
  return { websiteId: raw };
}

app.get('/mail-providers', requirePermission(PERMISSIONS.SETTINGS_MANAGE), (_req: Request, res: Response): void => {
  res.json(mailProviders.all().map((p) => ({ id: p.id, label: p.label, description: p.description ?? null, docsUrl: p.docsUrl ?? null, configFields: p.configFields, capabilities: p.capabilities ?? {} })));
});

app.get('/mail-settings', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const sc = await mailScope(req, res, 'query');
    if (!sc) return;
    const own = await getMailSettingsFor(sc.websiteId);
    const effective = await resolveMailSettings(sc.websiteId);
    res.json({
      websiteId: sc.websiteId,
      // this scope's own configuration (null = none yet; for a website: it uses the default)
      settings: own ? publicMailSettings(own, sc.websiteId ? 'website' : 'default', mailProviders.get(own.provider)) : null,
      // what a message of this scope is sent with
      effective: effective ? { scope: effective.scope, provider: effective.settings.provider, fromAddress: effective.settings.fromAddress } : null,
      encryptionConfigured: mailEncryptionConfigured(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Mail settings fetch error');
    res.status(500).json({ error: 'Failed to fetch mail settings' });
  }
});

app.put('/mail-settings', requirePermission(PERMISSIONS.SETTINGS_MANAGE), audited(AUDIT.mailSettingsUpdate), async (req: Request, res: Response): Promise<void> => {
  try {
    const sc = await mailScope(req, res, 'body');
    if (!sc) return;
    const { provider, smtp, providerConfig, fromAddress, fromName, bccFromAddress } = req.body ?? {};
    // the old flat shape (host, port ... at the top level) still means SMTP
    const legacy = req.body?.host !== undefined ? { host: req.body.host, port: req.body.port, secure: req.body.secure, user: req.body.user, password: req.body.password } : undefined;
    const kind = typeof provider === 'string' && provider ? provider : 'smtp';
    const from = typeof fromAddress === 'string' && fromAddress.trim() ? fromAddress.trim() : null;

    if (kind === 'smtp') {
      const c = smtp ?? legacy ?? {};
      if (!c.host || !c.port || !from) {
        res.status(400).json({ error: 'host, port, and fromAddress are required' });
        return;
      }
      const updated = await upsertMailSettings(sc.websiteId, {
        provider: 'smtp',
        smtp: { host: String(c.host), port: Number(c.port), secure: !!c.secure, user: c.user ? String(c.user) : null, password: typeof c.password === 'string' ? c.password : null, clearPassword: c.clearPassword === true },
        fromAddress: from,
        fromName: fromName || null,
        bccFromAddress: !!bccFromAddress,
      });
      res.json({ settings: publicMailSettings(updated, sc.websiteId ? 'website' : 'default') });
      return;
    }

    const def = mailProviders.get(kind);
    if (!def) {
      res.status(400).json({ error: `Unknown mail provider "${kind}"` });
      return;
    }
    const given = providerConfig && typeof providerConfig === 'object' ? (providerConfig as Record<string, unknown>) : {};
    const stored = (await getMailSettingsFor(sc.websiteId)) ?? undefined;
    const storedConfig = stored?.provider === kind ? stored.providerConfig : {};
    const missing = def.configFields.filter((f) => f.required && !String(given[f.name] ?? '').trim() && !(f.secret && storedConfig[f.name]));
    if (missing.length) {
      res.status(400).json({ error: `${missing.map((f) => f.label).join(', ')} ${missing.length > 1 ? 'are' : 'is'} required` });
      return;
    }
    const updated = await upsertMailSettings(sc.websiteId, {
      provider: kind,
      providerDefinition: def,
      providerConfig: given,
      fromAddress: from,
      fromName: fromName || null,
      bccFromAddress: !!bccFromAddress,
    });
    res.json({ settings: publicMailSettings(updated, sc.websiteId ? 'website' : 'default', def) });
  } catch (error: any) {
    if (error instanceof MailEncryptionKeyMissingError) {
      res.status(400).json({ error: error.message });
      return;
    }
    logger.error({ err: error }, 'Mail settings update error');
    res.status(500).json({ error: 'Failed to update mail settings' });
  }
});

// A website stops having its own configuration and sends with the default again. The default itself cannot be removed.
app.delete('/mail-settings', requirePermission(PERMISSIONS.SETTINGS_MANAGE), audited(AUDIT.mailSettingsDelete), async (req: Request, res: Response): Promise<void> => {
  try {
    const sc = await mailScope(req, res, 'query');
    if (!sc) return;
    if (!sc.websiteId) {
      res.status(400).json({ error: 'The default configuration cannot be removed; give websiteId to remove a website\'s own' });
      return;
    }
    res.json({ removed: await deleteMailSettings(sc.websiteId) });
  } catch (error) {
    logger.error({ err: error }, 'Mail settings delete error');
    res.status(500).json({ error: 'Failed to remove mail settings' });
  }
});

// Sends a test email with the configuration of the given scope (the default, or a website's own - or, for a website
// without one, the default it falls back to) - the "Email Test" card in the mail settings UI. Unlike the
// form-notification path it lets the admin override the from address and pass a cc, so delivery can be verified end to
// end.
app.post('/mail-settings/test', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const sc = await mailScope(req, res, 'body');
    if (!sc) return;
    const { from, to, cc, subject, html, text } = req.body ?? {};
    if (!to || !subject) {
      res.status(400).json({ error: 'to and subject are required' });
      return;
    }
    await sendMail({
      to,
      subject,
      from: typeof from === 'string' && from.trim() ? from.trim() : undefined,
      cc: typeof cc === 'string' && cc.trim() ? cc.trim() : undefined,
      html: typeof html === 'string' ? html : '',
      text: typeof text === 'string' && text.trim() ? text : undefined,
      websiteId: sc.websiteId,
    });
    res.json({ ok: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Mail test error');
    res.status(500).json({ error: error?.message || 'Failed to send test email' });
  }
});

// Outgoing mail log (Settings → Mail → Log) - every sendMail() attempt,
// newest first by default. Read-only listing: rows are only ever deleted
// via POST /mail-log/delete. `status` (sent|failed), `search` (matches to,
// subject, and status), `order` (newest|oldest), `limit` (default 100,
// cap 500) and `offset` narrow the result. Returns `total` (matching count)
// alongside the page so the UI can paginate. The list strips the message
// body - fetch a single entry (GET /mail-log/:id) for the preview modal.
app.get('/mail-log', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, search, order, limit, offset } = req.query;
    const result = await listMailLog({
      status: status === 'sent' || status === 'failed' ? status : undefined,
      search: typeof search === 'string' ? search : undefined,
      order: order === 'oldest' ? 'oldest' : 'newest',
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    const records = result.records.map(({ html: _h, text: _t, ...rest }) => rest);
    res.json({ records, total: result.total });
  } catch (error: any) {
    logger.error({ err: error }, 'Mail log fetch error');
    res.status(500).json({ error: error.message || 'Failed to fetch mail log' });
  }
});

// Bulk-delete selected log entries from the admin Log view. Read-only
// guards already prevent editing other data; this is the one write the log
// allows, so admins can prune noise without touching the rest of the table.
app.post('/mail-log/delete', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { ids } = req.body ?? {};
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids array is required' });
      return;
    }
    const validIds = ids.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0);
    const deleted = await deleteMailLogEntries(validIds);
    res.json({ deleted });
  } catch (error: any) {
    logger.error({ err: error }, 'Mail log delete error');
    res.status(500).json({ error: error.message || 'Failed to delete mail log entries' });
  }
});

// Mail templates (docs/plans/forms/mail-templates.md) - reusable email
// bodies referenced by Form notify configs (and future triggers). The list
// returns metadata only; the full Element tree / text body is fetched per
// template (GET /mail-templates/:id) for editing and rendering.
// ---- Object events: subscriptions and their delivery log (docs/plans/datamodel/data-objects-automations.md) ----
// Admin only (`object_events:manage`); refused in the public sandbox by path (sandbox.ts). The subscription points at a Gateway endpoint and route:
// credentials, SSRF checks and the outbound allow-list stay in the Gateway, which also delivers (apps/gateway/src/object-event-worker.ts).
const OBJECT_EVENT_ROUTE_METHODS = ['POST', 'PUT', 'PATCH'];

async function objectEventTargetProblem(endpointId: string, routeId: string): Promise<string | null> {
  const endpoint = await getGatewayEndpoint(endpointId);
  if (!endpoint) return 'The Gateway endpoint does not exist';
  const route = await getGatewayRoute(routeId);
  if (!route || route.endpointId !== endpoint.id) return 'The route does not exist on this endpoint';
  if (!OBJECT_EVENT_ROUTE_METHODS.includes(route.method.toUpperCase())) return 'The route must be POST, PUT or PATCH';
  if (route.path.includes('{')) return 'The route must have a fixed path (no {parameters})';
  return null;
}

app.get('/object-event-subscriptions', requirePermission(PERMISSIONS.OBJECT_EVENTS_MANAGE), async (_req: Request, res: Response): Promise<void> => {
  try {
    const [subscriptions, fired] = await Promise.all([listObjectEventSubscriptions(), loopGuardFiredBySubscription()]);
    res.json({ subscriptions: subscriptions.map((s) => ({ ...s, loopGuardFiredAt: fired.get(s.id)?.toISOString() ?? null })) });
  } catch (error: any) {
    logger.error({ err: error }, 'List object event subscriptions error');
    res.status(500).json({ error: 'Failed to list the subscriptions' });
  }
});

app.post('/object-event-subscriptions', requirePermission(PERMISSIONS.OBJECT_EVENTS_MANAGE), audited(AUDIT.subscriptionCreate), async (req: Request, res: Response): Promise<void> => {
  try {
    const checked = validateSubscriptionInput(req.body, false);
    if (!checked.ok) { res.status(400).json({ error: checked.error }); return; }
    const v = checked.value as Required<Pick<typeof checked.value, 'name' | 'events' | 'endpointId' | 'routeId'>> & typeof checked.value;
    if (v.classId && !(await getDataClass(v.classId))) { res.status(400).json({ error: 'The class does not exist' }); return; }
    const problem = await objectEventTargetProblem(v.endpointId, v.routeId);
    if (problem) { res.status(400).json({ error: problem }); return; }
    const subscription = await createObjectEventSubscription({
      name: v.name,
      enabled: v.enabled ?? true,
      classId: v.classId ?? null,
      events: v.events,
      endpointId: v.endpointId,
      routeId: v.routeId,
      payloadMode: 'minimal',
      ignoreActors: v.ignoreActors ?? [],
      signingSecretRef: v.signingSecretRef ?? null,
    });
    logger.info({ subscriptionId: subscription.id, name: subscription.name, userId: (req as any).user?.id }, 'Object event subscription created');
    res.status(201).json({ subscription });
  } catch (error: any) {
    if ((error?.code ?? error?.cause?.code) === '23505') { res.status(409).json({ error: 'A subscription with this name already exists' }); return; }
    logger.error({ err: error }, 'Create object event subscription error');
    res.status(500).json({ error: 'Failed to create the subscription' });
  }
});

app.get('/object-event-subscriptions/:id', requirePermission(PERMISSIONS.OBJECT_EVENTS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const subscription = await getObjectEventSubscription(req.params.id);
    if (!subscription) { res.status(404).json({ error: 'Subscription not found' }); return; }
    res.json({ subscription });
  } catch (error: any) {
    if (error?.code === '22P02') { res.status(404).json({ error: 'Subscription not found' }); return; }
    logger.error({ err: error }, 'Get object event subscription error');
    res.status(500).json({ error: 'Failed to read the subscription' });
  }
});

app.patch('/object-event-subscriptions/:id', requirePermission(PERMISSIONS.OBJECT_EVENTS_MANAGE), audited(AUDIT.subscriptionUpdate), async (req: Request, res: Response): Promise<void> => {
  try {
    const existing = await getObjectEventSubscription(req.params.id);
    if (!existing) { res.status(404).json({ error: 'Subscription not found' }); return; }
    const checked = validateSubscriptionInput(req.body, true);
    if (!checked.ok) { res.status(400).json({ error: checked.error }); return; }
    const v = checked.value;
    if (v.classId && !(await getDataClass(v.classId))) { res.status(400).json({ error: 'The class does not exist' }); return; }
    if (v.endpointId !== undefined || v.routeId !== undefined) {
      const problem = await objectEventTargetProblem(v.endpointId ?? existing.endpointId ?? '', v.routeId ?? existing.routeId ?? '');
      if (problem) { res.status(400).json({ error: problem }); return; }
    }
    const subscription = await updateObjectEventSubscription(req.params.id, v);
    logger.info({ subscriptionId: req.params.id, fields: Object.keys(v), userId: (req as any).user?.id }, 'Object event subscription updated');
    res.json({ subscription });
  } catch (error: any) {
    if (error?.code === '22P02') { res.status(404).json({ error: 'Subscription not found' }); return; }
    if ((error?.code ?? error?.cause?.code) === '23505') { res.status(409).json({ error: 'A subscription with this name already exists' }); return; }
    logger.error({ err: error }, 'Update object event subscription error');
    res.status(500).json({ error: 'Failed to update the subscription' });
  }
});

app.delete('/object-event-subscriptions/:id', requirePermission(PERMISSIONS.OBJECT_EVENTS_MANAGE), audited(AUDIT.subscriptionDelete), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!(await deleteObjectEventSubscription(req.params.id))) { res.status(404).json({ error: 'Subscription not found' }); return; }
    logger.info({ subscriptionId: req.params.id, userId: (req as any).user?.id }, 'Object event subscription deleted');
    res.json({ success: true });
  } catch (error: any) {
    if (error?.code === '22P02') { res.status(404).json({ error: 'Subscription not found' }); return; }
    logger.error({ err: error }, 'Delete object event subscription error');
    res.status(500).json({ error: 'Failed to delete the subscription' });
  }
});

app.post('/object-event-subscriptions/:id/test', requirePermission(PERMISSIONS.OBJECT_EVENTS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const queued = await sendTestObjectEvent(req.params.id, eventActorOf(req));
    if (!queued) { res.status(404).json({ error: 'Subscription not found' }); return; }
    res.status(202).json({ queued: true, ...queued });
  } catch (error: any) {
    if (error?.code === '22P02') { res.status(404).json({ error: 'Subscription not found' }); return; }
    logger.error({ err: error }, 'Test object event error');
    res.status(500).json({ error: 'Failed to queue the test event' });
  }
});

app.get('/object-event-subscriptions/:id/deliveries', requirePermission(PERMISSIONS.OBJECT_EVENTS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    if (status && !['pending', 'delivered', 'retrying', 'dead', 'stopped'].includes(status)) { res.status(400).json({ error: 'status must be pending, delivered, retrying, dead or stopped' }); return; }
    if (!(await getObjectEventSubscription(req.params.id))) { res.status(404).json({ error: 'Subscription not found' }); return; }
    const limit = Number.parseInt(String(req.query.limit ?? ''), 10);
    const type = typeof req.query.type === 'string' && req.query.type ? req.query.type : undefined;
    res.json({ deliveries: await listDeliveries(req.params.id, { status, type, limit: Number.isFinite(limit) ? limit : undefined }) });
  } catch (error: any) {
    if (error?.code === '22P02') { res.status(404).json({ error: 'Subscription not found' }); return; }
    logger.error({ err: error }, 'List object event deliveries error');
    res.status(500).json({ error: 'Failed to list the deliveries' });
  }
});

// Clears finished deliveries (delivered, dead, stopped) from a subscription's log: the ids in the body, or every one with `status`.
app.delete('/object-event-subscriptions/:id/deliveries', requirePermission(PERMISSIONS.OBJECT_EVENTS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { ids, status } = (req.body ?? {}) as { ids?: unknown; status?: unknown };
    const idList = Array.isArray(ids) && ids.every((x) => typeof x === 'string') ? (ids as string[]).slice(0, 500) : undefined;
    if (ids !== undefined && !idList) { res.status(400).json({ error: 'ids must be a list of delivery ids' }); return; }
    if (status !== undefined && !['delivered', 'dead', 'stopped'].includes(String(status))) { res.status(400).json({ error: 'Only delivered, dead or stopped deliveries can be cleared' }); return; }
    if (!idList && status === undefined) { res.status(400).json({ error: 'Say which deliveries: ids, or a status' }); return; }
    if (!(await getObjectEventSubscription(req.params.id))) { res.status(404).json({ error: 'Subscription not found' }); return; }
    const removed = await deleteDeliveries(req.params.id, { ids: idList, status: status === undefined ? undefined : String(status) });
    logger.info({ subscriptionId: req.params.id, removed, userId: (req as any).user?.id }, 'Object event deliveries cleared');
    res.json({ removed });
  } catch (error: any) {
    if (error?.code === '22P02') { res.status(404).json({ error: 'Subscription or delivery not found' }); return; }
    logger.error({ err: error }, 'Clear object event deliveries error');
    res.status(500).json({ error: 'Failed to clear the deliveries' });
  }
});

app.post('/object-event-deliveries/:id/retry', requirePermission(PERMISSIONS.OBJECT_EVENTS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await retryDeadDelivery(req.params.id);
    if (result === 'not-found') { res.status(404).json({ error: 'Delivery not found' }); return; }
    if (result === 'not-dead') { res.status(409).json({ error: 'Only a dead delivery can be retried' }); return; }
    logger.info({ deliveryId: req.params.id, userId: (req as any).user?.id }, 'Object event delivery retried');
    res.status(202).json({ queued: true });
  } catch (error: any) {
    if (error?.code === '22P02') { res.status(404).json({ error: 'Delivery not found' }); return; }
    logger.error({ err: error }, 'Retry object event delivery error');
    res.status(500).json({ error: 'Failed to retry the delivery' });
  }
});

app.get('/mail-templates', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (_req: Request, res: Response): Promise<void> => {
  try {
    const templates = await listMailTemplates();
    res.json({ templates });
  } catch (error: any) {
    logger.error({ err: error }, 'Mail templates fetch error');
    res.status(500).json({ error: error.message || 'Failed to fetch mail templates' });
  }
});

app.post('/mail-templates', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, kind, description, subject, to, bcc, content, body } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    if (kind !== 'html' && kind !== 'text') {
      res.status(400).json({ error: 'kind must be "html" or "text"' });
      return;
    }
    const template = await createMailTemplate({
      name: name.trim(),
      kind,
      description: typeof description === 'string' ? description : null,
      subject: typeof subject === 'string' ? subject : null,
      to: typeof to === 'string' ? to : null,
      bcc: typeof bcc === 'string' ? bcc : null,
      content: kind === 'html' ? (content ?? null) : null,
      body: kind === 'text' ? (typeof body === 'string' ? body : '') : null,
    });
    res.status(201).json({ template });
  } catch (error: any) {
    logger.error({ err: error }, 'Mail template create error');
    res.status(500).json({ error: error.message || 'Failed to create mail template' });
  }
});

app.get('/mail-templates/:id', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const template = await getMailTemplate(req.params.id);
    if (!template) {
      res.status(404).json({ error: 'Mail template not found' });
      return;
    }
    res.json({ template });
  } catch (error: any) {
    logger.error({ err: error }, 'Mail template fetch error');
    res.status(500).json({ error: error.message || 'Failed to fetch mail template' });
  }
});

app.patch('/mail-templates/:id', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, kind, description, subject, to, bcc, content, body } = req.body ?? {};
    if (kind !== undefined && kind !== 'html' && kind !== 'text') {
      res.status(400).json({ error: 'kind must be "html" or "text"' });
      return;
    }
    const existing = await getMailTemplate(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Mail template not found' });
      return;
    }
    const template = await updateMailTemplate(req.params.id, {
      ...(name !== undefined ? { name: typeof name === 'string' ? name : existing.name } : {}),
      ...(kind !== undefined ? { kind } : {}),
      ...(description !== undefined ? { description: typeof description === 'string' ? description : null } : {}),
      ...(subject !== undefined ? { subject: typeof subject === 'string' ? subject : null } : {}),
      ...(to !== undefined ? { to: typeof to === 'string' ? to : null } : {}),
      ...(bcc !== undefined ? { bcc: typeof bcc === 'string' ? bcc : null } : {}),
      ...(content !== undefined ? { content: content ?? null } : {}),
      ...(body !== undefined ? { body: typeof body === 'string' ? body : null } : {}),
    });
    res.json({ template });
  } catch (error: any) {
    logger.error({ err: error }, 'Mail template update error');
    res.status(500).json({ error: error.message || 'Failed to update mail template' });
  }
});

app.delete('/mail-templates/:id', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    await deleteMailTemplate(req.params.id);
    res.json({ ok: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Mail template delete error');
    res.status(500).json({ error: error.message || 'Failed to delete mail template' });
  }
});

// Renders an HTML mail template through the exact same DAM/Tailwind
// pipeline a Form notification's own send uses, plus a plain-text
// fallback - the shared step any campaign-sending integration needs before
// handing the result to an ESP's own API (BrevoCampaignModal.vue's "Send
// as Brevo Campaign" action is the first caller). Uses renderStaticHtml()
// rather than renderMailTemplate(), and returns `subject` completely raw -
// this app's own `{namespace.field}` token pass has no context to resolve
// here (no form/site/user - a campaign isn't triggered by any of those)
// and, worse, its regex matches ANY bare `{word}`/`{word.word}` substring
// with no namespace check, including one embedded inside an ESP's own
// `{{ }}` syntax - running it here wouldn't leave an ESP's own merge tags
// (e.g. Brevo's required `{unsubscribe}`) alone, it would blank them out.
app.post('/mail-templates/:id/render', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const template = await getMailTemplate(req.params.id);
    if (!template) {
      res.status(404).json({ error: 'Mail template not found' });
      return;
    }
    if (template.kind !== 'html') {
      res.status(400).json({ error: 'Only HTML templates can be rendered' });
      return;
    }
    const embedImages = req.body?.embedImages !== false;
    const rendered = await renderElementTreeForEmail(template.content, embedImages);
    res.json({ ...rendered, subject: template.subject });
  } catch (error: any) {
    logger.error({ err: error }, 'Mail template render error');
    res.status(500).json({ error: error.message || 'Failed to render mail template' });
  }
});

// Full log entry including the stored body, for the admin preview modal.
app.get('/mail-log/:id', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const entry = await getMailLogEntry(req.params.id);
    if (!entry) {
      res.status(404).json({ error: 'Mail log entry not found' });
      return;
    }
    res.json(entry);
  } catch (error: any) {
    logger.error({ err: error }, 'Mail log entry fetch error');
    res.status(500).json({ error: error.message || 'Failed to fetch mail log entry' });
  }
});

// Resends a logged email verbatim (stored to/from/cc/subject/body).
// sendMail() records the resend as a fresh log row, so the resend itself
// shows up in the log with its own status.
app.post('/mail-log/:id/resend', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const entry = await getMailLogEntry(req.params.id);
    if (!entry) {
      res.status(404).json({ error: 'Mail log entry not found' });
      return;
    }
    await sendMail({
      to: entry.to,
      from: entry.from ?? undefined,
      cc: entry.cc ?? undefined,
      subject: entry.subject,
      html: entry.html ?? '',
      text: entry.text ?? undefined,
      // sent again with the configuration of the website it was sent for
      websiteId: entry.websiteId,
    });
    res.json({ ok: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Mail resend error');
    res.status(500).json({ error: error.message || 'Failed to resend email' });
  }
});

// AI generation config (docs/plans/ai/ai-pages-snippets-generator.md) -
// same shape as mail-settings: single global row, GET never returns the
// stored API key (only `hasApiKey`), PUT treats a blank key as
// "keep the existing one".
app.get('/ai/settings', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const settings = await getAiSettings(req.user!.id);
    if (!settings) {
      res.json(null);
      return;
    }
    const { apiKey, ...rest } = settings;
    res.json({ ...rest, hasApiKey: !!apiKey });
  } catch (error) {
    logger.error({ err: error }, 'AI settings fetch error');
    res.status(500).json({ error: 'Failed to fetch AI settings' });
  }
});

app.put('/ai/settings', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { provider, model, endpoint, apiKey } = req.body ?? {};
    if (!provider || !model) {
      res.status(400).json({ error: 'provider and model are required' });
      return;
    }
    const existing = await getAiSettings(req.user!.id);
    const updated = await upsertAiSettings(req.user!.id, {
      provider,
      model,
      endpoint: endpoint || null,
      apiKey: apiKey ? apiKey : existing?.apiKey ?? null,
    });
    const { apiKey: _ak, ...rest } = updated;
    res.json({ ...rest, hasApiKey: !!updated.apiKey });
  } catch (error) {
    logger.error({ err: error }, 'AI settings update error');
    res.status(500).json({ error: 'Failed to update AI settings' });
  }
});

// AI generation - POST /ai/generate (gated on OBJECTS_WRITE, same as the
// whoobe-one page routes it feeds): builds the prompt from the stored
// settings, calls the configured provider, structurally validates the
// returned Element tree (snippet/page) or returns the plain text (text),
// and logs the whole exchange into whoobe_ai_generated.
app.post('/ai/generate', requirePermission(PERMISSIONS.OBJECTS_WRITE), aiRateLimit, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { kind, prompt, context } = req.body ?? {};
  if (kind !== 'snippet' && kind !== 'page' && kind !== 'text') {
    res.status(400).json({ error: 'kind must be "snippet", "page", or "text"' });
    return;
  }
  if (typeof prompt !== 'string' || !prompt.trim()) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }
  const settings = await getAiSettings(req.user!.id);
  if (!settings || !settings.apiKey) {
    res.status(400).json({ error: 'AI is not configured. Save the provider, model, and API key in Settings → AI first.' });
    return;
  }

  if (kind === 'text') {
    try {
      const result = await generateAiJson({
        settings: { provider: settings.provider, model: settings.model, endpoint: settings.endpoint, apiKey: settings.apiKey },
        systemPrompt: '',
        userPrompt: buildTextPrompt({
          tag: typeof context?.tag === 'string' ? context.tag : 'p',
          existingContent: typeof context?.existingContent === 'string' ? context.existingContent : null,
          roleHint: typeof context?.roleHint === 'string' ? context.roleHint : null,
          prompt: prompt.trim(),
        }),
        maxTokens: 1024,
        raw: true,
      });
      const text = typeof result.json === 'string' ? result.json : (result.rawText || '');
      res.json({ text });
    } catch (error: any) {
      const message = error instanceof AiGenerationError ? error.message : (error?.message || 'AI text generation failed');
      res.status(error instanceof AiGenerationError && error.status ? error.status : 500).json({ error: message });
    }
    return;
  }
  const ctx = {
    kind,
    prompt: prompt.trim(),
    selectedTag: typeof context?.selectedTag === 'string' ? context.selectedTag : null,
    pageTitle: typeof context?.pageTitle === 'string' ? context.pageTitle : null,
    pageCategory: typeof context?.pageCategory === 'string' ? context.pageCategory : null,
  };
  try {
    const result = await generateAiJson({
      settings: { provider: settings.provider, model: settings.model, endpoint: settings.endpoint, apiKey: settings.apiKey },
      systemPrompt: buildSystemPrompt(),
      userPrompt: buildUserPrompt(ctx),
      // A whole page is a verbose JSON tree (every node carries css/blocks/editable...): 8192 tokens cut it off mid-way
      maxTokens: kind === 'page' ? 16384 : 8192,
    });
    const validationError = validateElementTree(result.json);
    if (validationError) {
      await createAiGenerated({
        kind, prompt: ctx.prompt, provider: settings.provider, model: settings.model,
        rawResponse: result.rawText, status: 'error', error: validationError, createdBy: req.user?.id ?? null,
      });
      res.status(422).json({ error: `Generated content rejected: ${validationError}` });
      return;
    }
    // The model can't know which photo IDs really exist - replace every
    // image URL with a guaranteed-valid placeholder (see prompts.ts's
    // sanitizeGeneratedImages comment) so stored and rendered pages never
    // show broken images.
    sanitizeGeneratedImages(result.json as Record<string, any>);
    await createAiGenerated({
      kind, prompt: ctx.prompt, provider: settings.provider, model: settings.model,
      payload: result.json, rawResponse: result.rawText, status: 'success', createdBy: req.user?.id ?? null,
    });
    res.json({ payload: result.json });
  } catch (error: any) {
    const message = error instanceof AiGenerationError ? error.message : (error?.message || 'AI generation failed');
    try {
      await createAiGenerated({
        kind, prompt: ctx.prompt, provider: settings.provider, model: settings.model,
        rawResponse: error instanceof AiGenerationError ? error.rawText : undefined,
        status: 'error', error: message, createdBy: req.user?.id ?? null,
      });
    } catch (logError) {
      logger.error({ err: logError }, 'AI generation audit log write error');
    }
    const status = error instanceof AiGenerationError && error.status ? error.status : 500;
    res.status(status).json({ error: message });
  }
});

// Recent generation history for admin review.
app.get('/ai/generated', requirePermission(PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const records = await listAiGenerated();
    res.json({ records });
  } catch (error: any) {
    logger.error({ err: error }, 'List AI generated error');
    res.status(500).json({ error: error.message || 'Failed to list AI generations' });
  }
});

// AI website structure generation — generates a complete website with pages
// and snippets from a natural language prompt.
app.post('/ai/generate-website-structure', requirePermission(PERMISSIONS.OBJECTS_WRITE), aiRateLimit, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { prompt } = req.body ?? {};
  if (typeof prompt !== 'string' || !prompt.trim()) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }
const settings = await getAiSettings(req.user!.id);
  if (!settings || !settings.apiKey) {
    res.status(400).json({ error: 'AI is not configured. Save the provider, model, and API key in Settings → AI first.' });
    return;
  }
  try {
    // Retry-with-feedback loop: sample-free models (and even paid ones) often
    // truncate a large nested JSON or wrap it in stray markdown. Each retry
    // feeds the model its own previous output + the exact parse/rejection
    // error and asks for a corrected, complete JSON object.
    let lastError = '';
    let lastRaw = '';
    let structure: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      let result;
      try {
        result = await generateAiJson({
          settings: { provider: settings.provider, model: settings.model, endpoint: settings.endpoint, apiKey: settings.apiKey },
          systemPrompt: 'You are an expert front-end developer and website architect. You output ONLY valid JSON, no markdown, no commentary.',
          userPrompt: (attempt === 1
            ? buildWebsiteStructurePrompt({ prompt: prompt.trim() })
            : `Your previous answer was rejected for this reason:\n${lastError}\n\nYour previous starting text was:\n${lastRaw.substring(0, 2000)}\n\nOutput ONLY the corrected, complete, valid JSON object matching the original request, no markdown fences, no commentary:\n${prompt.trim()}`),
          maxTokens: 8192,
        });
      } catch (error: any) {
        // generateAiJson throws on invalid JSON (AiGenerationError from
        // parseJsonText). Capture enough of the raw output to feed back.
        const message = error instanceof AiGenerationError ? error.message : (error?.message || 'AI generation failed');
        lastError = message;
        lastRaw = message.includes('\nRaw output:\n') ? message.split('\nRaw output:\n')[1] ?? '' : '';
        if (attempt === 3) {
          throw error;
        }
        continue;
      }
      lastRaw = result.rawText;
      const validationError = validateWebsiteStructure(result.json);
      if (!validationError) {
        structure = result.json;
        break;
      }
      lastError = validationError;
      if (attempt === 3) {
        await createAiGenerated({
          kind: 'website-structure', prompt: prompt.trim(), provider: settings.provider, model: settings.model,
          rawResponse: result.rawText, status: 'error', error: validationError, createdBy: req.user?.id ?? null,
        });
        res.status(422).json({ error: `Generated structure rejected: ${validationError}` });
        return;
      }
    }

    if (structure === null) {
      throw new AiGenerationError(lastError || 'AI generation failed');
    }

    const parsed = structure as Record<string, any>;
    for (const page of (parsed.pages as any[]) ?? []) {
      sanitizeGeneratedImages(page.content as Record<string, any>);
    }
    for (const snippet of (parsed.snippets as any[]) ?? []) {
      sanitizeGeneratedImages(snippet.node as Record<string, any>);
    }
    await createAiGenerated({
      kind: 'website-structure', prompt: prompt.trim(), provider: settings.provider, model: settings.model,
      payload: structure, rawResponse: lastRaw, status: 'success', createdBy: req.user?.id ?? null,
    });
    res.json({ structure });
  } catch (error: any) {
    const message = error instanceof AiGenerationError ? error.message : (error?.message || 'AI generation failed');
    try {
      await createAiGenerated({
        kind: 'website-structure', prompt: prompt.trim(), status: 'error', error: message, createdBy: req.user?.id ?? null,
      });
    } catch (logError) {
      logger.error({ err: logError }, 'AI website-structure audit log write error');
    }
    const status = error instanceof AiGenerationError && error.status ? error.status : 500;
    res.status(status).json({ error: message });
  }
});

// Creates a website from the AI-generated structure — creates the website,
// all its pages, and all its snippets in one orchestrated call.
app.post('/whoobe-one/websites/from-ai', requireAnyPermission(PERMISSIONS.WEBSITES_CREATE, PERMISSIONS.OBJECTS_WRITE), audited(AUDIT.websiteFromAi), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { structure } = req.body ?? {};
  if (!structure || typeof structure.website !== 'object' || !Array.isArray(structure.pages) || !Array.isArray(structure.snippets)) {
    res.status(400).json({ error: 'structure with website, pages, and snippets is required' });
    return;
  }
  try {
    const website = await createWebsite({
      name: structure.website.name,
      defaultLocale: structure.website.defaultLocale ?? 'en',
      supportedLocales: structure.website.supportedLocales ?? ['en'],
      settings: structure.website.settings ?? {},
    });
    const pages = [];
    for (const p of structure.pages) {
      const page = await createWhoobePage({
        slug: p.slug,
        title: p.title,
        category: p.category ?? '',
        content: p.content,
        websiteId: website.id,
      });
      pages.push(page);
    }
    const snippets = [];
    for (const s of structure.snippets) {
      const snippet = await createWhoobeOneSnippet({
        name: s.name,
        category: s.category,
        node: s.node,
      });
      snippets.push(snippet);
    }
    res.status(201).json({ website, pages, snippets });
  } catch (error: any) {
    logger.error({ err: error }, 'Create website from AI error');
    res.status(500).json({ error: error.message || 'Failed to create website from AI structure' });
  }
});

// --- Site specification (docs/plans/ai/ai-site-spec.md) ---
// A whole site as one JSON file written by any language model (or by hand). The dashboard hands out the instructions and the schema, takes the
// answer back, checks it (a dry run) and imports it as a draft. Nothing here calls a model or any outside service.

app.get('/whoobe-one/site-spec/material', requireAnyPermission(PERMISSIONS.WEBSITES_CREATE, PERMISSIONS.OBJECTS_WRITE), (_req: Request, res: Response): void => {
  res.json({ version: SITE_SPEC_VERSION, limits: SITE_SPEC_LIMITS, instructions: SITE_SPEC_INSTRUCTIONS, schema: siteSpecJsonSchema(), examples: SITE_SPEC_EXAMPLES });
});

// the body of a check or an import names the choices about themes and snippets that exist, and may change the name or the root path
const pickChoices = (v: unknown): Record<string, 'existing' | 'new'> | undefined => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, c]) => c === 'existing' || c === 'new')) as Record<string, 'existing' | 'new'>;
};
const textOf = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

// Body: `{ spec, choices?, website? }`. `choices` says, for a theme or snippet name the file defines and that already exists here, `existing` (use it) or
// `new` (create it under a free name; the default: an existing one is never changed). `website` ({ name?, rootPath? }) changes the name or root path
// before the check. `?dryRun=1` writes nothing and answers with the conflicts, a summary and the importer's report. Pages come in as drafts.
app.post('/whoobe-one/websites/from-spec', requireAnyPermission(PERMISSIONS.WEBSITES_CREATE, PERMISSIONS.OBJECTS_WRITE), audited(AUDIT.websiteFromSpec), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  // the limits of the schema (30 pages of 300 elements...) come to well under this; a body larger than that is not a specification
  if (Number(req.headers['content-length'] ?? 0) > 4_000_000) {
    res.status(413).json({ error: 'The specification is too large (4 MB at most)' });
    return;
  }
  const { spec, choices, website } = req.body ?? {};
  if (spec === undefined || spec === null || typeof spec !== 'object' || Array.isArray(spec)) {
    res.status(400).json({ error: 'spec (the site specification, a JSON object) is required' });
    return;
  }
  try {
    const outcome = await importSiteSpec(spec, {
      dryRun: req.query.dryRun === '1' || req.query.dryRun === 'true',
      choices: { themes: pickChoices(choices?.themes), snippets: pickChoices(choices?.snippets) },
      website: website && typeof website === 'object' ? { name: textOf(website.name), rootPath: textOf(website.rootPath) } : undefined,
    });
    res.status(outcome.dryRun ? 200 : 201).json(outcome);
  } catch (error: any) {
    if (error instanceof SiteSpecError) {
      res.status(400).json({ error: 'The specification is not valid', issues: error.issues });
      return;
    }
    if (error instanceof ImportError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    logger.error({ err: error }, 'Website from specification error');
    res.status(500).json({ error: 'Failed to create the website from the specification' });
  }
});


// --- Template wizard (docs/plans/ai/template-wizard.md) ---
// A site from a few choices: the answers become a site specification (fixed block templates, no model), which goes through the same check and import as a
// specification written by hand. Nothing here calls a model or any outside service.

app.get('/whoobe-one/site-wizard/options', requireAnyPermission(PERMISSIONS.WEBSITES_CREATE, PERMISSIONS.OBJECTS_WRITE), async (_req: Request, res: Response): Promise<void> => {
  try {
    // the snippets of the library, with the block each could stand for (by its category); the content of a snippet is not sent
    // (marked as a wizard block, or with a category that names one)
    const snippets = (await listWhoobeOneSnippets()).map((s) => ({ name: s.name, category: s.category, block: snippetWizardBlock(s), marked: !!s.wizardBlock, label: s.wizardBlock ? (s.wizardLabel || s.name) : s.name })).filter((s) => s.block);
    // the palettes made by a person, with the colours that are hard to read in them (a warning, not a refusal)
    const palettes = (await listWizardPalettes()).map((p) => ({ id: p.id, name: p.name, palette: p.colors, warnings: weakPairs(p.colors as any) }));
    // the texts can be written by the configured model when this person has an AI provider set up, may use it, and this is not the public sandbox
    const base = wizardOptions();
    const ai = await getAiSettings((_req as AuthenticatedRequest).user!.id);
    const aiAvailable = !isSandbox() && !!ai?.apiKey && !!(_req as AuthenticatedRequest).user?.permissions?.includes(PERMISSIONS.OBJECTS_WRITE);
    res.json({ ...base, texts: { ...base.texts, ai: { available: aiAvailable } }, snippets, palettes });
  } catch (error: any) {
    logger.error({ err: error }, 'Site wizard options error');
    res.status(500).json({ error: 'Failed to load the options of the wizard' });
  }
});

// The texts of the wizard written by the configured model (docs/plans/ai/template-wizard.md, phase 3). Body: `{ answers, description? }`. The model gets the name, the
// sector, the context, a short description and the slots (key, what it is, length, placeholder) of THIS structure, and its reply is read slot by slot (cleanAiTexts):
// only texts of real slots come back, cleaned and cut. Nothing is created here: the dashboard shows the texts and sends them with the answers to create the site.
app.post('/ai/generate-wizard-texts', requirePermission(PERMISSIONS.OBJECTS_WRITE), aiRateLimit, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { answers, description } = req.body ?? {};
  if (answers === null || typeof answers !== 'object' || Array.isArray(answers)) { res.status(400).json({ error: 'answers (an object) is required' }); return; }
  if (description !== undefined && (typeof description !== 'string' || description.length > 400)) { res.status(400).json({ error: 'description must be text of up to 400 characters' }); return; }
  const settings = await getAiSettings(req.user!.id);
  if (!settings || !settings.apiKey) {
    res.status(400).json({ error: 'AI is not configured. Save the provider, model, and API key in Settings → AI first.' });
    return;
  }
  let slots;
  try {
    const palettes = Object.fromEntries((await listWizardPalettes()).map((p) => [p.id, p.colors as any]));
    slots = buildSite(answers, { palettes }).slots;
  } catch (error: any) {
    if (error instanceof WizardError) { res.status(400).json({ error: error.message, issues: error.issues }); return; }
    logger.error({ err: error }, 'Wizard texts: slots error');
    res.status(500).json({ error: 'Failed to prepare the texts' });
    return;
  }
  const a = answers as Record<string, unknown>;
  const brief = { name: String(a.name ?? ''), sector: (SECTOR_LABELS as Record<string, string>)[String(a.sector)] ?? String(a.sector ?? ''), context: typeof a.context === 'string' ? a.context : undefined, description: typeof description === 'string' ? description : undefined };
  const prompt = buildTextsPrompt(brief, slots);
  try {
    let lastError = '';
    let out: ReturnType<typeof cleanAiTexts> | null = null;
    let raw = '';
    for (let attempt = 1; attempt <= 2 && !out; attempt++) {
      try {
        const result = await generateAiJson({
          settings: { provider: settings.provider, model: settings.model, endpoint: settings.endpoint, apiKey: settings.apiKey },
          systemPrompt: AI_TEXTS_SYSTEM_PROMPT,
          userPrompt: attempt === 1 ? prompt : `${prompt}\n\nYour previous answer was rejected: ${lastError}\nOutput ONLY the corrected JSON object.`,
          maxTokens: 4096,
        });
        raw = result.rawText;
        const cleaned = cleanAiTexts(result.json, slots);
        if (cleaned.used === 0) { lastError = 'it had no text for any slot of the list'; continue; }
        out = cleaned;
      } catch (error: any) {
        lastError = error instanceof AiGenerationError ? error.message.split('\nRaw output:')[0] : (error?.message || 'AI generation failed');
        if (attempt === 2) throw error;
      }
    }
    if (!out) {
      await createAiGenerated({ kind: 'wizard-texts', prompt: `${brief.name} / ${brief.sector}`, provider: settings.provider, model: settings.model, rawResponse: raw, status: 'error', error: lastError, createdBy: req.user?.id ?? null });
      res.status(422).json({ error: `The model did not return usable texts: ${lastError}` });
      return;
    }
    await createAiGenerated({ kind: 'wizard-texts', prompt: `${brief.name} / ${brief.sector}`, provider: settings.provider, model: settings.model, payload: out.texts, rawResponse: raw, status: 'success', createdBy: req.user?.id ?? null });
    res.json({ texts: out.texts, used: out.used, dropped: out.dropped, slots: slots.length, meta: Object.fromEntries(slots.filter((s) => s.key in out!.texts).map((s) => [s.key, { label: s.label, max: s.max }])) });
  } catch (error: any) {
    const message = error instanceof AiGenerationError ? error.message : (error?.message || 'AI generation failed');
    try { await createAiGenerated({ kind: 'wizard-texts', prompt: `${brief.name} / ${brief.sector}`, status: 'error', error: message, createdBy: req.user?.id ?? null }); } catch (logError) { logger.error({ err: logError }, 'Wizard texts audit log write error'); }
    res.status(error instanceof AiGenerationError && error.status ? error.status : 500).json({ error: message });
  }
});

// Palettes made by a person (the four built-in ones are in the code). `{ name, colors }`: the eight roles as #RRGGBB. A palette with colours that are hard to
// read is saved all the same and comes back with `warnings`; the wizard says so again when it is used.
function readPaletteBody(body: any): { ok: true; name: string; colors: Record<string, string> } | { ok: false; error: string; issues?: string[] } {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 60 || /[<>{}\\]/.test(name)) return { ok: false, error: 'name is required: plain text of up to 60 characters' };
  const parsed = parsePalette(body?.colors);
  if (!parsed.ok) return { ok: false, error: 'colors are not valid', issues: parsed.issues };
  return { ok: true, name, colors: parsed.palette as unknown as Record<string, string> };
}

app.post('/whoobe-one/site-wizard/palettes', requireAnyPermission(PERMISSIONS.THEMES_CREATE, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  const read = readPaletteBody(req.body);
  if (!read.ok) { res.status(400).json({ error: read.error, ...(read.issues ? { issues: read.issues } : {}) }); return; }
  try {
    const palette = await createWizardPalette({ name: read.name, colors: read.colors });
    res.status(201).json({ palette, warnings: weakPairs(palette.colors as any) });
  } catch (error: any) {
    if (error?.code === '23505' || /wizard_palettes_name_idx/.test(String(error?.message))) { res.status(409).json({ error: `A palette named "${read.name}" already exists` }); return; }
    logger.error({ err: error }, 'Create wizard palette error');
    res.status(500).json({ error: 'Failed to create the palette' });
  }
});

app.put('/whoobe-one/site-wizard/palettes/:id', requireAnyPermission(PERMISSIONS.THEMES_EDIT, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) { res.status(404).json({ error: 'Palette not found' }); return; }
  const read = readPaletteBody(req.body);
  if (!read.ok) { res.status(400).json({ error: read.error, ...(read.issues ? { issues: read.issues } : {}) }); return; }
  try {
    const palette = await updateWizardPalette(req.params.id, { name: read.name, colors: read.colors });
    if (!palette) { res.status(404).json({ error: 'Palette not found' }); return; }
    res.json({ palette, warnings: weakPairs(palette.colors as any) });
  } catch (error: any) {
    if (error?.code === '23505' || /wizard_palettes_name_idx/.test(String(error?.message))) { res.status(409).json({ error: `A palette named "${read.name}" already exists` }); return; }
    logger.error({ err: error }, 'Update wizard palette error');
    res.status(500).json({ error: 'Failed to update the palette' });
  }
});

app.delete('/whoobe-one/site-wizard/palettes/:id', requireAnyPermission(PERMISSIONS.THEMES_DELETE, PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id) || !(await deleteWizardPalette(req.params.id))) { res.status(404).json({ error: 'Palette not found' }); return; }
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Delete wizard palette error');
    res.status(500).json({ error: 'Failed to delete the palette' });
  }
});

// Custom fonts: woff2 files of the DAM (a public folder) registered with a family, weight and style, shared by the websites of the workspace.
// The list is for everyone signed in (the editor needs it); `url` is relative to the origin that serves `/dam-asset/`, `available` is false when the asset
// was deleted or made private since, so a page does not link a file nobody can read.
app.get('/fonts', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    const fonts = await Promise.all((await listCustomFonts()).map(async (f) => {
      const asset = await getAssetByPath(f.assetPath);
      const available = !!asset && asset.isPublic && asset.fileType === 'WOFF2';
      return { ...f, available, url: available ? `/dam-asset/${asset!.s3Key}` : null };
    }));
    res.json({ fonts });
  } catch (error) {
    logger.error({ err: error }, 'Fonts list error');
    res.status(500).json({ error: 'Failed to list the fonts' });
  }
});

app.post('/fonts', requirePermission(PERMISSIONS.SETTINGS_MANAGE), audited(AUDIT.fontCreate), async (req: Request, res: Response): Promise<void> => {
  const read = readCustomFontBody(req.body);
  if (!read.ok) { res.status(400).json({ error: read.error }); return; }
  try {
    const asset = await getAssetByPath(read.font.assetPath);
    if (!asset || asset.fileType !== 'WOFF2') { res.status(400).json({ error: 'assetPath must be a woff2 file of the DAM' }); return; }
    if (!asset.isPublic) { res.status(400).json({ error: 'The font file must be in a public folder: a published website cannot read a private file' }); return; }
    const font = await createCustomFont(read.font);
    res.status(201).json({ font });
  } catch (error: any) {
    if (error?.code === '23505' || /custom_fonts_face_idx/.test(String(error?.message))) { res.status(409).json({ error: `${read.font.family} already has a ${read.font.style} face of weight ${read.font.weight}` }); return; }
    logger.error({ err: error }, 'Create font error');
    res.status(500).json({ error: 'Failed to register the font' });
  }
});

app.delete('/fonts/:id', requirePermission(PERMISSIONS.SETTINGS_MANAGE), audited(AUDIT.fontDelete), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id) || !(await deleteCustomFont(req.params.id))) { res.status(404).json({ error: 'Font not found' }); return; }
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Delete font error');
    res.status(500).json({ error: 'Failed to remove the font' });
  }
});

// Body: `{ answers, choices?, website? }` (the answers are described by `wizardAnswersSchema`). `?dryRun=1` writes nothing and answers with the conflicts, a summary
// and the importer's report, plus `notes` (what was adjusted to keep the colours readable). Pages come in as drafts. The form block is created disconnected.
app.post('/whoobe-one/websites/from-wizard', requireAnyPermission(PERMISSIONS.WEBSITES_CREATE, PERMISSIONS.OBJECTS_WRITE), audited(AUDIT.websiteFromWizard), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { answers, choices, website, texts } = req.body ?? {};
  if (Number(req.headers['content-length'] ?? 0) > 200_000) {
    res.status(413).json({ error: 'The answers are too large' });
    return;
  }
  if (answers === undefined || answers === null || typeof answers !== 'object' || Array.isArray(answers)) {
    res.status(400).json({ error: 'answers (an object) is required' });
    return;
  }
  try {
    // which snippets of the library have an h1 of their own (a block taken from one carries the heading of its page)
    const snippetHeadings = Object.fromEntries((await listWhoobeOneSnippets()).map((s) => [s.name, nodeHasH1(s.node)]));
    const palettes = Object.fromEntries((await listWizardPalettes()).map((p) => [p.id, p.colors as any]));
    // the texts written by the model and read by the person: only text values of a plain object; a slot takes what fits it (TextSource), the rest is ignored
    const givenTexts = texts && typeof texts === 'object' && !Array.isArray(texts)
      ? Object.fromEntries(Object.entries(texts as Record<string, unknown>).filter(([, v]) => typeof v === 'string').slice(0, 500)) as Record<string, string>
      : undefined;
    const { spec, notes, vars } = buildSite(answers, { snippetHeadings, palettes, ...(givenTexts ? { texts: givenTexts } : {}) });
    const outcome = await importSiteSpec(spec, {
      vars,   // the placeholders of the library snippets used in the pages ({name}, {context}, {thing}, {sector}) get the words of this site; a specification imported by hand gets none
      dryRun: req.query.dryRun === '1' || req.query.dryRun === 'true',
      choices: { themes: pickChoices(choices?.themes), snippets: pickChoices(choices?.snippets) },
      website: website && typeof website === 'object' ? { name: textOf(website.name), rootPath: textOf(website.rootPath) } : undefined,
    });
    res.status(outcome.dryRun ? 200 : 201).json({ ...outcome, notes });
  } catch (error: any) {
    if (error instanceof WizardError) {
      res.status(400).json({ error: 'The answers are not valid', issues: error.issues.map((i) => ({ path: i.path, where: i.path, message: i.message })) });
      return;
    }
    if (error instanceof SiteSpecError) {
      res.status(400).json({ error: 'The site could not be made from these answers', issues: error.issues });
      return;
    }
    if (error instanceof ImportError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    logger.error({ err: error }, 'Website from wizard error');
    res.status(500).json({ error: 'Failed to create the website from the wizard' });
  }
});

// --- Website Export / Import ---

// Version 2 bundle (portability/): the website plus everything its content refers to - snippets, module pages, themes,
// data classes/components/objects and the asset records. The files of the assets are fetched by the client from the
// asset-processor and zipped next to the JSON; on import the client stores them first and sends the id mapping.
// `?dataObjects=referenced` leaves out the objects a data binding would list (only the ones reached by id are kept).
app.get('/whoobe-one/websites/:id/export', requireAnyPermission(PERMISSIONS.WEBSITES_VIEW, PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const dataObjects = req.query.dataObjects === 'referenced' ? 'referenced' : 'all';
    const bundle = await buildWebsiteBundle(req.params.id, { dataObjects });
    if (!bundle) {
      res.status(404).json({ error: 'Website not found' });
      return;
    }
    res.json(bundle);
  } catch (error: any) {
    logger.error({ err: error }, 'Website export error');
    res.status(500).json({ error: error.message || 'Failed to export website' });
  }
});

// Accepts a version 1 or 2 export. `?dryRun=1` writes nothing and reports what would happen, including the plan for
// the assets (upload / reuse / conflict). The body is the bundle, plus `assetMap` ({ oldAssetId: { id, pimcorePath } })
// for the assets the client has stored.
app.post('/whoobe-one/websites/import', requireAnyPermission(PERMISSIONS.WEBSITES_CREATE, PERMISSIONS.OBJECTS_WRITE), audited(AUDIT.websiteImport), async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = parseWebsiteBundle(req.body);
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const report = await importWebsiteBundle(parsed.bundle, {
      dryRun: req.query.dryRun === '1' || req.query.dryRun === 'true',
      // objects:publish is needed to bring published content in as published; without it everything lands as a draft
      restorePublication: mayChangePublished(req, false, true),
      assetMap: req.body?.assetMap && typeof req.body.assetMap === 'object' ? req.body.assetMap : undefined,
      docsFolder: typeof req.body?.docsFolder === 'string' && req.body.docsFolder.trim() ? req.body.docsFolder : undefined,
    });
    res.status(report.dryRun ? 200 : 201).json(report);
  } catch (error: any) {
    if (error instanceof ImportError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    logger.error({ err: error }, 'Website import error');
    res.status(500).json({ error: error.message || 'Failed to import website' });
  }
});

// AI Image generation config (separate from text AI settings).
// Same pattern: per-user, GET never returns API key, PUT blank key = keep existing.
app.get('/ai/image-settings', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const settings = await getAiImageSettings(req.user!.id);
    if (!settings) {
      res.json({ settings: null, usingFallback: false });
      return;
    }
    const { apiKey, ...rest } = settings;
    res.json({ settings: { ...rest, hasApiKey: !!apiKey }, usingFallback: false });
  } catch (error: any) {
    logger.error({ err: error }, 'AI image settings fetch error');
    res.status(500).json({ error: error.message || 'Failed to fetch AI image settings' });
  }
});

app.put('/ai/image-settings', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { provider, model, endpoint, apiKey } = req.body ?? {};
    if (!provider || !model) {
      res.status(400).json({ error: 'provider and model are required' });
      return;
    }
    const existing = await getAiImageSettings(req.user!.id);
    const input: any = { provider, model, endpoint };
    input.apiKey = apiKey === '' || apiKey == null
      ? existing?.apiKey ?? null
      : apiKey;
    const updated = await upsertAiImageSettings(req.user!.id, input);
    const { apiKey: _, ...rest } = updated;
    res.json({ ...rest, hasApiKey: !!updated.apiKey });
  } catch (error: any) {
    logger.error({ err: error }, 'AI image settings save error');
    res.status(500).json({ error: error.message || 'Failed to save AI image settings' });
  }
});

// Dedicated per-user AI config for page translation - same GET/PUT shape
// as /ai/image-settings, own row in ai_translate_settings so translation
// can use a different provider/model than page/snippet generation without
// touching that config (docs/CHANGES.md: translation and generation have
// different reliability profiles on the same free/small models).
app.get('/ai/translate-settings', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const settings = await getAiTranslateSettings(req.user!.id);
    if (!settings) {
      res.json({ settings: null, usingFallback: true });
      return;
    }
    const { apiKey, ...rest } = settings;
    res.json({ settings: { ...rest, hasApiKey: !!apiKey }, usingFallback: !apiKey });
  } catch (error: any) {
    logger.error({ err: error }, 'AI translate settings fetch error');
    res.status(500).json({ error: error.message || 'Failed to fetch AI translate settings' });
  }
});

app.put('/ai/translate-settings', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { provider, model, endpoint, apiKey } = req.body ?? {};
    if (!provider || !model) {
      res.status(400).json({ error: 'provider and model are required' });
      return;
    }
    const existing = await getAiTranslateSettings(req.user!.id);
    const input: any = { provider, model, endpoint };
    input.apiKey = apiKey === '' || apiKey == null
      ? existing?.apiKey ?? null
      : apiKey;
    const updated = await upsertAiTranslateSettings(req.user!.id, input);
    const { apiKey: _, ...rest } = updated;
    res.json({ ...rest, hasApiKey: !!updated.apiKey });
  } catch (error: any) {
    logger.error({ err: error }, 'AI translate settings save error');
    res.status(500).json({ error: error.message || 'Failed to save AI translate settings' });
  }
});

app.post('/ai/generate-image', requirePermission(PERMISSIONS.OBJECTS_WRITE), aiRateLimit, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { prompt, n, size, quality, style, folderPath } = req.body ?? {};
    if (!prompt) {
      res.status(400).json({ error: 'prompt is required' });
      return;
    }

    // Resolve image AI settings: use image-specific, or fall back to text AI.
    let imageSettings = await getAiImageSettings(req.user!.id);
    if (!imageSettings || !imageSettings.apiKey) {
      const textSettings = await getAiSettings(req.user!.id);
      if (!textSettings || !textSettings.apiKey) {
        res.status(400).json({ error: 'No AI configuration found. Configure AI settings first.' });
        return;
      }
      imageSettings = {
        userId: textSettings.userId,
        provider: 'openai' as const,
        model: 'dall-e-3',
        endpoint: null,
        apiKey: textSettings.apiKey,
        updatedAt: new Date(),
      };
    }

    // Generate image(s) via the provider.
    const result = await generateImage({
      settings: {
        provider: imageSettings.provider as any,
        model: imageSettings.model,
        endpoint: imageSettings.endpoint,
        apiKey: imageSettings.apiKey,
      },
      prompt,
      n,
      size,
      quality,
      style,
    });

    // Download temp URLs and save each to DAM.
    const saveDir = folderPath || '/ai-generated';
    const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
    const saved: { damUrl: string; assetId: string; revisedPrompt?: string; width?: number; height?: number }[] = [];

    for (const img of result.images) {
      if (!img.url) continue;
      const damResult = await saveAiImageToDam({
        url: img.url,
        folderPath: saveDir,
        fileName: slug,
        revisedPrompt: img.revisedPrompt,
      });
      saved.push({
        damUrl: damResult.damUrl,
        assetId: damResult.assetId,
        revisedPrompt: img.revisedPrompt,
      });
    }

    // Log to audit table.
    await createAiGenerated({
      kind: 'image',
      prompt,
      provider: imageSettings.provider,
      model: imageSettings.model,
      payload: saved,
      rawResponse: JSON.stringify(result.rawResponse),
      status: 'success',
      createdBy: req.user!.id,
    });

    res.json({ images: saved });
  } catch (error: any) {
    const status = typeof error?.status === 'number' ? error.status : 500;
    const message = error?.message ?? 'Image generation failed';
    logger.error({ err: error }, 'AI image generation error');

    // Log failures too.
    try {
      await createAiGenerated({
        kind: 'image',
        prompt: req.body?.prompt ?? '',
        provider: '',
        model: '',
        payload: null,
        rawResponse: null,
        status: 'error',
        error: message,
        createdBy: req.user!.id,
      });
    } catch { /* silent log failure */ }

    res.status(status).json({ error: message });
  }
});

app.get('/public/data-objects/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const object = await getPublishedDataObject(req.params.id);
    if (!object) {
      // Identical response whether the id doesn't exist or exists but
      // isn't published - never leak "this exists but is a draft" (§2.2).
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    res.json({ object });
  } catch (error: any) {
    logger.error({ err: error }, 'Get public data object error');
    res.status(500).json({ error: error.message || 'Failed to get object' });
  }
});

// Preview links - object-publish-workflow-plan.md §2.3/§7 Phase 2. Issuing
// one is admin-only (gated on OBJECTS_PUBLISH, the same permission that
// gates flipping `published` itself - sharing a preview of unpublished
// content is a publish-adjacent action); *resolving* one is deliberately
// public with zero auth, same as the public Data Object routes above -
// the token itself is the only credential, matching the plan's own "a
// separate route, reachable only by having the exact token" design.
app.post(
  '/data-objects/:id/preview-link',
  requirePermission(PERMISSIONS.OBJECTS_PUBLISH),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const object = await getDataObject(req.params.id);
      if (!object) {
        res.status(404).json({ error: 'Object not found' });
        return;
      }
      const expiresInDays = typeof req.body?.expiresInDays === 'number' ? req.body.expiresInDays : undefined;
      const previewToken = await createPreviewToken({ objectId: object.id, createdBy: req.user?.id ?? null, expiresInDays });
      res.status(201).json({ token: previewToken.token, expiresAt: previewToken.expiresAt });
    } catch (error: any) {
      logger.error({ err: error }, 'Create preview link error');
      res.status(500).json({ error: error.message || 'Failed to create preview link' });
    }
  }
);

app.get(
  '/data-objects/:id/preview-links',
  requireAnyPermission(PERMISSIONS.DATA_OBJECTS_VIEW, PERMISSIONS.OBJECTS_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tokens = await listPreviewTokensForObject(req.params.id);
      res.json({ tokens });
    } catch (error: any) {
      logger.error({ err: error }, 'List preview links error');
      res.status(500).json({ error: error.message || 'Failed to list preview links' });
    }
  }
);

app.delete(
  '/data-objects/preview-links/:token',
  requirePermission(PERMISSIONS.OBJECTS_PUBLISH),
  async (req: Request, res: Response): Promise<void> => {
    try {
      // ?permanent=true removes the row for good - only for a link that is
      // no longer usable, i.e. already revoked or expired (revoking stays the
      // default, non-destructive action, and keeps the view count as a record).
      if (req.query.permanent === 'true') {
        const existing = await getPreviewToken(req.params.token);
        if (!existing) {
          res.status(404).json({ error: 'Preview link not found' });
          return;
        }
        if (isPreviewTokenValid(existing)) {
          res.status(409).json({ error: 'Revoke the preview link before deleting it' });
          return;
        }
        await deletePreviewToken(req.params.token);
        res.json({ success: true });
        return;
      }
      await revokePreviewToken(req.params.token);
      res.json({ success: true });
    } catch (error: any) {
      logger.error({ err: error }, 'Revoke preview link error');
      res.status(500).json({ error: error.message || 'Failed to revoke preview link' });
    }
  }
);

// Resolution - no requireAuth/requirePermission at all, deliberately: the
// token itself is the credential. Not part of the /data-objects surface
// (a distinct top-level path), so it can never be reached by anything
// that also has access to the admin listing/search routes.
app.get('/preview/objects/:token', async (req: Request, res: Response): Promise<void> => {
  try {
    const previewToken = await getPreviewToken(req.params.token);
    if (!previewToken || !isPreviewTokenValid(previewToken)) {
      res.status(404).json({ error: 'Preview link not found or expired' });
      return;
    }
    const object = await getDataObject(previewToken.objectId);
    if (!object) {
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    await incrementPreviewTokenViewCount(previewToken.token);
    res.json({ object });
  } catch (error: any) {
    logger.error({ err: error }, 'Resolve preview link error');
    res.status(500).json({ error: error.message || 'Failed to resolve preview link' });
  }
});

// Workflow definitions - object-publish-workflow-plan.md §2.4/§3/§7 Phase 3.
// Authoring (define/replace/remove a class's whole workflow) is gated on
// WORKFLOWS_MANAGE, a distinct permission from OBJECTS_* - editing what
// states/transitions *exist* is a different, more structural capability
// than reading/writing/publishing individual objects.
app.get(
  '/data-classes/:id/workflow',
  requireAnyPermission(PERMISSIONS.DATA_OBJECTS_VIEW, PERMISSIONS.OBJECTS_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const definition = await getWorkflowDefinitionByClassId(req.params.id);
      res.json({ workflow: definition });
    } catch (error: any) {
      logger.error({ err: error }, 'Get workflow definition error');
      res.status(500).json({ error: error.message || 'Failed to get workflow definition' });
    }
  }
);

app.put(
  '/data-classes/:id/workflow',
  requirePermission(PERMISSIONS.WORKFLOWS_MANAGE),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { initialPlace, places, transitions } = req.body ?? {};
      if (typeof initialPlace !== 'string' || !Array.isArray(places) || !Array.isArray(transitions)) {
        res.status(400).json({ error: 'initialPlace, places, and transitions are required' });
        return;
      }
      if (!places.some((p: any) => p.name === initialPlace)) {
        res.status(400).json({ error: `initialPlace "${initialPlace}" is not one of this workflow's own places` });
        return;
      }
      const definition = await upsertWorkflowDefinition({ classId: req.params.id, initialPlace, places, transitions });
      res.json({ workflow: definition });
    } catch (error: any) {
      logger.error({ err: error }, 'Save workflow definition error');
      res.status(500).json({ error: error.message || 'Failed to save workflow definition' });
    }
  }
);

app.delete(
  '/data-classes/:id/workflow',
  requirePermission(PERMISSIONS.WORKFLOWS_MANAGE),
  async (req: Request, res: Response): Promise<void> => {
    try {
      await deleteWorkflowDefinition(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      logger.error({ err: error }, 'Delete workflow definition error');
      res.status(500).json({ error: error.message || 'Failed to delete workflow definition' });
    }
  }
);

// Transitioning one object through its class's workflow. No single fixed
// requirePermission() here - each transition declares its own
// `allowedPermissions` (§2.4), checked against the signed-in identity's
// real permission set once the object/definition/transition are all
// known - just `requireAuth` up front so `req.user` exists to check.
app.post(
  '/data-objects/:id/transition',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { transitionName } = req.body ?? {};
      if (typeof transitionName !== 'string' || !transitionName.trim()) {
        res.status(400).json({ error: 'transitionName is required' });
        return;
      }

      const object = await getDataObject(req.params.id);
      if (!object) {
        res.status(404).json({ error: 'Object not found' });
        return;
      }
      const definition = await getWorkflowDefinitionByClassId(object.classId);
      if (!definition) {
        res.status(400).json({ error: 'This object\'s class has no workflow defined' });
        return;
      }

      const currentPlace = object.workflowState ?? definition.initialPlace;
      if (!isTransitionValid(definition, currentPlace, transitionName)) {
        res.status(400).json({ error: `Transition "${transitionName}" is not valid from "${currentPlace}"` });
        return;
      }
      const transition = getTransitionDefinition(definition, transitionName)!;

      if (transition.allowedPermissions && transition.allowedPermissions.length > 0) {
        const userPermissions = req.user?.permissions ?? [];
        if (!transition.allowedPermissions.some((p) => userPermissions.includes(p))) {
          res.status(403).json({ error: `Missing permission for transition "${transitionName}"` });
          return;
        }
      }

      const updated = await updateDataObject(object.id, {
        workflowState: transition.to,
        ...(transition.setPublished !== undefined ? { published: transition.setPublished } : {}),
      }, { actor: eventActorOf(req) });
      await logWorkflowTransition({
        objectId: object.id,
        fromPlace: currentPlace,
        toPlace: transition.to,
        transitionName,
        actorId: req.user?.id ?? null,
      });

      res.json({ object: updated });
    } catch (error: any) {
      logger.error({ err: error }, 'Transition object workflow error');
      res.status(500).json({ error: error.message || 'Failed to transition object' });
    }
  }
);

app.get(
  '/data-objects/:id/transitions',
  requireAnyPermission(PERMISSIONS.DATA_OBJECTS_VIEW, PERMISSIONS.OBJECTS_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const transitions = await listWorkflowTransitionsForObject(req.params.id);
      res.json({ transitions });
    } catch (error: any) {
      logger.error({ err: error }, 'List object transitions error');
      res.status(500).json({ error: error.message || 'Failed to list transitions' });
    }
  }
);

// ---------------------------------------------------------------------------
// Admin search - same engine as /public/search, but session-gated and with
// draft visibility (index rows carry published=false for unpublished content
// and for pages whose search.indexable is false).
app.get(
  '/whoobe-one/search',
  requirePermission(PERMISSIONS.OBJECTS_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = parseSearchQuery(req);
      if (parsed.error || !parsed.options) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      const results = await searchContent(parsed.options);
      res.json({ ...results, results: withSearchUrls(results.results, parsed.options.locale ?? 'en') });
    } catch (error: any) {
      logger.error({ err: error }, 'Admin search error');
      res.status(500).json({ error: error.message || 'Search failed' });
    }
  }
);

// Full rebuild of the search index from source tables - heals any drift
// (indexing hooks are best-effort by design; see indexer.ts).
app.post(
  '/whoobe-one/search/reindex',
  requirePermission(PERMISSIONS.OBJECTS_WRITE),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const counts = await reindexAll();
      res.json({ ok: true, ...counts });
    } catch (error: any) {
      logger.error({ err: error }, 'Search reindex error');
      res.status(500).json({ error: error.message || 'Reindex failed' });
    }
  }
);

// Figma settings (single global row, same pattern as ai_settings / mail_settings).
// GET never returns the stored access token (only `hasToken`), PUT treats a
// blank token as "keep the existing one".
app.get('/figma/settings', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (_req: Request, res: Response): Promise<void> => {
  try {
    const settings = await getFigmaSettings();
    if (!settings) { res.json(null); return; }
    const { accessToken, ...rest } = settings;
    res.json({ ...rest, hasToken: !!accessToken });
  } catch (error) {
    logger.error({ err: error }, 'Figma settings fetch error');
    res.status(500).json({ error: 'Failed to fetch Figma settings' });
  }
});

app.put('/figma/settings', requirePermission(PERMISSIONS.SETTINGS_MANAGE), audited(AUDIT.figmaSettings), async (req: Request, res: Response): Promise<void> => {
  try {
    const { accessToken, teamId } = req.body ?? {};
    const existing = await getFigmaSettings();
    const updated = await upsertFigmaSettings({
      accessToken: accessToken ? accessToken : existing?.accessToken ?? null,
      teamId: teamId || null,
    });
    const { accessToken: _at, ...rest } = updated;
    res.json({ ...rest, hasToken: !!updated.accessToken });
  } catch (error) {
    logger.error({ err: error }, 'Figma settings update error');
    res.status(500).json({ error: 'Failed to update Figma settings' });
  }
});

// Figma import: proxies the Figma API, converts the tree, returns the
// Whoobe Element tree ready for insertion. Requires OBJECTS_WRITE
// permission (same as page/snippet creation).
app.post('/figma/import', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileKey, nodeId, mode = 'snippet' } = req.body ?? {};
    if (!fileKey) { res.status(400).json({ error: 'fileKey is required' }); return; }
    if (mode !== 'page' && mode !== 'snippet') { res.status(400).json({ error: 'mode must be "page" or "snippet"' }); return; }

    const settings = await getFigmaSettings();
    if (!settings || !settings.accessToken) {
      res.status(400).json({ error: 'Figma is not configured. Save the access token in Settings → Figma first.' });
      return;
    }

    const nodeIds = nodeId ? [nodeId] : undefined;
    const result = await fetchAndConvert({
      accessToken: settings.accessToken,
      fileKey,
      nodeIds,
      mode,
      imageUploadFn: async (imageRef: string, tempUrl: string) => {
        const damResult = await saveAiImageToDam({
          url: tempUrl,
          folderPath: `/figma-imports/${fileKey}`,
          fileName: imageRef,
        });
        return damResult.damUrl;
      },
    });

    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Figma import error');
    res.status(500).json({ error: error?.message || 'Failed to import from Figma' });
  }
});

// System log viewer endpoints — proxy to asset-processor DAM data using the
// service token. These sit on core-api so the admin-dashboard's session
// cookie (same origin as core-api) authenticates the user, then core-api
// fetches from asset-processor with the DAM_SERVICE_TOKEN.
const DAM_SERVICE_TOKEN = process.env.DAM_SERVICE_TOKEN ?? ''
const ASSET_PROCESSOR_URL = process.env.ASSET_PROCESSOR_URL ?? 'http://localhost:3002'

// Local, not-yet-rotated (or not-yet-uploaded) log files live on disk under
// LOG_DIR/<appName>. These are the freshest logs - DAM only receives a file
// once pino-roll rotates it - so the viewer reads this directory directly
// rather than waiting on rotation/upload. Entries are addressed with a
// "local:" path prefix so /download can tell them apart from DAM paths.
const SYSTEM_LOG_DIR = resolveLogDir()

function listLocalLogFiles(appName: string): { filename: string; path: string; size: number; uploadedAt?: string }[] {
  const dir = join(SYSTEM_LOG_DIR, appName)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((filename) => !filename.startsWith('.'))
    .map((filename) => {
      const stat = statSync(join(dir, filename))
      return {
        filename,
        path: `local:${appName}/${filename}`,
        size: stat.size,
        uploadedAt: stat.mtime.toISOString(),
      }
    })
}

app.get('/api/v1/system/logs', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const appName = req.query.app as string
    const month = req.query.month as string | undefined
    if (!appName) {
      res.status(400).json({ error: 'Missing app query param' })
      return
    }
    const folderPrefix = month
      ? `private/logs/${appName}/${month}`
      : `private/logs/${appName}`
    const records = await listAssetsUnderFolder(folderPrefix)
    const archived = records.map((a: any) => ({
      filename: a.filename,
      path: a.pimcorePath,
      size: a.sizeBytes,
      uploadedAt: a.createdAt,
    }))
    const local = listLocalLogFiles(appName)
    const archivedFilenames = new Set(archived.map((f) => f.filename))
    const files = [...local.filter((f) => !archivedFilenames.has(f.filename)), ...archived]
    res.json({ files })
  } catch (error: any) {
    logger.error({ err: error, module: 'system-logs' }, 'Failed to list log files')
    res.status(500).json({ error: 'Failed to list log files' })
  }
})

app.get('/api/v1/system/logs/download', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const logPath = req.query.path as string
    if (!logPath) {
      res.status(400).json({ error: 'Missing path query param' })
      return
    }

    if (logPath.startsWith('local:')) {
      const relative = logPath.slice('local:'.length)
      const resolved = resolve(SYSTEM_LOG_DIR, relative)
      if (!resolved.startsWith(resolve(SYSTEM_LOG_DIR) + '/')) {
        res.status(400).json({ error: 'Invalid path' })
        return
      }
      if (!existsSync(resolved)) {
        res.status(404).json({ error: 'Log file not found' })
        return
      }
      res.type('text/plain').send(readFileSync(resolved, 'utf-8'))
      return
    }

    const asset = await getAssetByPath(logPath)
    if (!asset) {
      res.status(404).json({ error: 'Log file not found' })
      return
    }
    const s3Key = asset.s3Key
    const url = `${ASSET_PROCESSOR_URL}/dam-asset/${encodeURIComponent(s3Key)}`
    const headers: Record<string, string> = {}
    if (DAM_SERVICE_TOKEN) {
      headers['Authorization'] = `Bearer ${DAM_SERVICE_TOKEN}`
    }
    const upstream = await fetch(url, { headers })
    if (!upstream.ok) {
      res.status(502).json({ error: 'Failed to fetch log content from storage' })
      return
    }
    const text = await upstream.text()
    res.type('text/plain').send(text)
  } catch (error: any) {
    logger.error({ err: error, module: 'system-logs' }, 'Failed to download log file')
    res.status(500).json({ error: 'Failed to download log file' })
  }
})

// Publishing from the dashboard (docs/plans/website/publish-from-dashboard.md): jobs for an external runner.
app.use(publishJobsRouter(process.env.PUBLISH_RUNNER_TOKEN ?? '', logger, audited));

// Documentation sites (docs/plans/docs-sites/docs-site-plan.md): a website of kind "docs" is built from the Markdown assets of a
// DAM folder. The routes below only read; documents are written with the ordinary DAM upload.
const docsContentReader = createContentReader(ASSET_PROCESSOR_URL, DAM_SERVICE_TOKEN);

async function docsSiteFor(websiteId: string, res: Response, publicOnly: boolean) {
  const website = await getWebsite(websiteId);
  if (!website) { res.status(404).json({ error: 'Website not found' }); return null; }
  let config;
  try { config = docsConfigOf(website); } catch (e) {
    if (e instanceof DocsConfigError) { res.status(400).json({ error: e.message }); return null; }
    throw e;
  }
  if (!config) { res.status(404).json({ error: 'This website is not a documentation site' }); return null; }
  return loadDocsSite(config, docsContentReader, { publicOnly });
}

app.get('/docs-sites/:websiteId/tree', requirePermission(PERMISSIONS.ASSETS_LIST), async (req: Request, res: Response): Promise<void> => {
  try {
    const site = await docsSiteFor(req.params.websiteId, res, false);
    if (site) res.json(describeDocsSite(site));
  } catch (error: any) {
    logger.error({ err: error, module: 'docs-sites' }, 'Failed to load the documentation site');
    res.status(500).json({ error: 'Failed to load the documentation site' });
  }
});

// The rendered page, drafts and private documents included (for the people who can see the assets).
app.get('/docs-sites/:websiteId/preview/*', requirePermission(PERMISSIONS.ASSETS_VIEW), async (req: Request, res: Response): Promise<void> => {
  try {
    const site = await docsSiteFor(req.params.websiteId, res, false);
    if (!site) return;
    const doc = findDocByRoute(site, String((req.params as any)[0] ?? ''));
    if (!doc) { res.status(404).json({ error: 'Document not found' }); return; }
    res.json({ site: { title: site.config.title }, nav: site.nav, page: renderDocPage(site, doc) });
  } catch (error: any) {
    logger.error({ err: error, module: 'docs-sites' }, 'Failed to render the document');
    res.status(500).json({ error: 'Failed to render the document' });
  }
});

// The editor's live preview: renders text that is not saved yet, with the folder's real links and files.
app.post('/docs-sites/:websiteId/render', requirePermission(PERMISSIONS.ASSETS_VIEW), async (req: Request, res: Response): Promise<void> => {
  try {
    const { path, markdown } = req.body ?? {};
    if (typeof markdown !== 'string' || typeof path !== 'string' || !path || path.split('/').some((p) => p === '..' || p === '.') || !/\.(md|markdown)$/i.test(path)) {
      res.status(400).json({ error: 'path (a .md file inside the folder) and markdown are required' });
      return;
    }
    const site = await docsSiteFor(req.params.websiteId, res, false);
    if (site) res.json(renderDraft(site, path.replace(/^\/+/, ''), markdown));
  } catch (error: any) {
    logger.error({ err: error, module: 'docs-sites' }, 'Failed to render the draft');
    res.status(500).json({ error: 'Failed to render the draft' });
  }
});

// Checks the text of the index file without saving it.
app.post('/docs-sites/:websiteId/nav/check', requirePermission(PERMISSIONS.ASSETS_VIEW), async (req: Request, res: Response): Promise<void> => {
  try {
    const text = req.body?.text;
    if (typeof text !== 'string') { res.status(400).json({ error: 'text is required' }); return; }
    const site = await docsSiteFor(req.params.websiteId, res, false);
    if (site) res.json(checkNavText(site, text));
  } catch (error: any) {
    logger.error({ err: error, module: 'docs-sites' }, 'Failed to check the index');
    res.status(500).json({ error: 'Failed to check the index' });
  }
});

// Which documentation site answers at a root path (the editor application asks, to show the docs layout instead of a page).
app.get('/public/docs-site/:segment', async (req: Request, res: Response): Promise<void> => {
  try {
    const segment = req.params.segment;
    if (!/^[a-z0-9_-]{1,64}$/.test(segment)) { res.status(404).json({ error: 'Not a documentation site' }); return; }
    const website = await getWebsiteByRootPath('/' + segment);
    if (!website || ((website.settings ?? {}) as Record<string, unknown>).kind !== 'docs') { res.status(404).json({ error: 'Not a documentation site' }); return; }
    res.json({ websiteId: website.id, rootPath: website.rootPath, title: docsConfigOf(website)?.title ?? website.name });
  } catch (error: any) {
    if (error instanceof DocsConfigError) { res.status(404).json({ error: 'Not a documentation site' }); return; }
    logger.error({ err: error, module: 'docs-sites' }, 'Failed to look up the documentation site');
    res.status(500).json({ error: 'Failed to look up the documentation site' });
  }
});

// The search index of a documentation site (MiniSearch, serialised): the browser downloads it once and searches locally. The
// public one holds only public documents; the editors' one also the private ones.
async function sendDocsSearchIndex(req: Request, res: Response, publicOnly: boolean): Promise<void> {
  try {
    const site = await docsSiteFor(req.params.websiteId, res, publicOnly);
    if (!site) return;
    const idx = docsSearchIndex(req.params.websiteId, site, publicOnly);
    res.setHeader('ETag', idx.etag);
    res.setHeader('Cache-Control', publicOnly ? 'public, max-age=0, must-revalidate' : 'private, no-cache');
    if (req.headers['if-none-match'] === idx.etag) { res.status(304).end(); return; }
    res.type('application/json').send(idx.json);
  } catch (error: any) {
    logger.error({ err: error, module: 'docs-sites' }, 'Failed to build the search index');
    res.status(500).json({ error: 'Failed to build the search index' });
  }
}
app.get('/docs-sites/:websiteId/search-index', requirePermission(PERMISSIONS.ASSETS_VIEW), (req: Request, res: Response) => sendDocsSearchIndex(req, res, false));
app.get('/public/docs/:websiteId/search-index', (req: Request, res: Response) => sendDocsSearchIndex(req, res, true));

// Public: only documents that are public in the DAM exist here; a private one is neither listed, linked nor served.
app.get('/public/docs/:websiteId/nav', async (req: Request, res: Response): Promise<void> => {
  try {
    const site = await docsSiteFor(req.params.websiteId, res, true);
    if (site) res.json({ title: site.config.title, nav: site.nav });
  } catch (error: any) {
    logger.error({ err: error, module: 'docs-sites' }, 'Failed to load the documentation index');
    res.status(500).json({ error: 'Failed to load the documentation index' });
  }
});

app.get('/public/docs/:websiteId/page/*', async (req: Request, res: Response): Promise<void> => {
  try {
    const site = await docsSiteFor(req.params.websiteId, res, true);
    if (!site) return;
    const doc = findDocByRoute(site, String((req.params as any)[0] ?? ''));
    if (!doc) { res.status(404).json({ error: 'Document not found' }); return; }
    const { warnings: _warnings, ...page } = renderDocPage(site, doc);
    res.json({ site: { title: site.config.title }, page });
  } catch (error: any) {
    logger.error({ err: error, module: 'docs-sites' }, 'Failed to render the document');
    res.status(500).json({ error: 'Failed to render the document' });
  }
});

// Sessions that expired or were revoked more than a week ago are deleted (finding F-056: the table used to grow with every login):
// once the database is ready, then every six hours.
async function purgeSessions(): Promise<void> {
  try {
    const n = await purgeStaleSessions();
    if (n > 0) logger.info({ purged: n }, 'Purged stale sessions');
  } catch (err) {
    logger.warn({ err }, 'Session purge failed');
  }
}

// On-the-fly bootstrap: create the database if it doesn't exist, apply any
// pending migrations, and seed default roles/permissions/admin user. Runs
// on every boot; all steps are idempotent, so this is a no-op once already
// up to date. Means a fresh Postgres volume (e.g. after changing the
// container's volume mount) just works on next start - no manual
// `db:migrate` / `db:seed` step required.
bootstrapDatabase()
  .then(() => {
    void purgeSessions();
    setInterval(purgeSessions, 6 * 60 * 60 * 1000).unref();
    // audit log retention (AUDIT_RETENTION_DAYS, default 365, 0 = keep forever): at start and then daily
    const purgeAuditLog = (): void => {
      purgeAudit().then((n) => { if (n > 0) logger.info({ removed: n, days: auditRetentionDays() }, 'audit log: old rows removed'); })
        .catch((err) => logger.error({ err }, 'audit log: retention job failed'));
    };
    purgeAuditLog();
    setInterval(purgeAuditLog, 24 * 60 * 60 * 1000).unref();
    // retention of data (docs/plans/system/data-subject-plan.md): objects older than their class's retention_days, mail log rows older than the setting;
    // nothing is configured by default. At start, then daily; the files of a deleted object go first.
    const scheduledRetention = (): void => { runRetentionNow().catch((err) => logger.error({ err }, 'retention: job failed')); };
    setTimeout(scheduledRetention, 60_000).unref();   // not in the middle of the start
    setInterval(scheduledRetention, 24 * 60 * 60 * 1000).unref();
    app.listen(port, () => {
      logger.info({ port }, 'Core API started');
    });
  })
  .catch((error) => {
    logger.fatal({ err: error }, 'Database bootstrap failed - core-api cannot start');
    process.exit(1);
  });
