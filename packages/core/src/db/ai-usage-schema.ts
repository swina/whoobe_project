import { pgTable, text, uuid, integer, bigint, timestamp, date, primaryKey, index } from 'drizzle-orm/pg-core';
import { users } from './auth-schema.js';

// Token usage of the AI functions per user (docs/plans/ai/ai-usage-plan.md). Written only while the administrator has
// turned the tracking on (security_settings.ai_usage_tracking). Counts only: never the prompt, the answer or the
// object being edited. The rows go with the user (ON DELETE CASCADE).

/** One row per AI request (a request can make several provider calls: retries, translation batches). Deleted after
 *  security_settings.ai_usage_retention_days. */
export const aiUsage = pgTable('ai_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** page | snippet | text | website-structure | wizard-texts | page-translation | image */
  kind: text('kind').notNull(),
  provider: text('provider'),
  model: text('model'),
  calls: integer('calls').notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  /** success | error */
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('ai_usage_created_idx').on(t.createdAt), index('ai_usage_user_created_idx').on(t.userId, t.createdAt)]);

/** Totals per user, month, kind and model, kept after the detail rows are gone (until the user is deleted). */
export const aiUsageMonthly = pgTable('ai_usage_monthly', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** first day of the month (UTC) */
  month: date('month').notNull(),
  kind: text('kind').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  requests: integer('requests').notNull(),
  calls: integer('calls').notNull(),
  inputTokens: bigint('input_tokens', { mode: 'number' }).notNull(),
  outputTokens: bigint('output_tokens', { mode: 'number' }).notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.month, t.kind, t.provider, t.model] })]);
