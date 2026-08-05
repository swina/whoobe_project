import { pgTable, text, integer, uuid, timestamp } from 'drizzle-orm/pg-core';

/**
 * A configured source Pimcore install to import from - docs/plans/
 * datamodel/native-class-authoring-plan.md §3.4/Phase 4. Lets an admin
 * trigger `migrate-classes`/`migrate-objects` on demand from the Class
 * Builder instead of requiring shell/DB/filesystem access to run the CLI
 * directly (packages/migration-tool/src/cli.ts, unchanged - this table
 * only supplies that same tool's connection config per-request instead of
 * process.env).
 *
 * `dbPasswordEncrypted` is AES-256-GCM ciphertext (migration-sources-
 * crypto.ts), never the plain password - a real, deliberate departure
 * from this codebase's own `users.totpSecret` precedent (plain `text`,
 * auth-schema.ts), justified in that crypto module's own comment: this
 * secret's blast radius (read access to an entire external database) is
 * materially larger. Records-layer functions (migration-sources-
 * records.ts) never return this column to a caller outside this file.
 *
 * `classesPath` is a filesystem path (Pimcore's `var/classes/` directory)
 * that `core-api`'s own process must be able to read at request time - an
 * operational constraint (the two must share a filesystem or mount), not
 * something encryption or this schema can solve; stated here rather than
 * assumed away.
 */
export const migrationSources = pgTable('migration_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  label: text('label').notNull(),
  dbHost: text('db_host').notNull(),
  dbPort: integer('db_port').notNull().default(3306),
  dbUser: text('db_user').notNull(),
  dbPasswordEncrypted: text('db_password_encrypted').notNull(),
  dbName: text('db_name').notNull(),
  classesPath: text('classes_path').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
