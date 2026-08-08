import { pgTable, text, jsonb, uuid, timestamp } from 'drizzle-orm/pg-core';

export interface MenuItem {
  label: string;
  pageId?: string | null;
  url?: string | null;
  path?: string | null;
  children?: MenuItem[];
}

export const websitePaths = pgTable('website_paths', {
  id: uuid('id').primaryKey().defaultRandom(),
  websiteId: uuid('website_id').notNull(),
  name: text('name').notNull(),
  items: jsonb('items').$type<MenuItem[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});