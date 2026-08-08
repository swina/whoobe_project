import { pgTable, text, jsonb, uuid, timestamp } from 'drizzle-orm/pg-core';

export const websites = pgTable('websites', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  domains: text('domains').array().notNull().default([]),
  defaultLocale: text('default_locale').notNull().default('en'),
  supportedLocales: text('supported_locales').array().notNull().default(['en']),
  settings: jsonb('settings').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});