import { pgTable, text, jsonb, uuid, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { WorkflowPlace, WorkflowTransitionDefinition } from '../workflow/workflow-engine.js';

/**
 * One workflow definition per class - docs/plans/backend/object-publish-
 * workflow-plan.md §2.4/§3/§7 Phase 3. Absence of a row for a class means
 * that class has no workflow at all, just the plain Draft/Published
 * toggle §2.1 already provides - this table is opt-in, not required.
 *
 * `classId` is a plain uuid, not a Drizzle FK to `data_classes.id` - the
 * same cross-schema-file limitation `data_objects.classId` already
 * documents (data-objects-schema.ts) - drizzle-kit's schema loader can't
 * resolve a cross-file import when generating migrations in this
 * project's setup.
 */
export const classWorkflowDefinitions = pgTable(
  'class_workflow_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    classId: uuid('class_id').notNull(),
    initialPlace: text('initial_place').notNull(),
    places: jsonb('places').notNull().$type<WorkflowPlace[]>(),
    transitions: jsonb('transitions').notNull().$type<WorkflowTransitionDefinition[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    classIdIdx: uniqueIndex('class_workflow_definitions_class_id_idx').on(table.classId),
  })
);
