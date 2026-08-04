import { pgTable, text, jsonb, uuid, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * A whole document built in apps/whoobe-one-spike by putting saved
 * snippets (whoobe-one-snippet-schema.ts) together - what that app's own
 * UI calls a "template" (previously "page", renamed for clarity - see that
 * app's README). `node` is the root `Element` subtree (ElementsClass.js's
 * own shape), same untyped-jsonb treatment as whoobe-one-snippet-schema.ts
 * for the same reason: the `Element` type lives in a frontend app, not
 * this backend package.
 *
 * `path` is unique - a real routable document shouldn't silently collide
 * with another one at the same address. Enforced here, not just in the
 * UI, since this is the actual constraint that matters once this editor
 * is integrated for real.
 */
export const whoobeOneTemplates = pgTable(
  'whoobe_one_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    category: text('category').notNull().default(''),
    path: text('path').notNull(),
    description: text('description'),
    node: jsonb('node').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pathIdx: uniqueIndex('whoobe_one_templates_path_idx').on(table.path),
  })
);
