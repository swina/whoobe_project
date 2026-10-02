import { Client } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getConnectionConfig, getDb } from './client.js';
import { seedDefaults, seedWhoobeOneKits, seedDefaultWebsite } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Compiled location is dist/db/bootstrap.js -> packages/core/drizzle.
const MIGRATIONS_FOLDER = path.join(__dirname, '../../drizzle');

const VALID_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Creates the target database if it doesn't exist yet, by connecting to
 * Postgres's always-present "postgres" maintenance database first. Needed
 * because the app's own pooled connection (getDb()) targets the database
 * we're trying to create, so it can't be used for this check.
 */
export async function ensureDatabaseExists(): Promise<void> {
  const { host, port, user, password, database } = getConnectionConfig();

  if (!VALID_IDENTIFIER.test(database)) {
    throw new Error(`Invalid database name: "${database}" (expected a plain identifier, e.g. "pimcore_custom")`);
  }

  const adminClient = new Client({ host, port, user, password, database: 'postgres' });
  await adminClient.connect();
  try {
    const { rows } = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (rows.length === 0) {
      // Database identifiers can't be parameterized; the regex check above
      // is what makes this string-interpolation safe.
      await adminClient.query(`CREATE DATABASE "${database}"`);
      console.log(`Created database "${database}"`);
    }
  } finally {
    await adminClient.end();
  }
}

export async function runMigrations(): Promise<void> {
  const db = getDb();
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

/**
 * Full on-the-fly bootstrap for a fresh environment: create the database if
 * missing, apply any pending migrations, then seed default roles/
 * permissions/admin user (all idempotent - safe to call on every boot).
 */
export async function bootstrapDatabase(): Promise<void> {
  await ensureDatabaseExists();
  await runMigrations();
  await seedDefaults();
  await seedWhoobeOneKits();
  await seedDefaultWebsite();
  // Encrypt MFA secrets that predate TOTP_ENCRYPTION_KEY (no-op without the key, idempotent).
  try {
    const { backfillTotpEncryption } = await import('./scripts/backfill-totp-encryption.js');
    const r = await backfillTotpEncryption();
    if (r.encrypted > 0) console.log(`Encrypted ${r.encrypted} MFA secret(s) at rest.`);
  } catch (err) {
    console.error('MFA secret encryption backfill failed:', err);
  }
}
