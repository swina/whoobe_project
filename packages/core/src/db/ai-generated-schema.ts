import { pgTable, text, jsonb, uuid, timestamp } from 'drizzle-orm/pg-core';

/**
 * Audit/log of every AI generation performed through POST /ai/generate
 * (docs/plans/ai/ai-pages-snippets-generator.md) - both successes and
 * failures, so admins can review what was asked, what the model answered,
 * and what went wrong. `payload` is the generated Element tree for
 * kind='snippet'/'page' (untyped, like whoobe_one_snippets.node - the
 * Element type lives in apps/whoobe-one-spike, a frontend app, and this
 * package never interprets the JSON's shape, only stores/retrieves it);
 * `rawResponse` keeps the full model output for debugging - text, not
 * jsonb, because the raw reply is usually fence-wrapped markdown that is
 * not valid JSON (a jsonb column would reject it and kill the whole
 * request after a successful generation).
 */
export const aiGenerated = pgTable('whoobe_ai_generated', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').notNull(), // 'snippet' | 'page'
  prompt: text('prompt').notNull(),
  provider: text('provider'),
  model: text('model'),
  payload: jsonb('payload'),
  rawResponse: text('raw_response'),
  status: text('status').notNull().default('success'), // 'success' | 'error'
  error: text('error'),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});