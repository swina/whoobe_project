import { pgTable, text, integer, boolean, uuid, timestamp } from 'drizzle-orm/pg-core';

// Global outgoing-mail config (docs/plans/forms/cms-forms.md's Phase 2) -
// a single row, not scoped per-website. Per-website config (matching
// websites.settings' own jsonb pattern) is a natural follow-up once a
// page's websiteId is threaded down to the client for other reasons too -
// see that plan doc's own "why global, not per-site" reasoning.
export const mailSettings = pgTable('mail_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  host: text('host').notNull(),
  port: integer('port').notNull(),
  secure: boolean('secure').notNull().default(false),
  user: text('user'),
  password: text('password'),
  fromAddress: text('from_address').notNull(),
  fromName: text('from_name'),
  // When enabled, every outgoing email gets a BCC (blind copy / CCN) to the
  // configured from address - a "keep a copy of everything we send" audit
  // convenience, independent of any template/Form-level bcc.
  bccFromAddress: boolean('bcc_from_address').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
