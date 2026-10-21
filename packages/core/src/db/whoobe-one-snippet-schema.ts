import { pgTable, text, jsonb, uuid, timestamp, boolean } from 'drizzle-orm/pg-core';

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
  // Free-text usage notes for whoever picks this snippet later (e.g. "use
  // for the top of a product page, expects a hero image and a CTA link") -
  // shown from the snippets list (an info icon per chip) and, once a
  // snippet has been dropped into a document, in the selected element's
  // Advanced > Info panel (see ElementsClass.d.ts's sourceSnippetId field,
  // stamped onto the clone at drop time in BlockEditor.vue).
  notes: text('notes'),
  // Captured preview image (small WebP data URL) for the Snippets grid.
  thumbnail: text('thumbnail'),
  // Locked: never saved automatically (editor autosave skips it; the API refuses a save flagged `autosave`). Manual saves still work.
  locked: boolean('locked').notNull().default(false),
  // The block of the Generate Website Wizard this snippet stands for (hero, banner, cta, ...): when set, the wizard offers it in its list of blocks
  // whatever the category. Null: it is offered only when its category is a block name.
  wizardBlock: text('wizard_block'),
  // The name the wizard shows for it as a block (null: the name of the snippet). Needed for `custom`, a block of its own.
  wizardLabel: text('wizard_label'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
