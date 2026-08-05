import { eq } from 'drizzle-orm';
import { getDb } from './client.js';
import { migrationSources } from './migration-sources-schema.js';
import { encryptMigrationSourceSecret, decryptMigrationSourceSecret } from './migration-sources-crypto.js';

// Never carries the password, encrypted or otherwise - the shape every
// caller outside this file gets (core-api's list/get routes, the Class
// Builder UI). See migration-sources-schema.ts's own comment on why this
// secret is treated more carefully than users.totpSecret.
export interface MigrationSourceRecord {
  id: string;
  label: string;
  dbHost: string;
  dbPort: number;
  dbUser: string;
  dbName: string;
  classesPath: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MigrationSourceConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

function toRecord(row: typeof migrationSources.$inferSelect): MigrationSourceRecord {
  const { dbPasswordEncrypted: _dbPasswordEncrypted, ...record } = row;
  return record;
}

export async function listMigrationSources(): Promise<MigrationSourceRecord[]> {
  const db = getDb();
  const rows = await db.select().from(migrationSources).orderBy(migrationSources.label);
  return rows.map(toRecord);
}

export async function getMigrationSource(id: string): Promise<MigrationSourceRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(migrationSources).where(eq(migrationSources.id, id)).limit(1);
  return row ? toRecord(row) : null;
}

/** Internal use only (apps/core-api's import routes) - decrypts the
 * stored password to build a real DB connection config. Never exposed
 * over an HTTP response. */
export async function getMigrationSourceConnectionConfig(
  id: string
): Promise<{ record: MigrationSourceRecord; connection: MigrationSourceConnectionConfig } | null> {
  const db = getDb();
  const [row] = await db.select().from(migrationSources).where(eq(migrationSources.id, id)).limit(1);
  if (!row) return null;
  return {
    record: toRecord(row),
    connection: {
      host: row.dbHost,
      port: row.dbPort,
      user: row.dbUser,
      password: decryptMigrationSourceSecret(row.dbPasswordEncrypted),
      database: row.dbName,
    },
  };
}

export async function createMigrationSource(input: {
  label: string;
  dbHost: string;
  dbPort: number;
  dbUser: string;
  dbPassword: string;
  dbName: string;
  classesPath: string;
}): Promise<MigrationSourceRecord> {
  const db = getDb();
  const [row] = await db
    .insert(migrationSources)
    .values({
      label: input.label,
      dbHost: input.dbHost,
      dbPort: input.dbPort,
      dbUser: input.dbUser,
      dbPasswordEncrypted: encryptMigrationSourceSecret(input.dbPassword),
      dbName: input.dbName,
      classesPath: input.classesPath,
    })
    .returning();
  return toRecord(row);
}

export async function updateMigrationSource(
  id: string,
  input: {
    label?: string;
    dbHost?: string;
    dbPort?: number;
    dbUser?: string;
    /** Omitted (not empty string) to keep the currently-stored password -
     * an admin editing label/host shouldn't have to re-type a working
     * password just to save. */
    dbPassword?: string;
    dbName?: string;
    classesPath?: string;
  }
): Promise<MigrationSourceRecord | null> {
  const db = getDb();

  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (input.label !== undefined) values.label = input.label;
  if (input.dbHost !== undefined) values.dbHost = input.dbHost;
  if (input.dbPort !== undefined) values.dbPort = input.dbPort;
  if (input.dbUser !== undefined) values.dbUser = input.dbUser;
  if (input.dbPassword !== undefined) values.dbPasswordEncrypted = encryptMigrationSourceSecret(input.dbPassword);
  if (input.dbName !== undefined) values.dbName = input.dbName;
  if (input.classesPath !== undefined) values.classesPath = input.classesPath;

  const [row] = await db.update(migrationSources).set(values).where(eq(migrationSources.id, id)).returning();
  return row ? toRecord(row) : null;
}

export async function deleteMigrationSource(id: string): Promise<void> {
  const db = getDb();
  await db.delete(migrationSources).where(eq(migrationSources.id, id));
}
