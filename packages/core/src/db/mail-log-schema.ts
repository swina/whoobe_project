import { pgTable, text, uuid, timestamp } from 'drizzle-orm/pg-core';

// Durable audit trail of every outgoing email sendMail() attempts -
// successes and failures alike - so admins can review delivery from
// Settings → Mail → Log. `html`/`text` keep the sent body so an admin can
// preview what actually went out and resend it verbatim. Not a typed enum
// on purpose: `status` is plain text so new states can be added without a
// migration.
export const mailLog = pgTable('mail_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  to: text('to').notNull(),
  from: text('from'),
  cc: text('cc'),
  subject: text('subject').notNull(),
  html: text('html'),
  text: text('text'),
  status: text('status').notNull(),
  error: text('error'),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
});
