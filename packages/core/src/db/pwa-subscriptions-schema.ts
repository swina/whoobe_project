import { pgTable, text, jsonb, uuid, timestamp } from 'drizzle-orm/pg-core';
import { websites } from './websites-schema.js';

export const pwaSubscriptions = pgTable('pwa_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  websiteId: uuid('website_id').notNull().references(() => websites.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull().default('self'),
  endpoint: text('endpoint').notNull(),
  keys: jsonb('keys').$type<Record<string, string>>().default({}),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});