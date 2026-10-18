// Publishing a website from the dashboard (docs/plans/website/publish-from-dashboard.md, phase 1). core-api only queues jobs and
// serves their state; it never runs the generator. A runner (apps/publisher) pulls jobs with PUBLISH_RUNNER_TOKEN, runs
// `whoobe-publish` with an argument array and reports the log and the outcome back here.
import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { AUDIT } from './audit-specs.js';
import type { AuditSpec } from './audit.js';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { validateGenerateOptions } from '@whoobe-cms/publish';
import {
  PERMISSIONS, requirePermission, getWebsite,
  createPublishJob, getPublishJob, listPublishJobs, cancelPublishJob, claimNextPublishJob, appendPublishLog, finishPublishJob,
  PublishJobActiveError, PUBLISH_LOG_MAX_CHARS, type AuthenticatedRequest,
} from '@whoobe-cms/core/server';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PublishJobOptions {
  apiUrl: string; framework: 'next' | 'vue'; slug: string; revalidate: number;
  domain?: string; assetBaseUrl?: string; gatewayUrl?: string; basePath?: string;
}

/** Checks what the dashboard sent with the generator's own rules (validateGenerateOptions); returns the options to store. The gateway site
 *  key is deliberately not accepted: a queued row must never hold it. */
export function parsePublishJobOptions(websiteId: string, raw: unknown): PublishJobOptions {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (k: string): string | undefined => (typeof o[k] === 'string' && (o[k] as string).trim() ? (o[k] as string).trim() : undefined);
  const framework = o.framework === 'next' ? 'next' : o.framework === 'vue' ? 'vue' : null;
  if (!framework) throw new Error('framework must be "next" or "vue"');
  const slug = str('slug') ?? '';
  if (!SLUG_RE.test(slug)) throw new Error('slug must be lowercase letters, digits and dashes (max 40)');
  const apiUrl = str('apiUrl');
  if (!apiUrl) throw new Error('apiUrl is required');
  const revalidate = typeof o.revalidate === 'number' ? o.revalidate : 60;
  const options: PublishJobOptions = { apiUrl, framework, slug, revalidate, domain: str('domain'), assetBaseUrl: str('assetBaseUrl'), gatewayUrl: str('gatewayUrl'), basePath: str('basePath') };
  validateGenerateOptions({ apiUrl, websiteId, outDir: 'unused', framework, revalidate, domain: options.domain, assetBaseUrl: options.assetBaseUrl, gatewayUrl: options.gatewayUrl, basePath: options.basePath });
  return options;
}

/** The optional gateway site key of a run, checked with the generator's own rule. */
export function parseSiteKey(websiteId: string, raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') throw new Error('siteApiKey must be a string');
  validateGenerateOptions({ apiUrl: 'http://x', websiteId, outDir: 'unused', framework: 'next', revalidate: 0, siteApiKey: raw });
  return raw;
}

function tokenOk(given: string, expected: string): boolean {
  const a = Buffer.from(given); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Only the runner: a shared secret (PUBLISH_RUNNER_TOKEN). Without one configured the runner routes answer 503. */
export function requireRunner(token: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!token) { res.status(503).json({ error: 'No publish runner is configured (PUBLISH_RUNNER_TOKEN)' }); return; }
    const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
    if (!m || !tokenOk(m[1], token)) { res.status(401).json({ error: 'Invalid runner token' }); return; }
    next();
  };
}

