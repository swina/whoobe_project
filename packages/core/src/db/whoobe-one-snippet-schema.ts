import { pgTable, text, jsonb, uuid, timestamp } from 'drizzle-orm/pg-core';

/**
 * Reusable Element subtrees saved from the whoobe-one-spike editor
 * (apps/whoobe-one-spike/src/scripts/ElementsClass.js's `Element`/`blocks`
 * tree) - a distinct table from cms_snippets (snippet-schema.ts), which
 * stores a WhoobeBlockNode subtree for the unrelated Whoobe Studio editor.
 * Two genuinely different apps with two genuinely different, incompatible
 * node shapes - not one schema serving both. `node` is left untyped
 * (unlike cms_snippets's `$type<WhoobeBlockNode>()`) since the Element type
 * itself lives in apps/whoobe-one-spike, a frontend app; this package
 * never interprets the JSON's shape, only stores/retrieves it.
 */
export const whoobeOneSnippets = pgTable('whoobe_one_snippets', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  icon: text('icon'),
  node: jsonb('node').notNull(),
  themeId: uuid('theme_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
