import { pgTable, text, jsonb, uuid, boolean, timestamp } from 'drizzle-orm/pg-core';

// Website Templates (docs/plans/cms/website-templates.md) - a named, per-
// website composition of module pages into header/aside/footer slots around
// the routed page (the body is always the routed page itself, never part of
// the template's layout). An empty slot renders no wrapper at all; every
// slot wrapper can carry custom classes/style.

/** One layout slot: which module pages fill it + the wrapper's classes/style,
 *  plus optionally reusable whoobe_one_snippets and/or a directly-authored
 *  Element tree (or array of trees) rendered in the slot alongside the module
 *  pages - so a header/footer can include user-created elements without a
 *  whole module page. */
export interface TemplateSlot {
  pageIds: string[];
  /** whoobe_one_snippets ids (reusable Element subtrees from the editor). */
  snippetIds?: string[] | null;
  className?: string | null;
  style?: string | null;
  /** A single Element node, or an array of Element nodes (the same JSON
   *  shape whoobe-one-spike's editor produces). Rendered after pageIds. */
  content?: unknown | null;
}

export interface WebsiteTemplateLayout {
  header?: TemplateSlot | null;
  aside?: TemplateSlot | null;
  footer?: TemplateSlot | null;
}

export const websiteTemplates = pgTable('website_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  websiteId: uuid('website_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  layout: jsonb('layout').$type<WebsiteTemplateLayout>().notNull().default({}),
  // Routes this template applies to (glob patterns, e.g. '/it/news/*') -
  // when any match, this template wins over the website's default. Empty =
  // only ever used as the default.
  pathPatterns: text('path_patterns').array().notNull().default([]),
  // Fallback template for the website; at most one true per website
  // (enforced app-level in the records/API layer).
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
