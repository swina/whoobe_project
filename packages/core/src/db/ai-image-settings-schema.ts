import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const aiImageSettings = pgTable('ai_image_settings', {
  userId: uuid('user_id').primaryKey().notNull(),
  provider: text('provider').notNull().default('openai'),
  model: text('model').notNull().default('dall-e-3'),
  endpoint: text('endpoint'),
  apiKey: text('api_key'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});