import { and, desc, eq, getTableColumns, inArray, lt, sql } from 'drizzle-orm';
import { getDb } from './client.js';
import { publishJobs } from './publish-jobs-schema.js';
import { decryptIntegrationSecret, encryptIntegrationSecret } from './integration-secrets-crypto.js';

export type PublishJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type PublishJobRecord = typeof publishJobs.$inferSelect;

/** The log is capped: a runaway build must not fill the database. */
export const PUBLISH_LOG_MAX_CHARS = 512_000;
/** A running job whose runner stopped reporting for this long is failed by the next claim. */
export const PUBLISH_STALE_MS = 10 * 60_000;

const UNIQUE_ACTIVE = 'publish_jobs_one_active_per_website';

export class PublishJobActiveError extends Error {
  constructor() { super('A publication of this website is already queued or running'); }
}

/** Queues a job. Throws PublishJobActiveError when the website already has one queued or running (partial unique index). */
export async function createPublishJob(input: { websiteId: string; requestedBy: string | null; options: Record<string, unknown>; siteKey?: string | null }): Promise<PublishJobRecord> {
  try {
    const [row] = await getDb().insert(publishJobs).values({ websiteId: input.websiteId, requestedBy: input.requestedBy, options: input.options, siteKeyEnc: encryptIntegrationSecret(input.siteKey) }).returning();
    return row;
  } catch (err) {
    const e = err as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
    if ((e.code ?? e.cause?.code) === '23505' && (e.constraint ?? e.cause?.constraint) === UNIQUE_ACTIVE) throw new PublishJobActiveError();
    throw err;
  }
}

export async function getPublishJob(id: string): Promise<PublishJobRecord | null> {
  const [row] = await getDb().select().from(publishJobs).where(eq(publishJobs.id, id)).limit(1);
  return row ?? null;
}

/** Newest first, without the log (it can be large; read it with getPublishJob). */
export async function listPublishJobs(websiteId: string, limit = 20): Promise<Omit<PublishJobRecord, 'log' | 'siteKeyEnc'>[]> {
  const { log: _log, siteKeyEnc: _key, ...cols } = getTableColumns(publishJobs);
  return getDb().select(cols).from(publishJobs).where(eq(publishJobs.websiteId, websiteId)).orderBy(desc(publishJobs.createdAt)).limit(limit);
}

/** Fails running jobs whose runner went silent (crashed or restarted), so the website is not blocked for ever. */
export async function failStalePublishJobs(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - PUBLISH_STALE_MS);
  const rows = await getDb().update(publishJobs)
    .set({ status: 'failed', error: 'The runner stopped reporting', finishedAt: now })
    .where(and(eq(publishJobs.status, 'running'), lt(publishJobs.heartbeatAt, cutoff)))
    .returning({ id: publishJobs.id });
  return rows.length;
}

/** Takes the oldest queued job for this runner (safe with several runners). The site key, if the job carried one, is returned once and
 *  erased in the same statement. */
export async function claimNextPublishJob(runner: string): Promise<{ job: PublishJobRecord; siteKey: string | null } | null> {
  await failStalePublishJobs();
  const res = await getDb().execute(sql`
    WITH c AS (SELECT id, site_key_enc FROM publish_jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
    UPDATE publish_jobs p SET status = 'running', runner = ${runner}, started_at = now(), heartbeat_at = now(), site_key_enc = NULL
    FROM c WHERE p.id = c.id
    RETURNING p.id AS id, c.site_key_enc AS site_key_enc`);
  const row = res.rows[0] as { id?: string; site_key_enc?: string | null } | undefined;
  if (!row?.id) return null;
  const job = await getPublishJob(row.id);
  return job ? { job, siteKey: decryptIntegrationSecret(row.site_key_enc ?? null) } : null;
}

/** Appends output (already masked by the caller) and refreshes the heartbeat; returns whether the job asked to be cancelled. */
export async function appendPublishLog(id: string, text: string): Promise<{ cancelRequested: boolean } | null> {
  const [row] = await getDb().update(publishJobs)
    .set({ log: sql`left(${publishJobs.log} || ${text}, ${PUBLISH_LOG_MAX_CHARS})`, heartbeatAt: new Date() })
    .where(and(eq(publishJobs.id, id), eq(publishJobs.status, 'running')))
    .returning({ cancelRequested: publishJobs.cancelRequested });
  return row ?? null;
}

/** running -> succeeded | failed | cancelled, once. */
export async function finishPublishJob(id: string, input: { status: 'succeeded' | 'failed' | 'cancelled'; error?: string | null; releasePath?: string | null }): Promise<boolean> {
  const rows = await getDb().update(publishJobs)
    .set({ status: input.status, error: input.error?.slice(0, 500) ?? null, releasePath: input.releasePath ?? null, finishedAt: new Date() })
    .where(and(eq(publishJobs.id, id), eq(publishJobs.status, 'running'))).returning({ id: publishJobs.id });
  return rows.length === 1;
}

/** queued -> cancelled at once; running -> the runner is asked to stop. Returns the resulting state, or null if nothing could be cancelled. */
export async function cancelPublishJob(id: string): Promise<'cancelled' | 'requested' | null> {
  const queued = await getDb().update(publishJobs).set({ status: 'cancelled', finishedAt: new Date(), siteKeyEnc: null })
    .where(and(eq(publishJobs.id, id), eq(publishJobs.status, 'queued'))).returning({ id: publishJobs.id });
  if (queued.length) return 'cancelled';
  const running = await getDb().update(publishJobs).set({ cancelRequested: true })
    .where(and(eq(publishJobs.id, id), inArray(publishJobs.status, ['running']))).returning({ id: publishJobs.id });
  return running.length ? 'requested' : null;
}
