import { pgTable, text, jsonb, uuid, timestamp } from 'drizzle-orm/pg-core';

export interface MenuItem {
  label: string;
  pageId?: string | null;
  url?: string | null;
  children?: MenuItem[];
}

export const menus = pgTable('menus', {
  id: uuid('id').primaryKey().defaultRandom(),
  websiteId: uuid('website_id').notNull(),
  name: text('name').notNull(),
  items: jsonb('items').$type<MenuItem[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});