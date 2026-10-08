import { pgTable, text, integer, boolean, uuid, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Outgoing-mail configuration. One row is the installation's default (`website_id` null); a website may have a row of
// its own and then sends through that one instead (docs/plans/forms/cms-forms.md's Phase 2 had a single global row and
// named this as the follow-up). `provider` is `smtp` (host/port/user/password) or the id of an HTTP mail provider
// (packages/core/mail-providers/*.json: OneSignal ...), whose settings live in `provider_config_encrypted`.
//
// Secrets are encrypted at rest (db/mail-settings-crypto.ts, MAIL_SETTINGS_ENCRYPTION_KEY). `password` is the old
// plaintext column: it is emptied as rows are rewritten and by the startup backfill, and dropped by a later migration
// once every environment has been through it (expand -> backfill -> contract, as with the gateway credentials).
export const mailSettings = pgTable(
  'mail_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    websiteId: uuid('website_id'),
    provider: text('provider').notNull().default('smtp'),
    host: text('host'),
    port: integer('port'),
    secure: boolean('secure').notNull().default(false),
    user: text('user'),
    password: text('password'),
    passwordEncrypted: text('password_encrypted'),
    providerConfigEncrypted: text('provider_config_encrypted'),
    fromAddress: text('from_address'),
    fromName: text('from_name'),
    // When enabled, every outgoing email gets a BCC (blind copy / CCN) to the
    // configured from address - a "keep a copy of everything we send" audit
    // convenience, independent of any template/Form-level bcc.
    bccFromAddress: boolean('bcc_from_address').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // at most one row per website (the default row, website_id null, is kept single by the records layer)
    websiteIdx: uniqueIndex('mail_settings_website_idx').on(table.websiteId).where(sql`${table.websiteId} is not null`),
  })
);
