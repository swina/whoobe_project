import { and, desc, eq, gte, lt, lte, sql, type SQL } from 'drizzle-orm';
import { getDb } from './client.js';
import { auditLog, type AuditLogRow } from './audit-log-schema.js';
import { auditRetentionDays, redactForAudit, type AuditEntry } from './audit-log.js';

// Writes and reads of the audit log (docs/plans/system/audit-log-plan.md). The table is append only (migration 0060): this file is the
// only code that inserts, and the only code that deletes (purgeAudit, inside the transaction that unlocks the delete).

/** Rows that could not be written since this process started: shown by /health so a silent gap is visible. */
export const auditStats = { written: 0, lost: 0 };

const text = (v: unknown, max = 500): string | null => (typeof v === 'string' && v ? v.slice(0, max) : null);

export async function insertAudit(entry: AuditEntry): Promise<string> {
  const [row] = await getDb()
    .insert(auditLog)
    .values({
      actorType: entry.actor.type,
      actorId: text(entry.actor.id, 200),
      actorLabel: text(entry.actor.label, 320),
      ip: text(entry.ip, 64),
      action: entry.action.slice(0, 100),
      targetType: text(entry.targetType, 100),
      targetId: text(entry.targetId, 200),
      targetLabel: text(entry.targetLabel, 300),
      before: (entry.before ? redactForAudit(entry.before) : null) as Record<string, unknown> | null,
      after: (entry.after ? redactForAudit(entry.after) : null) as Record<string, unknown> | null,
      requestId: text(entry.requestId, 100),
    })
    .returning({ id: auditLog.id });
  auditStats.written += 1;
  return row.id;
}

/** insertAudit that never throws: a failed write is counted and reported through `onError` (the change already happened). */
export async function insertAuditSafe(entry: AuditEntry, onError: (err: unknown, entry: AuditEntry) => void): Promise<void> {
  try {
    await insertAudit(entry);
  } catch (err) {
    auditStats.lost += 1;
    try { onError(err, entry); } catch { /* the logger must not break a request */ }
  }
}

export interface AuditFilters {
  action?: string;
  /** exact action, or a prefix ending in "." (e.g. "user.") */
  actor?: string;
  targetType?: string;
  targetId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

function where(f: AuditFilters): SQL | undefined {
  const c: SQL[] = [];
  if (f.action) c.push(f.action.endsWith('.') ? sql`${auditLog.action} LIKE ${f.action.replace(/[%_\\]/g, '\\$&') + '%'}` : eq(auditLog.action, f.action));
  if (f.actor) c.push(eq(auditLog.actorId, f.actor));
  if (f.targetType) c.push(eq(auditLog.targetType, f.targetType));
  if (f.targetId) c.push(eq(auditLog.targetId, f.targetId));
  if (f.from) c.push(gte(auditLog.at, f.from));
  if (f.to) c.push(lte(auditLog.at, f.to));
  return c.length ? and(...c) : undefined;
}

export async function listAudit(f: AuditFilters = {}): Promise<{ rows: AuditLogRow[]; total: number }> {
  const limit = Math.min(Math.max(Math.floor(f.limit ?? 100), 1), 5000);
  const offset = Math.max(Math.floor(f.offset ?? 0), 0);
  const db = getDb();
  const rows = await db.select().from(auditLog).where(where(f)).orderBy(desc(auditLog.at), desc(auditLog.id)).limit(limit).offset(offset);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(auditLog).where(where(f));
  return { rows, total: n };
}

/**
 * Deletes the rows older than `days` (default `AUDIT_RETENTION_DAYS`; 0 = keep forever), in batches, each in its own transaction that
 * unlocks the delete trigger for that transaction only. Writes one `audit.purge` row with the count. Returns the number removed.
 */
export async function purgeAudit(days: number = auditRetentionDays(), batch = 1000): Promise<number> {
  if (!(days > 0)) return 0;
  const cutoff = new Date(Date.now() - days * 86_400_000);
  let removed = 0;
  for (;;) {
    const n = await getDb().transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('whoobe.audit_purge', 'on', true)`);
      const res = await tx.execute(sql`DELETE FROM audit_log WHERE id IN (SELECT id FROM audit_log WHERE at < ${cutoff} ORDER BY at LIMIT ${batch}) RETURNING id`);
      return (res as unknown as { rows?: unknown[] }).rows?.length ?? (Array.isArray(res) ? res.length : 0);
    });
    removed += n;
    if (n < batch) break;
  }
  if (removed > 0) {
    await insertAudit({ actor: { type: 'system', label: 'retention' }, action: 'audit.purge', after: { removed, olderThanDays: days, before: cutoff.toISOString() } });
  }
  return removed;
}

export async function countAuditOlderThan(days: number): Promise<number> {
  const [{ n }] = await getDb().select({ n: sql<number>`count(*)::int` }).from(auditLog).where(lt(auditLog.at, new Date(Date.now() - days * 86_400_000)));
  return n;
}
