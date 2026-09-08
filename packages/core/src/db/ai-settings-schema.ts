import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Per-user AI generation config (docs/plans/ai/ai-pages-snippets-generator.md)
// Keyed on user_id so each user manages their own API key. The API key is
// server-side-only: the GET route never returns it (only `hasApiKey`).
export const aiSettings = pgTable('ai_settings', {
  userId: uuid('user_id').primaryKey().notNull(),
  provider: text('provider').notNull().default('openai'),
  model: text('model').notNull().default('gpt-4o-mini'),
  endpoint: text('endpoint'),
  apiKey: text('api_key'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});