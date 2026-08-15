import { and, desc, asc, eq, inArray, or, ilike, count, type SQL } from 'drizzle-orm';
import { getDb } from './client.js';
import { mailLog } from './mail-log-schema.js';

export type MailLogStatus = 'sent' | 'failed';
export type MailLogOrder = 'newest' | 'oldest';

export interface MailLogRecord {
  id: string;
  to: string;
  from: string | null;
  cc: string | null;
  subject: string;
  html: string | null;
  text: string | null;
  status: string;
  error: string | null;
  sentAt: Date;
}

/** Appends one row per send attempt. `from`/`cc`/`error` and the message
 *  body (`html`/`text`) are optional so both callers (form notifications
 *  and the mail-settings "Email Test" flow) share the same write path. */
export async function logMailDelivery(input: {
  to: string;
  from?: string | null;
  cc?: string | null;
  subject: string;
  html?: string | null;
  text?: string | null;
  status: MailLogStatus;
  error?: string | null;
}): Promise<MailLogRecord> {
  const db = getDb();
  const [row] = await db
    .insert(mailLog)
    .values({
      to: input.to,
      from: input.from ?? null,
      cc: input.cc ?? null,
      subject: input.subject,
      html: input.html ?? null,
      text: input.text ?? null,
      status: input.status,
      error: input.error ?? null,
    })
    .returning();
  return row;
}

/** Newest-first log for the admin Log view. `search` matches `to`,
 *  `subject`, and `status` (case-insensitive substring); `order` flips to
 *  oldest-first. `limit` is capped at 500 rows per page. Returns the page
 *  plus the total matching count so the UI can paginate. */
export async function listMailLog(options?: {
  status?: MailLogStatus;
  search?: string;
  order?: MailLogOrder;
  limit?: number;
  offset?: number;
}): Promise<{ records: MailLogRecord[]; total: number }> {
  const db = getDb();
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500);
  const offset = Math.max(options?.offset ?? 0, 0);

  const conditions: SQL[] = [];
  if (options?.status) {
    conditions.push(eq(mailLog.status, options.status));
  }
  if (options?.search?.trim()) {
    const q = `%${options.search.trim()}%`;
    conditions.push(
      or(ilike(mailLog.to, q), ilike(mailLog.subject, q), ilike(mailLog.status, q))!,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(mailLog)
      .where(where)
      .orderBy(options?.order === 'oldest' ? asc(mailLog.sentAt) : desc(mailLog.sentAt))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(mailLog).where(where),
  ]);

  return { records: rows, total: totals[0]?.value ?? 0 };
}

/** Deletes the given entries (the "Delete" action in the admin Log view).
 *  Returns how many rows were actually removed. No-op for an empty list. */
export async function deleteMailLogEntries(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const db = getDb();
  const deleted = await db.delete(mailLog).where(inArray(mailLog.id, ids)).returning({ id: mailLog.id });
  return deleted.length;
}

/** Full single entry, including the stored body - used by the admin
 *  preview modal and the resend endpoint. `null` when the id doesn't
 *  exist (it's a uuid, so invalid ids are just unmatched). */
export async function getMailLogEntry(id: string): Promise<MailLogRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(mailLog).where(eq(mailLog.id, id)).limit(1);
  return row ?? null;
}
