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
    './src/db/whoobe-pages-schema.ts',
    './src/db/data-classes-schema.ts',
    './src/db/data-components-schema.ts',
    './src/db/data-objects-schema.ts',
    './src/db/class-workflow-definitions-schema.ts',
    './src/db/workflow-transition-log-schema.ts',
    './src/db/migration-sources-schema.ts',
    './src/db/websites-schema.ts',
    './src/db/website-paths-schema.ts',
    './src/db/website-templates-schema.ts',
    './src/db/mail-settings-schema.ts',
    './src/db/mail-log-schema.ts',
    './src/db/mail-templates-schema.ts',
    './src/db/ai-settings-schema.ts',
    './src/db/ai-generated-schema.ts',
  ],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: resolveDatabaseUrl(),
  },
});
