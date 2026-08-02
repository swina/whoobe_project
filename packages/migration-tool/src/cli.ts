import { upsertDocumentRecord } from '@pimcore-custom/core/server';
import { PimcoreDocumentConverter, PimcoreRawDocument, PimcoreEditableElement } from './pimcore-document-converter.js';
import { createPimcoreSourceAdapter } from './source-adapter.js';
import './adapters/mysql-adapter.js';
import './adapters/fixture-adapter.js';

// Load packages/migration-tool/.env (if present), matching the pattern
// already used by apps/asset-processor/apps/core-api.
try {
  process.loadEnvFile();
} catch {
  // No .env file present - fall back to whatever is already in process.env.
}

interface CliFlags {
  dryRun: boolean;
  source: string;
  limit?: number;
}

function parseFlags(args: string[]): CliFlags {
  const flags: CliFlags = { dryRun: false, source: 'mysql' };
  for (const arg of args) {
    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg.startsWith('--source=')) flags.source = arg.slice('--source='.length);
    else if (arg.startsWith('--limit=')) flags.limit = parseInt(arg.slice('--limit='.length), 10);
  }
  return flags;
}

/**
 * Connection info for the SOURCE (legacy Pimcore) database, deliberately
 * namespaced PIMCORE_DB_* rather than DB_* - the latter is already used
 * elsewhere in this monorepo for the TARGET Whoobe Postgres database, and
 * a migration run needs both configured at once.
 */
function buildMysqlSourceConfigFromEnv(): Record<string, unknown> {
  return {
    host: process.env.PIMCORE_DB_HOST ?? 'localhost',
    port: process.env.PIMCORE_DB_PORT ? parseInt(process.env.PIMCORE_DB_PORT, 10) : 3306,
    user: process.env.PIMCORE_DB_USER ?? 'root',
    password: process.env.PIMCORE_DB_PASSWORD ?? '',
    database: process.env.PIMCORE_DB_NAME ?? 'pimcore',
    // Overrides for installations whose schema deviates from the
    // documented default - see MysqlPimcoreSourceConfig.
    documentsTable: process.env.PIMCORE_DOCUMENTS_TABLE,
    documentsElementsTable: process.env.PIMCORE_DOCUMENTS_ELEMENTS_TABLE,
    assetsTable: process.env.PIMCORE_ASSETS_TABLE,
  };
}

async function migrateDocuments(flags: CliFlags): Promise<void> {
  console.log(`[ETL] Source adapter: "${flags.source}"${flags.dryRun ? ' (dry run - no writes)' : ''}`);

  const config = flags.source === 'mysql' ? buildMysqlSourceConfigFromEnv() : {};
  const adapter = createPimcoreSourceAdapter(flags.source, config);
  await adapter.connect();

  try {
    const documents = await adapter.listDocuments();
    const toProcess = flags.limit ? documents.slice(0, flags.limit) : documents;
    console.log(`[ETL] Found ${documents.length} document(s)${flags.limit ? `, processing first ${toProcess.length}` : ''}.`);

    let succeeded = 0;
    let failed = 0;

    for (const doc of toProcess) {
      try {
        const elements = await adapter.getDocumentElements(doc.id);
        const elementsByName: Record<string, PimcoreEditableElement> = {};
        for (const element of elements) elementsByName[element.name] = element;

        const rawDoc: PimcoreRawDocument = {
          id: doc.id,
          parentId: doc.parentId,
          type: doc.type,
          key: doc.key,
          path: doc.path,
          title: doc.title,
          elements: elementsByName,
        };

        const converted = PimcoreDocumentConverter.convertDocument(rawDoc);

        if (flags.dryRun) {
          console.log(`[dry-run] Document ${doc.id} (${doc.path}) -> ${converted.slug}`);
          console.log(JSON.stringify(converted, null, 2));
        } else {
          await upsertDocumentRecord({
            pimcoreId: String(doc.id),
            title: converted.title,
            slug: converted.slug,
            locale: converted.locale,
            rootBlock: converted.rootBlock,
            metadata: converted.metadata,
          });
          console.log(`[ETL] Migrated document ${doc.id} -> ${converted.slug}`);
        }
        succeeded++;
      } catch (err: any) {
        failed++;
        console.error(`[ETL] Failed to migrate document ${doc.id} (${doc.path}): ${err.message}`);
      }
    }

    console.log(`[ETL] Done. ${succeeded} succeeded, ${failed} failed.`);
  } finally {
    await adapter.disconnect();
  }
}

export function runMigrationCli(args: string[] = process.argv.slice(2)): void {
  console.log('----------------------------------------------------');
  console.log('PIMCORE TO WHOOBE CMS MIGRATION SUITE');
  console.log('----------------------------------------------------');

  const command = args[0] || 'help';
  const flags = parseFlags(args.slice(1));

  switch (command) {
    case 'migrate-documents':
      migrateDocuments(flags).catch((err) => {
        console.error('[ETL] Fatal error:', err);
        process.exitCode = 1;
      });
      break;

    case 'help':
    default:
      console.log('Available Commands:');
      console.log('  migrate-documents  - Import Pimcore Documents (pages/snippets) and their');
      console.log('                       editables/Areablocks into cms_documents.');
      console.log('                       Flags: --dry-run, --source=<mysql|fixture> (default: mysql),');
      console.log('                              --limit=<N>');
      console.log('  migrate-classes    - Translate Pimcore class JSON definitions to Drizzle/Postgres (not yet built)');
      console.log('  migrate-assets     - Upload /web/var/assets to MinIO/S3 object storage (not yet built)');
      console.log('');
      console.log('Source config (for --source=mysql, the default) via env vars or packages/migration-tool/.env:');
      console.log('  PIMCORE_DB_HOST, PIMCORE_DB_PORT, PIMCORE_DB_USER, PIMCORE_DB_PASSWORD, PIMCORE_DB_NAME');
      console.log('  Optional overrides if a specific instance\'s schema differs:');
      console.log('  PIMCORE_DOCUMENTS_TABLE, PIMCORE_DOCUMENTS_ELEMENTS_TABLE, PIMCORE_ASSETS_TABLE');
      break;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrationCli();
}
