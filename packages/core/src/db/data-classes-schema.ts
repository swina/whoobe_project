import { pgTable, text, jsonb, uuid, timestamp, integer, uniqueIndex } from 'drizzle-orm/pg-core';
import type { ClassFieldDefinition, ClassViewConfig } from '../schema/dynamic.js';

/**
 * Data Object classes (Pimcore's "Classes" concept) - see docs/plans/
 * datamodel/advanced-data-modeling-plan.md §4.1 for the design this
 * implements (Phase 0, confirmed). One row per class; `fields` holds the
 * same field-list shape `compileDynamicSchema()` (schema/dynamic.ts)
 * already consumes, extended there rather than redefined here - no
 * separate "field" table, matching this plan's own EAV-avoidance instinct
 * (per-class field lists don't need relational querying the way object
 * *instances* do, see data-objects-schema.ts).
 */
export const dataClasses = pgTable(
  'data_classes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull().unique(),
    label: text('label').notNull(),
    fields: jsonb('fields').notNull().$type<ClassFieldDefinition[]>(),
    // Optional per-class CRUD view layout (native-class-authoring-plan.md
    // §3.3) - nullable, absent for every class until an admin explicitly
    // configures one via the Class Builder's "View Layout" section.
    viewConfig: jsonb('view_config').$type<ClassViewConfig | null>(),
    // Provenance for classes migrated from Pimcore (packages/migration-tool's
    // migrate-classes) - nullable, since a class authored from scratch in
    // this CMS has none. Natural key a re-run of that importer upserts
    // against, same role whoobe_pages.pimcoreId already plays.
    pimcoreId: text('pimcore_id'),
    // Days after which the retention job deletes an object of this class (docs/plans/system/data-subject-plan.md); null = keep forever.
    retentionDays: integer('retention_days'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pimcoreIdIdx: uniqueIndex('data_classes_pimcore_id_idx').on(table.pimcoreId),
  })
);
