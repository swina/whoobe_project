import { and, asc, desc, eq, gte, lt, sql, type SQL } from 'drizzle-orm';
import { getDb } from './client.js';
import { users } from './auth-schema.js';
import { aiUsage, aiUsageMonthly } from './ai-usage-schema.js';
import type { AiUsage } from '../ai/usage.js';

// Token usage per user (docs/plans/ai/ai-usage-plan.md): written by core-api only while the tracking is on, read by the
// administrator (permission ai_usage:read) and by each user for their own rows.

export interface AiUsageEntry {
  userId: string;
  kind: string;
  provider: string | null;
  model: string | null;
  usage: AiUsage;
  status: 'success' | 'error';
}

/** One request: a detail row and the monthly total of its user, kind and model, in one transaction. */
export async function recordAiUsage(e: AiUsageEntry, now: Date = new Date()): Promise<void> {
  const month = `${now.toISOString().slice(0, 7)}-01`;
  const input = e.usage.inputTokens ?? 0;
  const output = e.usage.outputTokens ?? 0;
  await getDb().transaction(async (tx) => {
    await tx.insert(aiUsage).values({
      userId: e.userId, kind: e.kind, provider: e.provider, model: e.model, calls: e.usage.calls,
      inputTokens: e.usage.inputTokens, outputTokens: e.usage.outputTokens, status: e.status, createdAt: now,
    });
    await tx.insert(aiUsageMonthly).values({
      userId: e.userId, month, kind: e.kind, provider: e.provider ?? '', model: e.model ?? '',
      requests: 1, calls: e.usage.calls, inputTokens: input, outputTokens: output,
    }).onConflictDoUpdate({
      target: [aiUsageMonthly.userId, aiUsageMonthly.month, aiUsageMonthly.kind, aiUsageMonthly.provider, aiUsageMonthly.model],
      set: {
        requests: sql`${aiUsageMonthly.requests} + 1`,
        calls: sql`${aiUsageMonthly.calls} + ${e.usage.calls}`,
        inputTokens: sql`${aiUsageMonthly.inputTokens} + ${input}`,
        outputTokens: sql`${aiUsageMonthly.outputTokens} + ${output}`,
      },
    });
  });
}

export interface AiUsageTotals { requests: number; errors: number; calls: number; inputTokens: number; outputTokens: number }
export interface AiUsageUserTotals extends AiUsageTotals { userId: string; email: string | null; displayName: string | null }
export interface AiUsageGroupTotals extends AiUsageTotals { key: string }
export interface AiUsageCall {
  createdAt: Date; kind: string; provider: string | null; model: string | null;
  calls: number; inputTokens: number | null; outputTokens: number | null; status: string;
}
export interface AiUsageReport {
  from: Date; to: Date;
  total: AiUsageTotals;
  byUser: AiUsageUserTotals[];
  byKind: AiUsageGroupTotals[];
  byModel: AiUsageGroupTotals[];
  byDay: AiUsageGroupTotals[];
  /** the requests one by one, newest first, only when the report is for one user */
  calls?: AiUsageCall[];
}

export const AI_USAGE_MAX_CALLS = 1000;

const totalsCols = {
  requests: sql<number>`count(*)::int`,
  errors: sql<number>`count(*) filter (where ${aiUsage.status} = 'error')::int`,
  calls: sql<number>`coalesce(sum(${aiUsage.calls}), 0)::int`,
  inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::bigint`,
  outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::bigint`,
};
const num = <T extends AiUsageTotals>(r: T): T => ({ ...r, inputTokens: Number(r.inputTokens), outputTokens: Number(r.outputTokens) });

