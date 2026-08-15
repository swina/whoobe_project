import { pgTable, text, jsonb, uuid, timestamp } from 'drizzle-orm/pg-core';

// Reusable outgoing-mail templates (docs/plans/forms/mail-templates.md) -
// a dedicated entity, distinct from whoobe_pages: a mail template is not a
// routable page, so it deliberately carries none of that table's concerns
// (unique slug, translation groups, locale, publish gate, SEO metadata).
//
// `kind` is plain text, not an enum - new kinds (e.g. markdown) can be
// added without a migration. Exactly one of `content`/`body` is populated
// depending on kind: `content` holds the Element tree (same untyped-jsonb
// treatment as whoobe_pages.content, for the same reason - the Element
// type lives in a frontend app, not this backend package) for `html`
// templates, `body` holds plain text for `text` templates.
export const mailTemplates = pgTable('mail_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  description: text('description'),
  // Optional default subject line; supports {namespace.field} tokens in
  // both kinds. A Form's own notify.subject overrides it.
  subject: text('subject'),
  // Optional default recipient; supports {namespace.field} tokens so a
  // template can be addressed dynamically (e.g. {form.email}). A Form's own
  // notify.recipientEmail overrides it.
  to: text('to'),
  // Optional blind-copy recipient (CCN); supports {namespace.field} tokens
  // like `to`. A Form's own notify.bcc overrides it.
  bcc: text('bcc'),
  content: jsonb('content'),
  body: text('body'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
