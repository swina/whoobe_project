import { pgTable, text, jsonb, uuid, timestamp } from 'drizzle-orm/pg-core';

/**
 * A named, categorized collection of templates - apps/whoobe-one-spike's
 * own port of whoobe-one-studio's public/kits/*.json "UI Kit" format (see
 * that app's README's Kits section). `templates` embeds each template
 * entry's full JSON directly (same shape whoobe-one-template-schema.ts's
 * own `node`-bearing rows use, just nested one level deeper under each
 * entry's own `json.blocks`) rather than a foreign-key join to
 * whoobe_one_templates - a kit is a curated, self-contained bundle
 * (exactly what the source repo's own static JSON files already are), not
 * a live view over the templates table.
 */
export const whoobeOneKits = pgTable('whoobe_one_kits', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category').notNull().default(''),
  templates: jsonb('templates').$type<any[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
