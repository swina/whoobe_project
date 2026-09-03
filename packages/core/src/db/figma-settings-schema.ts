import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const figmaSettings = pgTable('figma_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  accessToken: text('access_token'),
  teamId: text('team_id'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});