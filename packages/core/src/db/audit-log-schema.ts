import { pgTable, text, jsonb, uuid, timestamp, index } from 'drizzle-orm/pg-core';

// Audit log of administrative actions (docs/plans/system/audit-log-plan.md). Append only: a trigger (migration 0060) refuses UPDATE and
// TRUNCATE, and DELETE outside the retention job. There are no foreign keys: a row must outlive the user, role or website it is about.

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  /** 'user' | 'api-client' | 'system' */
  actorType: text('actor_type').notNull(),
  actorId: text('actor_id'),
  /** The e-mail (or client name) at that moment, so the row stays readable after the actor is deleted. */
  actorLabel: text('actor_label'),
  ip: text('ip'),
  /** A stable name such as `user.update`, `website.delete`, `setting.update`. */
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  targetLabel: text('target_label'),
  /** Allow-listed fields only, never a secret (audit-log.ts). For an update, only the fields that changed. */
  before: jsonb('before').$type<Record<string, unknown>>(),
  after: jsonb('after').$type<Record<string, unknown>>(),
  requestId: text('request_id'),
}, (t) => ({
  atIdx: index('audit_log_at_idx').on(t.at),
  actorIdx: index('audit_log_actor_idx').on(t.actorId, t.at),
  targetIdx: index('audit_log_target_idx').on(t.targetType, t.targetId, t.at),
  actionIdx: index('audit_log_action_idx').on(t.action, t.at),
}));

export type AuditLogRow = typeof auditLog.$inferSelect;
