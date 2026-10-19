import { pgTable, text, uuid, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { websites } from './websites-schema.js';

// Where an asset is mirrored to, per website with the installation's default as the fallback (docs/plans/assets/cdn-providers-plan.md).
// `website_id` null = the default. `config` is what is not secret; `secrets_encrypted` the credentials (db/cdn-mirror-records.ts).
export const cdnMirrorSettings = pgTable('cdn_mirror_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  websiteId: uuid('website_id').references(() => websites.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull().default('cloudinary'),
  config: jsonb('config').$type<Record<string, string>>().notNull().default({}),
  secretsEncrypted: text('secrets_encrypted'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
