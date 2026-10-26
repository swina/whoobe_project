import { pgTable, integer, boolean, uuid, timestamp } from 'drizzle-orm/pg-core';

// Who must use a second factor and the minimum password policy (docs/plans/system/mandatory-2fa-plan.md). One row, id = 1
// (a CHECK keeps it so); no row means the defaults in security-settings-records.ts.
export const securitySettings = pgTable('security_settings', {
  id: integer('id').primaryKey().default(1),
  requireMfaRoleIds: uuid('require_mfa_role_ids').array().notNull().default([]),
  passwordMinLength: integer('password_min_length').notNull().default(8),
  passwordRequireClasses: boolean('password_require_classes').notNull().default(false),
  /** days after which a row of the mail log is deleted; null = keep */
  mailLogRetentionDays: integer('mail_log_retention_days'),
  /** token usage of the AI functions recorded per user (ai_usage); off until an administrator turns it on */
  aiUsageTracking: boolean('ai_usage_tracking').notNull().default(false),
  /** days after which a row of ai_usage is deleted (the monthly totals stay); null = keep */
  aiUsageRetentionDays: integer('ai_usage_retention_days').default(90),
  /** days after which a row of whoobe_ai_generated (prompts and answers) is deleted; null = keep */
  aiGeneratedRetentionDays: integer('ai_generated_retention_days'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
