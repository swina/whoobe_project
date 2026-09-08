import { pgTable, text, jsonb, uuid, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const websites = pgTable('websites', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  rootPath: text('root_path').notNull().default(''),
  domains: text('domains').array().notNull().default([]),
  defaultLocale: text('default_locale').notNull().default('en'),
  supportedLocales: text('supported_locales').array().notNull().default(['en']),
  settings: jsonb('settings').$type<Record<string, unknown>>().default({}),
  themeId: uuid('theme_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  rootPathIdx: uniqueIndex('root_path_idx').on(table.rootPath),
}));