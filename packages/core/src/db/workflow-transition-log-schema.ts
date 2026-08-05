import { pgTable, text, uuid, timestamp } from 'drizzle-orm/pg-core';

/**
 * Audit trail of who moved what through a workflow and when - docs/plans/
 * backend/object-publish-workflow-plan.md §2.4/§3/§7 Phase 3. No
 * equivalent audit mechanism exists anywhere else in this codebase yet -
 * new infrastructure, not an extension of something existing.
 *
 * `objectId`/`actorId` are plain uuids, not FKs - deliberately, not just
 * the usual cross-schema-file limitation: an audit log should outlive
 * its source row (an object or user being deleted later shouldn't erase
 * the historical record that a transition happened), so even a same-file
 * FK with `onDelete: cascade` would be the wrong behavior here.
 */
export const workflowTransitionLog = pgTable('workflow_transition_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  objectId: uuid('object_id').notNull(),
  fromPlace: text('from_place'),
  toPlace: text('to_place').notNull(),
  transitionName: text('transition_name').notNull(),
  actorId: uuid('actor_id'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  note: text('note'),
});
