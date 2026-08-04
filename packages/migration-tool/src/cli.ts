import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  upsertWhoobePageByPimcoreId,
  upsertDataClassByPimcoreId,
  getDataClassByName,
  upsertDataObjectByPimcoreId,
  getDataObjectByPimcoreId,
} from '@pimcore-custom/core/server';
import { PimcorePageConverter } from './pimcore-page-converter.js';
import { PimcoreRawDocument, PimcoreEditableElement } from './pimcore-document-converter.js';
import { PimcoreObjectConverter } from './pimcore-object-converter.js';
import { parsePimcoreClassDefinitionFile, parsePimcoreClassMeta } from './pimcore-class-definition-parser.js';
import { createPimcoreSourceAdapter } from './source-adapter.js';
import './adapters/mysql-adapter.js';
import './adapters/fixture-adapter.js';
import './element-areabrick-mappings/index.js';

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
  class?: string;
}

function parseFlags(args: string[]): CliFlags {
  const flags: CliFlags = { dryRun: false, source: 'mysql' };
  for (const arg of args) {
    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg.startsWith('--source=')) flags.source = arg.slice('--source='.length);
    else if (arg.startsWith('--limit=')) flags.limit = parseInt(arg.slice('--limit='.length), 10);
    else if (arg.startsWith('--class=')) flags.class = arg.slice('--class='.length);
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

        const converted = PimcorePageConverter.convertDocument(rawDoc);

        if (flags.dryRun) {
          console.log(`[dry-run] Document ${doc.id} (${doc.path}) -> ${converted.slug}`);
          console.log(JSON.stringify(converted, null, 2));
        } else {
          await upsertWhoobePageByPimcoreId({
            pimcoreId: converted.pimcoreId,
            title: converted.title,
            slug: converted.slug,
            locale: converted.locale,
            content: converted.content,
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

/**
 * Class field definitions - see docs/plans/datamodel/advanced-data-
 * modeling-plan.md §5.1/§8 Phase 3. Not a `PimcoreSourceAdapter` (that
 * interface is DB-only) - Pimcore stores class definitions as PHP files
 * on disk, not in MySQL (confirmed against a live install, §3.1 of that
 * plan), so this reads directly from a filesystem path instead.
 */
async function migrateClasses(flags: CliFlags): Promise<void> {
  const classesDir = process.env.PIMCORE_VAR_CLASSES_PATH;
  if (!classesDir) {
    throw new Error(
      'PIMCORE_VAR_CLASSES_PATH is not set - point it at the source Pimcore install\'s var/classes directory (see help).'
    );
  }
  console.log(`[ETL] Reading class definitions from "${classesDir}"${flags.dryRun ? ' (dry run - no writes)' : ''}`);

  const files = readdirSync(classesDir).filter((f) => f.startsWith('definition_') && f.endsWith('.php'));
  const toProcess = flags.class ? files.filter((f) => f === `definition_${flags.class}.php`) : files;
  console.log(`[ETL] Found ${files.length} class definition file(s)${flags.class ? `, migrating "${flags.class}"` : ''}.`);

  let succeeded = 0;
  let failed = 0;

  for (const file of toProcess) {
    try {
      const source = readFileSync(join(classesDir, file), 'utf-8');
      const meta = parsePimcoreClassMeta(source);
      if (!meta) throw new Error('Could not find the class\'s own id/name near the top of the file');
      const fields = parsePimcoreClassDefinitionFile(source);

      if (flags.dryRun) {
        console.log(`[dry-run] Class ${meta.id} (${meta.name}) - ${fields.length} field(s)`);
        console.log(JSON.stringify(fields, null, 2));
      } else {
        await upsertDataClassByPimcoreId({ pimcoreId: meta.id, name: meta.name, label: meta.name, fields });
        console.log(`[ETL] Migrated class ${meta.id} -> ${meta.name} (${fields.length} fields)`);
      }
      succeeded++;
    } catch (err: any) {
      failed++;
      console.error(`[ETL] Failed to migrate class from ${file}: ${err.message}`);
    }
  }

  console.log(`[ETL] Done. ${succeeded} succeeded, ${failed} failed.`);
}

/**
 * Object instances of one already-migrated class - see the plan's §5.2/
 * §8 Phase 3. Requires `migrate-classes` to have already run for
 * `--class` (this reads that class's real field list back out of
 * `data_classes`, not from the source files again) - relation fields
 * pointing at *other* classes resolve only if those classes' own objects
 * were migrated first (a real, stated ordering dependency, not silently
 * assumed away - see the plan's §9).
 */
async function migrateObjects(flags: CliFlags): Promise<void> {
  if (!flags.class) throw new Error('--class=<Name> is required (Data Objects migrate one class at a time - see help).');

  const dataClass = await getDataClassByName(flags.class);
  if (!dataClass) throw new Error(`Class "${flags.class}" hasn't been migrated yet - run migrate-classes first.`);
  if (!dataClass.pimcoreId) throw new Error(`Class "${flags.class}" has no pimcoreId - it wasn't migrated from Pimcore.`);

  console.log(`[ETL] Source adapter: "${flags.source}"${flags.dryRun ? ' (dry run - no writes)' : ''}`);
  const config = flags.source === 'mysql' ? buildMysqlSourceConfigFromEnv() : {};
  const adapter = createPimcoreSourceAdapter(flags.source, config);
  await adapter.connect();

  try {
    if (!adapter.listObjects || !adapter.getObjectAttributes) {
      throw new Error(`Source adapter "${flags.source}" does not support Data Object migration.`);
    }

    const pimcoreClassId = Number(dataClass.pimcoreId);
    const objects = await adapter.listObjects(pimcoreClassId);
    const toProcess = flags.limit ? objects.slice(0, flags.limit) : objects;
    console.log(`[ETL] Found ${objects.length} "${flags.class}" object(s)${flags.limit ? `, processing first ${toProcess.length}` : ''}.`);

    const resolveRelation = async (targetClassName: string, pimcoreId: string): Promise<string | null> => {
      const target = await getDataObjectByPimcoreId(pimcoreId);
      return target ? target.id : null;
    };

    let succeeded = 0;
    let failed = 0;

    for (const obj of toProcess) {
      try {
        const raw = await adapter.getObjectAttributes(pimcoreClassId, obj.id);
        const converted = await PimcoreObjectConverter.convertObject(raw, dataClass.fields, {
          resolveAssetPath: adapter.resolveAssetPath,
          resolveRelation,
        });

        for (const { locale, attributes } of converted) {
          if (flags.dryRun) {
            console.log(`[dry-run] Object ${obj.id} (${obj.key}, ${locale}) -> ${obj.path}${obj.key}`);
            console.log(JSON.stringify(attributes, null, 2));
          } else {
            await upsertDataObjectByPimcoreId({
              pimcoreId: `${obj.id}`,
              classId: dataClass.id,
              key: obj.key,
              path: obj.path,
              locale,
              attributes,
            });
          }
        }
        if (!flags.dryRun) console.log(`[ETL] Migrated object ${obj.id} -> ${obj.key} (${converted.length} locale row(s))`);
        succeeded++;
      } catch (err: any) {
        failed++;
        console.error(`[ETL] Failed to migrate object ${obj.id} (${obj.key}): ${err.message}`);
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

    case 'migrate-classes':
      migrateClasses(flags).catch((err) => {
        console.error('[ETL] Fatal error:', err);
        process.exitCode = 1;
      });
      break;

    case 'migrate-objects':
      migrateObjects(flags).catch((err) => {
        console.error('[ETL] Fatal error:', err);
        process.exitCode = 1;
      });
      break;

    case 'help':
    default:
      console.log('Available Commands:');
      console.log('  migrate-documents  - Import Pimcore Documents (pages/snippets) and their');
      console.log('                       editables/Areablocks into whoobe_pages, ready to open');
      console.log('                       and edit directly in whoobe-one-spike.');
      console.log('                       Flags: --dry-run, --source=<mysql|fixture> (default: mysql),');
      console.log('                              --limit=<N>');
      console.log('  migrate-classes    - Translate real Pimcore class definitions (var/classes/*.php,');
      console.log('                       filesystem - not MySQL, see PIMCORE_VAR_CLASSES_PATH) into');
      console.log('                       data_classes.');
      console.log('                       Flags: --dry-run, --class=<Name> (default: every class file)');
      console.log('  migrate-objects    - Import one already-migrated class\'s real object instances into');
      console.log('                       data_objects. Relation fields resolve only against already-');
      console.log('                       migrated targets - migrate reference/lookup classes first.');
      console.log('                       Flags: --dry-run, --source=<mysql|fixture> (default: mysql),');
      console.log('                              --limit=<N>, --class=<Name> (required)');
      console.log('  migrate-assets     - Upload /web/var/assets to MinIO/S3 object storage (not yet built)');
      console.log('');
      console.log('Source config (for --source=mysql, the default) via env vars or packages/migration-tool/.env:');
      console.log('  PIMCORE_DB_HOST, PIMCORE_DB_PORT, PIMCORE_DB_USER, PIMCORE_DB_PASSWORD, PIMCORE_DB_NAME');
      console.log('  Optional overrides if a specific instance\'s schema differs:');
      console.log('  PIMCORE_DOCUMENTS_TABLE, PIMCORE_DOCUMENTS_ELEMENTS_TABLE, PIMCORE_ASSETS_TABLE');
      console.log('  PIMCORE_VAR_CLASSES_PATH - filesystem path to the source install\'s var/classes');
      console.log('                             directory (migrate-classes only, no default)');
      break;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrationCli();
}
