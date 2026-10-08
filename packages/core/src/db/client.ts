import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as authSchema from './auth-schema.js';
import * as damSchema from './dam-schema.js';

const schema = { ...authSchema, ...damSchema };

export type Database = NodePgDatabase<typeof schema>;

export interface ConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  /** TLS to the database; absent = plain connection (the default inside a workspace's private Docker network). */
  ssl?: { rejectUnauthorized: boolean; ca?: string };
}

/**
 * TLS settings for the database connection, from DB_SSL (or `sslmode` in DATABASE_URL):
 *   disable (default) | require | verify-full
 * `require` encrypts and does not check the server's certificate (what libpq's `require` does); `verify-full` also checks the
 * certificate chain and the host name - use it with a managed Postgres and its CA in DB_SSL_CA (a file path or the PEM text).
 * `verify-ca` is treated as `verify-full`: node-postgres checks the host name as well, which is stricter, never weaker.
 */
export function resolveSslConfig(env: NodeJS.ProcessEnv = process.env, urlSslMode?: string | null): ConnectionConfig['ssl'] {
  const raw = (env.DB_SSL ?? urlSslMode ?? 'disable').trim().toLowerCase();
  if (['', 'disable', 'false', '0', 'off', 'allow', 'prefer'].includes(raw)) return undefined;
  if (!['require', 'verify-ca', 'verify-full', 'true', '1', 'on'].includes(raw)) {
    throw new Error(`DB_SSL "${raw}" is not valid: use disable, require or verify-full`);
  }
  const verify = raw === 'verify-ca' || raw === 'verify-full';
  const caRaw = env.DB_SSL_CA?.trim();
  let ca: string | undefined;
  if (caRaw) ca = caRaw.includes('BEGIN CERTIFICATE') ? caRaw : readFileSync(caRaw, 'utf8');
  return { rejectUnauthorized: verify, ...(ca ? { ca } : {}) };
}

/**
 * Resolves connection settings from individual DB_* env vars, so the
 * database name (and everything else) is a plain, discoverable env var
 * rather than buried inside a single connection-string value. DATABASE_URL
 * is still honored as a full override for deployments that need one.
 */
export function getConnectionConfig(): ConnectionConfig {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    return {
      host: url.hostname,
      port: url.port ? parseInt(url.port, 10) : 5432,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ''),
      ssl: resolveSslConfig(process.env, url.searchParams.get('sslmode')),
    };
  }

  return {
    host: process.env.DB_HOST ?? 'localhost',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgrespassword',
    database: process.env.DB_NAME ?? process.env.POSTGRES_DB ?? 'whoobe_db',
    ssl: resolveSslConfig(),
  };
}

let pool: Pool | undefined;
let db: Database | undefined;

/**
 * Lazily creates a single shared Postgres pool + Drizzle instance. Shared
 * deliberately: both apps/core-api and apps/asset-processor read/validate
 * sessions against the same tables (see
 * docs/plans/backend/auth-permissions-plan.md §4) without needing to proxy
 * through one another.
 */
export function getDb(): Database {
  if (!db) {
    pool = new Pool(getConnectionConfig());
    db = drizzle(pool, { schema });
  }
  return db;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
    db = undefined;
  }
}