/** Totals of the detail rows in [from, to), overall and by user, kind, model and day; with `userId`, that user only and their requests. */
export async function getAiUsageReport(opts: { from: Date; to: Date; userId?: string }): Promise<AiUsageReport> {
  const db = getDb();
  const where = and(gte(aiUsage.createdAt, opts.from), lt(aiUsage.createdAt, opts.to), opts.userId ? eq(aiUsage.userId, opts.userId) : undefined);
  const group = async (key: SQL<string>): Promise<AiUsageGroupTotals[]> =>
    (await db.select({ key, ...totalsCols }).from(aiUsage).where(where).groupBy(key).orderBy(key)).map(num);

  const [total] = await db.select(totalsCols).from(aiUsage).where(where);
  const byUser = (await db
    .select({ userId: aiUsage.userId, email: users.email, displayName: users.displayName, ...totalsCols })
    .from(aiUsage).leftJoin(users, eq(users.id, aiUsage.userId)).where(where)
    .groupBy(aiUsage.userId, users.email, users.displayName)
    .orderBy(desc(sql`coalesce(sum(${aiUsage.inputTokens}), 0) + coalesce(sum(${aiUsage.outputTokens}), 0)`))).map(num);
  const report: AiUsageReport = {
    from: opts.from, to: opts.to, total: num(total), byUser,
    byKind: await group(sql<string>`${aiUsage.kind}`),
    byModel: await group(sql<string>`coalesce(${aiUsage.provider}, '') || ' / ' || coalesce(${aiUsage.model}, '')`),
    byDay: await group(sql<string>`to_char(${aiUsage.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`),
  };
  if (opts.userId) {
    report.calls = await db
      .select({ createdAt: aiUsage.createdAt, kind: aiUsage.kind, provider: aiUsage.provider, model: aiUsage.model, calls: aiUsage.calls, inputTokens: aiUsage.inputTokens, outputTokens: aiUsage.outputTokens, status: aiUsage.status })
      .from(aiUsage).where(where).orderBy(desc(aiUsage.createdAt)).limit(AI_USAGE_MAX_CALLS);
  }
  return report;
}

export interface AiUsageMonthRow {
  month: string; userId: string; email: string | null; displayName: string | null;
  kind: string; provider: string; model: string; requests: number; calls: number; inputTokens: number; outputTokens: number;
}

/** The monthly totals of months in [fromMonth, toMonth] (YYYY-MM), optionally of one user. */
export async function getAiUsageMonthly(opts: { fromMonth: string; toMonth: string; userId?: string }): Promise<AiUsageMonthRow[]> {
  const rows = await getDb()
    .select({
      month: sql<string>`to_char(${aiUsageMonthly.month}, 'YYYY-MM')`, userId: aiUsageMonthly.userId, email: users.email, displayName: users.displayName,
      kind: aiUsageMonthly.kind, provider: aiUsageMonthly.provider, model: aiUsageMonthly.model, requests: aiUsageMonthly.requests,
      calls: aiUsageMonthly.calls, inputTokens: aiUsageMonthly.inputTokens, outputTokens: aiUsageMonthly.outputTokens,
    })
    .from(aiUsageMonthly).leftJoin(users, eq(users.id, aiUsageMonthly.userId))
    .where(and(
      gte(aiUsageMonthly.month, `${opts.fromMonth}-01`), sql`${aiUsageMonthly.month} <= ${`${opts.toMonth}-01`}::date`,
      opts.userId ? eq(aiUsageMonthly.userId, opts.userId) : undefined,
    ))
    .orderBy(desc(aiUsageMonthly.month), asc(users.email), asc(aiUsageMonthly.kind));
  return rows.map((r) => ({ ...r, inputTokens: Number(r.inputTokens), outputTokens: Number(r.outputTokens) }));
}

/** Deletes the detail rows older than `cutoff`, in batches; the monthly totals are not touched. */
export async function purgeAiUsageBefore(cutoff: Date, batch = 1000, maxBatches = 100): Promise<number> {
  let deleted = 0;
  for (let i = 0; i < maxBatches; i++) {
    const gone = await getDb().execute(sql`DELETE FROM ai_usage WHERE id IN (SELECT id FROM ai_usage WHERE created_at < ${cutoff.toISOString()} LIMIT ${batch}) RETURNING id`);
    deleted += gone.rows.length;
    if (gone.rows.length < batch) break;
  }
  return deleted;
}
