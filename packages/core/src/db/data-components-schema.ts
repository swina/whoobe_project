import { pgTable, text, jsonb, uuid, timestamp } from 'drizzle-orm/pg-core';
import type { ClassFieldDefinition } from '../schema/dynamic.js';

/**
 * A Component Type - docs/plans/datamodel/component-fields-plan.md. This
 * plan's own name for Pimcore's "Field Collection" concept (deliberately
 * renamed, §0 of that plan): a named, reusable field-list definition that
 * a `fieldcollections`-type field can reference by name (`ClassField
 * Definition.allowedComponentTypes`) to allow an ordered, repeatable,
 * mixed-type list of structured items - the exact rendering machinery
 * `advanced-data-modeling-plan.md`'s Phase 6 already built for *migrated*
 * Field Collection data (`ClassFieldDefinition.collectionTypes`) via
 * `DataObjectFieldControl.vue`'s own real editor, now reachable from a
 * natively-authored class too.
 *
 * Structurally "a class with no object instances of its own" - same
 * `fields` JSONB shape `data_classes` already uses (data-classes-
 * schema.ts), same EAV-avoidance reasoning (no separate per-field table).
 * No `pimcoreId` column: this table is for natively-authored Components
 * only in v1 - migrated Field Collection types stay denormalized, embedded
 * directly in whichever class-field allows them, exactly as Phase 6 left
 * them (component-fields-plan.md §1/§4's own explicit, stated scope
 * boundary - unifying the two is real, separate future work).
 */
export const dataComponents = pgTable('data_components', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  label: text('label').notNull(),
  fields: jsonb('fields').notNull().$type<ClassFieldDefinition[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