export function publishJobsRouter(runnerToken: string, log: { info: (o: object, m: string) => void; error: (o: object, m: string) => void }, audited: (spec: AuditSpec<any>) => RequestHandler): Router {
  const r = Router();
  const canPublish = requirePermission(PERMISSIONS.WEBSITES_PUBLISH);
  const idOk = (req: Request, res: Response): string | null => {
    if (UUID_RE.test(req.params.id)) return req.params.id;
    res.status(400).json({ error: 'Invalid job id' }); return null;
  };

  // --- the dashboard ---
  r.post('/publish/jobs', canPublish, audited(AUDIT.publishQueue), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const websiteId = typeof req.body?.websiteId === 'string' ? req.body.websiteId : '';
      if (!UUID_RE.test(websiteId)) { res.status(400).json({ error: 'websiteId must be a UUID' }); return; }
      const website = await getWebsite(websiteId);
      if (!website) { res.status(404).json({ error: 'Website not found' }); return; }
      if ((website.settings as Record<string, unknown> | null)?.kind === 'docs') { res.status(400).json({ error: 'A documentation site is published from its own tab' }); return; }
      let options: PublishJobOptions;
      try { options = parsePublishJobOptions(websiteId, req.body?.options); } catch (e) { res.status(400).json({ error: (e as Error).message }); return; }
      let siteKey: string | null;
      try { siteKey = parseSiteKey(websiteId, req.body?.siteApiKey); } catch (e) { res.status(400).json({ error: (e as Error).message }); return; }
      const job = await createPublishJob({ websiteId, requestedBy: req.user?.id ?? null, options: { ...options }, siteKey });
      log.info({ module: 'publish', jobId: job.id, websiteId, by: req.user?.id, options }, 'publication queued' + (siteKey ? ' (with a site key)' : ''));
      res.status(201).json({ id: job.id, status: job.status });
    } catch (e) {
      if (e instanceof PublishJobActiveError) { res.status(409).json({ error: e.message }); return; }
      log.error({ err: e, module: 'publish' }, 'Failed to queue a publication');
      res.status(500).json({ error: 'Failed to queue the publication' });
    }
  });

  r.get('/publish/jobs', canPublish, async (req: Request, res: Response): Promise<void> => {
    const websiteId = String(req.query.websiteId ?? '');
    if (!UUID_RE.test(websiteId)) { res.status(400).json({ error: 'websiteId must be a UUID' }); return; }
    res.json({ jobs: await listPublishJobs(websiteId) });
  });

  // `from` = characters of log the caller already has, so a poll returns only the new output
  r.get('/publish/jobs/:id', canPublish, async (req: Request, res: Response): Promise<void> => {
    const id = idOk(req, res); if (!id) return;
    const job = await getPublishJob(id);
    if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
    const from = Math.max(0, Math.min(Number.parseInt(String(req.query.from ?? '0'), 10) || 0, PUBLISH_LOG_MAX_CHARS));
    const { log: full, ...rest } = job;
    res.json({ ...rest, log: full.slice(from), logSize: full.length });
  });

  r.post('/publish/jobs/:id/cancel', canPublish, audited(AUDIT.publishCancel), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = idOk(req, res); if (!id) return;
    const result = await cancelPublishJob(id);
    if (!result) { res.status(409).json({ error: 'The job is not queued or running' }); return; }
    log.info({ module: 'publish', jobId: id, by: req.user?.id, result }, 'publication cancel');
    res.json({ result });
  });

  // --- the runner ---
  const asRunner = requireRunner(runnerToken);
  r.post('/publish/runner/claim', asRunner, async (req: Request, res: Response): Promise<void> => {
    const name = typeof req.body?.runner === 'string' ? req.body.runner.slice(0, 80) : 'runner';
    const claimed = await claimNextPublishJob(name);
    if (!claimed) { res.status(204).end(); return; }
    const { job, siteKey } = claimed;
    res.json({ id: job.id, websiteId: job.websiteId, options: job.options, siteKey, releasePath: `${(job.options as PublishJobOptions).slug}/releases/${job.id}` });
  });

  r.post('/publish/runner/jobs/:id/log', asRunner, async (req: Request, res: Response): Promise<void> => {
    const id = idOk(req, res); if (!id) return;
    const text = typeof req.body?.text === 'string' ? req.body.text.slice(0, 64_000) : '';
    const state = await appendPublishLog(id, text);
    if (!state) { res.status(409).json({ error: 'The job is not running' }); return; }
    res.json(state);
  });

  r.post('/publish/runner/jobs/:id/finish', asRunner, async (req: Request, res: Response): Promise<void> => {
    const id = idOk(req, res); if (!id) return;
    const status = req.body?.status;
    if (status !== 'succeeded' && status !== 'failed' && status !== 'cancelled') { res.status(400).json({ error: 'status must be succeeded, failed or cancelled' }); return; }
    const ok = await finishPublishJob(id, { status, error: typeof req.body?.error === 'string' ? req.body.error : null, releasePath: typeof req.body?.releasePath === 'string' ? req.body.releasePath : null });
    if (!ok) { res.status(409).json({ error: 'The job is not running' }); return; }
    log.info({ module: 'publish', jobId: id, status }, 'publication finished');
    res.json({ ok: true });
  });

  return r;
}
