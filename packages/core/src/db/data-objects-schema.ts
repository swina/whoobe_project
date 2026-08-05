import { pgTable, text, jsonb, uuid, boolean, integer, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * Data Object instances (Pimcore's PIM/MDM "Objects") - see docs/plans/
 * datamodel/advanced-data-modeling-plan.md §4.2 for the design this
 * implements (Phase 0, confirmed).
 *
 * `published`/`workflowState` deliberately reuse the exact shape
 * docs/plans/backend/object-publish-workflow-plan.md already designed for
 * Data Objects (§2.1 there) - `published` is the hard public-API-
 * visibility gate, `workflowState` is editorial/organizational only.
 * Same pattern whoobe-pages-schema.ts already uses.
 *
 * `attributes` holds every field visible for this object *in this row's
 * locale* (non-localized fields duplicated across every locale row,
 * localized fields genuinely differing) - one full row per locale rather
 * than a shared-plus-override structure, same tradeoff whoobe_pages
 * already made. Kept untyped jsonb: unlike `whoobe_pages.content` (a
 * fixed `Element` tree shape), an object's attribute shape varies per
 * class (`dataClasses.fields`), so there's no single TS interface to type
 * it against - validation against the real shape happens at the
 * `compileDynamicSchema()` boundary (schema/dynamic.ts), not here.
 *
 * `classId` is a plain uuid, not a Drizzle `.references()` FK to
 * `dataClasses.id` - drizzle-kit's own schema loader (unlike this app's
 * real tsx/vite runtime) can't resolve a cross-schema-file `.js`-extension
 * import when generating migrations (confirmed: every existing FK in this
 * codebase's schema files stays within one file, e.g. auth-schema.ts's own
 * `sessions.userId -> users.id` - this table would have been the first
 * cross-file case). Referential integrity is enforced at the records
 * layer instead (data-objects-records.ts callers look up the class first).
 */
export const dataObjects = pgTable(
  'data_objects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    classId: uuid('class_id').notNull(),
    key: text('key').notNull(),
    // Pimcore-style folder path, kept for parity/migration fidelity and
    // for the folder-tree browsing ObjectsView.vue's real UI will want.
    path: text('path').notNull().default('/'),
    parentId: uuid('parent_id').references((): any => dataObjects.id),
    // Links sibling-locale objects together as the "same" logical object -
    // always populated, same role whoobe_pages.translationGroupId plays.
    translationGroupId: uuid('translation_group_id').notNull().defaultRandom(),
    locale: text('locale').notNull().default('en'),
    published: boolean('published').notNull().default(false),
    workflowState: text('workflow_state'),
    attributes: jsonb('attributes').notNull().$type<Record<string, unknown>>(),
    pimcoreId: text('pimcore_id'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // (classId, locale, key), not (classId, key) alone - every locale gets
    // its own full row (§4.4/§4.2), so the same key must be reusable across
    // a translation group's sibling rows. Mirrors whoobe_pages'
    // (locale, slug) over slug-alone for the identical reason - caught by
    // real testing (Phase 1) after the narrower index rejected a
    // legitimate second-locale row for the same object.
    classLocaleKeyIdx: uniqueIndex('data_objects_class_locale_key_idx').on(table.classId, table.locale, table.key),
    // Same invariant whoobe_pages_translation_group_locale_idx already
    // enforces - two rows in the same translation group can't share a
    // locale (that would be two competing "the Italian version" rows).
    translationGroupLocaleIdx: uniqueIndex('data_objects_translation_group_locale_idx').on(
      table.translationGroupId,
      table.locale
    ),
    pimcoreIdIdx: uniqueIndex('data_objects_pimcore_id_idx').on(table.pimcoreId),
  })
);

/**
 * Preview links - docs/plans/backend/object-publish-workflow-plan.md
 * §2.3/§7 Phase 2. A public, unauthenticated, temporary way to view an
 * unpublished (or published) object's real current data without a
 * session - `token` itself is the lookup key (an opaque random string,
 * not a JWT - that plan's own §6 open question leans this way for cheap,
 * trivial revocation: flip `revokedAt`, no denylist to maintain).
 *
 * Deliberately in this same file, not its own - a real FK to
 * `dataObjects.id` (with cascade delete, so a removed object's stale
 * tokens don't linger) only works within one schema file, the same
 * cross-file-FK limitation `dataObjects.classId` above already
 * documents. `createdBy` stays a plain uuid (no FK) for the identical
 * reason - `users` lives in auth-schema.ts, a different file.
 */
export const dataObjectPreviewTokens = pgTable('data_object_preview_tokens', {
  token: text('token').primaryKey(),
  objectId: uuid('object_id')
    .notNull()
    .references(() => dataObjects.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  viewCount: integer('view_count').notNull().default(0),
});
