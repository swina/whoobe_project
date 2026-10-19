import { sql } from 'drizzle-orm';
import { getDb } from './client.js';
import { publishJobs } from './publish-jobs-schema.js';
import { objectEventDeliveries } from './object-events-schema.js';

// Counts for /metrics: how much work is waiting. Both tables have an index that starts with `status`.

export type StatusCounts = Record<string, number>;

async function countByStatus(table: typeof publishJobs | typeof objectEventDeliveries): Promise<StatusCounts> {
  const rows = await getDb().select({ status: table.status, n: sql<number>`count(*)::int` }).from(table).groupBy(table.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

/** Publish jobs by status (queued, running, succeeded, failed, cancelled ...). */
export const publishJobCounts = (): Promise<StatusCounts> => countByStatus(publishJobs);

/** Object event deliveries by status (pending, retrying, delivered, dead). */
export const eventDeliveryCounts = (): Promise<StatusCounts> => countByStatus(objectEventDeliveries);
