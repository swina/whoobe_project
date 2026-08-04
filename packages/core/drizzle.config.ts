import { defineConfig } from 'drizzle-kit';

// Mirrors getConnectionConfig() in src/db/client.ts. Duplicated (not
// imported) because drizzle-kit loads this config file directly, outside
// the app's own module resolution.
function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const host = process.env.DB_HOST ?? 'localhost';
  const port = process.env.DB_PORT ?? '5432';
  const user = process.env.DB_USER ?? 'postgres';
  const password = process.env.DB_PASSWORD ?? 'postgrespassword';
  const database = process.env.DB_NAME ?? process.env.POSTGRES_DB ?? 'pimcore_custom';
  return `postgres://${user}:${password}@${host}:${port}/${database}`;
}

export default defineConfig({
  schema: [
    './src/db/auth-schema.ts',
    './src/db/dam-schema.ts',
    './src/db/cms-schema.ts',
    './src/db/snippet-schema.ts',
    './src/db/whoobe-one-snippet-schema.ts',
    './src/db/whoobe-one-template-schema.ts',
    './src/db/whoobe-one-kit-schema.ts',
  ],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: resolveDatabaseUrl(),
  },
});
