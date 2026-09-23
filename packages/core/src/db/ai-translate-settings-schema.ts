import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Dedicated per-user AI config for page translation (POST /whoobe-one/
// pages/:id/translate) - same shape as ai_settings/ai_image_settings, kept
// as its own row rather than a field on ai_settings so a user can pick a
// different provider/model for translation without touching their page/
// snippet generation config. Exists because translation and generation
// have different reliability profiles on the same free/small models - see
// CHANGES.md's "empty response" translation bug for why a dedicated slot
// was worth adding instead of only tuning the one shared config.
export const aiTranslateSettings = pgTable('ai_translate_settings', {
  userId: uuid('user_id').primaryKey().notNull(),
  provider: text('provider').notNull().default('openai'),
  model: text('model').notNull().default('gpt-4o-mini'),
  endpoint: text('endpoint'),
  apiKey: text('api_key'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
