import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ClassFieldDefinition } from '@whoobe-cms/core';
import { createS3ProviderFromEnv, getFileTypeFromFilename } from '@whoobe-cms/core';
import {
  upsertWhoobePageByPimcoreId,
  findPublishedWhoobePageConflict,
  upsertStagedWhoobePageByPimcoreId,
  listStagedWhoobePages,
  getStagedWhoobePage,
  deleteStagedWhoobePage,
  clearStagedWhoobePages,
  upsertDataClassByPimcoreId,
  getDataClassByName,
  upsertDataObjectByPimcoreId,
  getDataObjectByPimcoreId,
  deleteDataObjectsByClassId,
  getAssetByPath,
  upsertAssetRecord,
  createFolderRecord,
  loadRootEnv,
  emitBulkSummary,
} from '@whoobe-cms/core/server';
import { PimcorePageConverter } from './pimcore-page-converter.js';
import { PimcoreRawDocument, PimcoreEditableElement } from './pimcore-document-converter.js';
import { PimcoreAssetSummary } from './source-adapter.js';
import { PimcoreObjectConverter, appendPimcoreSystemFields } from './pimcore-object-converter.js';
import { runExtractCollectionTypes } from './extract-collection-types-to-components.js';
import {
  parsePimcoreClassDefinitionFile,
  parsePimcoreClassMeta,
  parseAllowedTypes,
  parseFieldCollectionTypeFile,
} from './pimcore-class-definition-parser.js';
import { createPimcoreSourceAdapter, pimcoreClassIdOf } from './source-adapter.js';
import './adapters/mysql-adapter.js';
import './adapters/fixture-adapter.js';
import './element-areabrick-mappings/index.js';

// Load the repo-root .env (single source of truth for all apps, see
// docs/plans/environment/env-optimization.md), matching the pattern used
// by apps/asset-processor/apps/core-api.
loadRootEnv();

interface CliFlags {
  dryRun: boolean;
  source: string;
  limit?: number;
  class?: string;
  public?: boolean;
  staging?: boolean;
  clear?: boolean;
  classesDir?: string;
}

function parseFlags(args: string[]): CliFlags {
  const flags: CliFlags = { dryRun: false, source: 'mysql' };
  for (const arg of args) {
    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg.startsWith('--source=')) flags.source = arg.slice('--source='.length);
    else if (arg.startsWith('--limit=')) flags.limit = parseInt(arg.slice('--limit='.length), 10);
    else if (arg.startsWith('--class=')) flags.class = arg.slice('--class='.length);
    else if (arg.startsWith('--classes-dir=')) flags.classesDir = arg.slice('--classes-dir='.length);
    else if (arg === '--public') flags.public = true;
    else if (arg === '--staging') flags.staging = true;
    else if (arg === '--clear') flags.clear = true;
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
    assetsPath: process.env.PIMCORE_VAR_ASSETS_PATH,
  };
}

async function migrateDocuments(flags: CliFlags): Promise<void> {
  const sourceConfig = flags.source === 'mysql' ? buildMysqlSourceConfigFromEnv() : {};
  await runDocumentMigration({ source: flags.source, sourceConfig, dryRun: flags.dryRun, limit: flags.limit, staging: flags.staging });
}

/**
 * The real migrate-documents logic, parameterized the same way
 * runClassMigration/runObjectMigration are - shared by the CLI (below) and
 * apps/core-api's on-demand admin-triggered import (the native-class-
 * authoring plan's §3.4 pattern), which supplies this same config
 * per-request from a stored migration source instead of process.env.
 *
 * `staging` selects WHERE the converted pages land: `false` (default)
 * writes straight into `whoobe_pages` via upsertWhoobePageByPimcoreId; `true`
 * writes into `whoobe_pages_staging` via upsertStagedWhoobePageByPimcoreId -
 * the "migrate to a temporary table, review, then promote" workflow
 * (docs/plans/cms/documents-migration.md §3 Phase 1 / Option B). Both go
 * through the same converter and the same upsert-by-pimcore_id primitive;
 * staging just points that primitive at the staging table, so a promoted
 * page is byte-identical to one migrated directly.
 *
 * Both write paths are protected by the same published-page guard the
 * promote path uses (findPublishedWhoobePageConflict): a converted document
 * whose `pimcore_id` or `slug` path collides with a live, `published: true`
 * page is skipped with a clear failure rather than silently overwriting an
 * editor's published edits. Staging is exempt (it lands in
 * whoobe_pages_staging, never touching whoobe_pages).
 */
export interface RunDocumentMigrationOptions {
  source?: string;
  sourceConfig: Record<string, unknown>;
  dryRun?: boolean;
  limit?: number;
  staging?: boolean;
}

export async function runDocumentMigration(options: RunDocumentMigrationOptions): Promise<MigrationRunResult> {
  const { source = 'mysql', sourceConfig, dryRun = false, limit, staging = false } = options;
  console.log(`[ETL] Source adapter: "${source}"${dryRun ? ' (dry run - no writes)' : ''}${staging ? ' (staging - writes go to whoobe_pages_staging)' : ''}`);

  const adapter = createPimcoreSourceAdapter(source, sourceConfig);
  await adapter.connect();

  try {
    const documents = await adapter.listDocuments();
    const toProcess = limit ? documents.slice(0, limit) : documents;
    console.log(`[ETL] Found ${documents.length} document(s)${limit ? `, processing first ${toProcess.length}` : ''}.`);

    let succeeded = 0;
    const errors: { item: string; message: string }[] = [];

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

        if (dryRun) {
          console.log(`[dry-run] Document ${doc.id} (${doc.path}) -> ${converted.slug}`);
          console.log(JSON.stringify(converted, null, 2));
        } else if (staging) {
          await upsertStagedWhoobePageByPimcoreId({
            pimcoreId: converted.pimcoreId,
            title: converted.title,
            slug: converted.slug,
            locale: converted.locale,
            content: converted.content,
          });
          console.log(`[ETL] Staged document ${doc.id} -> ${converted.slug}`);
        } else {
          // Same published-page guard the promote path uses - a direct
          // migration must never silently clobber a live, published page
          // at the same path / for the same source document either.
          const conflict = await findPublishedWhoobePageConflict(converted.locale, converted.slug, converted.pimcoreId);
          if (conflict) {
            const message = `Skipped - a published page already exists at ${converted.slug} (pimcore ${conflict.pimcoreId ?? 'n/a'}), refusing to overwrite it`;
            errors.push({ item: `${doc.id} (${doc.path})`, message });
            console.error(`[ETL] ${message}`);
            continue;
          }
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
        errors.push({ item: `${doc.id} (${doc.path})`, message: err.message });
        console.error(`[ETL] Failed to migrate document ${doc.id} (${doc.path}): ${err.message}`);
      }
    }

    console.log(`[ETL] Done. ${succeeded} succeeded, ${errors.length} failed.`);
    return { succeeded, failed: errors.length, errors };
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
/**
 * Populates `collectionTypes` on any `fieldcollections` field, by reading
 * its own `allowedTypes` (from the class's definition file, already in
 * hand) and then each allowed type's *own* definition file - a real
 * second read per type, not something derivable from the class file
 * alone (§6, Phase 6). A missing/unreadable type file is logged and
 * skipped, not a fatal error for the whole class - a real install could
 * reference a type whose file was since removed, and the rest of the
 * class's fields are still worth migrating.
 */
function enrichFieldCollectionTypes(fields: ClassFieldDefinition[], classSource: string, classesDir: string): void {
  for (const field of fields) {
    if (field.fieldType === 'fieldcollections') {
      const allowedTypeNames = parseAllowedTypes(classSource, field.name);
      const collectionTypes: NonNullable<ClassFieldDefinition['collectionTypes']> = [];
      for (const typeName of allowedTypeNames) {
        try {
          const typeSource = readFileSync(join(classesDir, 'DataObject', 'Fieldcollection', 'Data', `${typeName}.php`), 'utf-8');
          collectionTypes.push({ name: typeName, label: typeName, fields: parseFieldCollectionTypeFile(typeSource) });
        } catch (err: any) {
          console.error(`[ETL] Could not read Field Collection type "${typeName}" for field "${field.name}": ${err.message}`);
        }
      }
      if (collectionTypes.length > 0) field.collectionTypes = collectionTypes;
    }
    if (field.blockFields) enrichFieldCollectionTypes(field.blockFields, classSource, classesDir);
  }
}

export interface MigrationRunResult {
  succeeded: number;
  failed: number;
  errors: { item: string; message: string }[];
}

export interface RunClassMigrationOptions {
  classesDir: string;
  dryRun?: boolean;
  className?: string;
  /** The user's own choice of fields per class (by class name, from `previewClassMigration`: fields left out, types changed): used instead of
   *  the parsed ones for that class. The Pimcore system dates are still added. */
  overrides?: Record<string, ClassFieldDefinition[]>;
}

export interface ClassMigrationPreview {
  file: string;
  /** The class id in the source (a number or text) and its name. */
  pimcoreId: string;
  name: string;
  /** What would be imported (without the Pimcore system dates, which are always added). */
  fields: ClassFieldDefinition[];
  /** Set when the file could not be read: the reason. */
  error?: string;
}

/** The class a `definition_*.php` file describes: its id/name and its fields (collection types included). */
function readClassDefinition(classesDir: string, file: string): { meta: { id: string; name: string }; fields: ClassFieldDefinition[] } {
  const source = readFileSync(join(classesDir, file), 'utf-8');
  const meta = parsePimcoreClassMeta(source);
  if (!meta) throw new Error("Could not find the class's own 'id' and 'name' (expected `'id' => ..., 'name' => '...'` near the top of the file): is this a Pimcore class definition_*.php file?");
  const fields = parsePimcoreClassDefinitionFile(source);
  enrichFieldCollectionTypes(fields, source, classesDir);
  return { meta, fields };
}

/** What importing the classes of a folder would make, without writing anything: the screen where the user picks fields and types. */
export function previewClassMigration(options: { classesDir: string; className?: string }): ClassMigrationPreview[] {
  const files = readdirSync(options.classesDir).filter((f) => f.startsWith('definition_') && f.endsWith('.php'));
  const toRead = options.className ? files.filter((f) => f === `definition_${options.className}.php`) : files;
  return toRead.sort().map((file) => {
    try {
      const { meta, fields } = readClassDefinition(options.classesDir, file);
      return { file, pimcoreId: meta.id, name: meta.name, fields };
    } catch (err: any) {
      return { file, pimcoreId: '', name: file.replace(/^definition_|\.php$/g, ''), fields: [], error: err.message };
    }
  });
}

/**
 * The real migrate-classes logic, parameterized rather than reading
 * PIMCORE_VAR_CLASSES_PATH/argv directly - shared by the CLI (below,
 * still env-var-driven, unchanged behavior) and apps/core-api's on-demand
 * admin-triggered import (docs/plans/datamodel/native-class-authoring-
 * plan.md §3.4/Phase 4), which supplies this same config per-request from
 * a stored migration source instead of process.env. Wraps the exact same
 * logic advanced-data-modeling-plan.md's Phase 3 pilot already proved
 * against real data - not reimplemented, just no longer hard-wired to
 * process.env/console-only reporting.
 */
export async function runClassMigration(options: RunClassMigrationOptions): Promise<MigrationRunResult> {
  const { classesDir, dryRun = false, className } = options;
  console.log(`[ETL] Reading class definitions from "${classesDir}"${dryRun ? ' (dry run - no writes)' : ''}`);

  const files = readdirSync(classesDir).filter((f) => f.startsWith('definition_') && f.endsWith('.php'));
  const toProcess = className ? files.filter((f) => f === `definition_${className}.php`) : files;
  console.log(`[ETL] Found ${files.length} class definition file(s)${className ? `, migrating "${className}"` : ''}.`);

  let succeeded = 0;
  const errors: { item: string; message: string }[] = [];

  for (const file of toProcess) {
    try {
      const parsed = readClassDefinition(classesDir, file);
      const meta = parsed.meta;
      const fields = options.overrides?.[meta.name] ? JSON.parse(JSON.stringify(options.overrides[meta.name])) as ClassFieldDefinition[] : parsed.fields;
      appendPimcoreSystemFields(fields);

      if (dryRun) {
        console.log(`[dry-run] Class ${meta.id} (${meta.name}) - ${fields.length} field(s)`);
        console.log(JSON.stringify(fields, null, 2));
      } else {
        await upsertDataClassByPimcoreId({ pimcoreId: meta.id, name: meta.name, label: meta.name, fields });
        console.log(`[ETL] Migrated class ${meta.id} -> ${meta.name} (${fields.length} fields)`);
      }
      succeeded++;
    } catch (err: any) {
      errors.push({ item: file, message: err.message });
      console.error(`[ETL] Failed to migrate class from ${file}: ${err.message}`);
    }
  }

  console.log(`[ETL] Done. ${succeeded} succeeded, ${errors.length} failed.`);
  return { succeeded, failed: errors.length, errors };
}

async function migrateClasses(flags: CliFlags): Promise<void> {
  const classesDir = process.env.PIMCORE_VAR_CLASSES_PATH;
  if (!classesDir) {
    throw new Error(
      'PIMCORE_VAR_CLASSES_PATH is not set - point it at the source Pimcore install\'s var/classes directory (see help).'
    );
  }
  await runClassMigration({ classesDir, dryRun: flags.dryRun, className: flags.class });
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
export interface RunObjectMigrationOptions {
  className: string;
  source?: string;
  sourceConfig: Record<string, unknown>;
  dryRun?: boolean;
  limit?: number;
  clear?: boolean;
  /**
   * When true (default), resolves Pimcore asset paths to DAM asset UUIDs
   * at migration time so asset fields store `{ assetId: "<uuid>" }` instead
   * of `{ assetId: "/path/string" }`. Set false to keep raw path strings.
   */
  resolveAssetUuids?: boolean;
  /** Called before the first object (0 of N) and after each one, whether it worked or failed: N is the number of objects of the run. */
  onProgress?: (processed: number, total: number) => void;
}

/**
 * The real migrate-objects logic, parameterized the same way
 * runClassMigration is above - see that function's own comment. Requires
 * `className` to already have a migrated `data_classes` row (with a real
 * `pimcoreId`) exactly as the CLI path does; that ordering dependency
 * doesn't change just because the trigger is now an HTTP request instead
 * of a shell command.
 */
export async function runObjectMigration(options: RunObjectMigrationOptions): Promise<MigrationRunResult> {
  const { className, source = 'mysql', sourceConfig, dryRun = false, limit, clear } = options;

  const dataClass = await getDataClassByName(className);
  if (!dataClass) throw new Error(`Class "${className}" hasn't been migrated yet - run migrate-classes first.`);
  if (!dataClass.pimcoreId) throw new Error(`Class "${className}" has no pimcoreId - it wasn't migrated from Pimcore.`);

  if (clear && !dryRun) {
    console.log(`[ETL] Clearing existing objects for class "${className}"...`);
    await deleteDataObjectsByClassId(dataClass.id, { actor: { type: 'import' } });
  }

  console.log(`[ETL] Source adapter: "${source}"${dryRun ? ' (dry run - no writes)' : ''}`);
  const adapter = createPimcoreSourceAdapter(source, sourceConfig);
  await adapter.connect();

  try {
    if (!adapter.listObjects || !adapter.getObjectAttributes) {
      throw new Error(`Source adapter "${source}" does not support Data Object migration.`);
    }

    // an old Pimcore's class id is a number, Pimcore 10/11's is text (`CAR`): either one names the object_* tables as it is
    const pimcoreClassId = pimcoreClassIdOf(dataClass.pimcoreId);
    const objects = await adapter.listObjects(pimcoreClassId);
    const toProcess = limit ? objects.slice(0, limit) : objects;
    console.log(`[ETL] Found ${objects.length} "${className}" object(s)${limit ? `, processing first ${toProcess.length}` : ''}.`);

    // One Pimcore object becomes one *row per locale* (§4.4) - `pimcoreId`
    // has to be locale-qualified (`<rawId>:<locale>`) so each locale's row
    // gets its own real upsert-by-pimcoreId key instead of colliding on
    // the same conflict target. A real Phase 4 finding, not designed in
    // from the start: the first pilot run used the bare raw id for every
    // locale, so each object's later locale silently overwrote the
    // earlier one via the same ON CONFLICT target - caught by round-trip
    // testing the migrated data, not by the CLI's own success count
    // (Postgres upserts "succeed" either way).
    const objectPimcoreId = (rawId: number, locale: string) => `${rawId}:${locale}`;

    const resolveRelation = async (targetClassName: string, pimcoreId: string, locale: string): Promise<string | null> => {
      const exact = await getDataObjectByPimcoreId(objectPimcoreId(Number(pimcoreId), locale));
      if (exact) return exact.id;
      // Fall back to the default locale's sibling row if this exact
      // locale hasn't been migrated for the target (e.g. the target class
      // has fewer locales than the referencing one) - a real relation is
      // still more useful than none, and 'en' is this schema's own
      // default locale elsewhere (data-objects-schema.ts).
      const fallback = await getDataObjectByPimcoreId(objectPimcoreId(Number(pimcoreId), 'en'));
      return fallback ? fallback.id : null;
    };

    const migratedIds: string[] = [];
    let succeeded = 0;
    const errors: { item: string; message: string }[] = [];

    // Asset UUID resolver: looks up a Pimcore path in the assets table
    // and returns the DAM UUID if the asset has been migrated.
    const resolveAssetUuid = options.resolveAssetUuids !== false
      ? async (path: string): Promise<string | null> => {
          try {
            const asset = await getAssetByPath(path);
            return asset ? asset.id : null;
          } catch {
            return null;
          }
        }
      : undefined;

    let processed = 0;
    options.onProgress?.(0, toProcess.length);
    for (const obj of toProcess) {
      try {
        const raw = await adapter.getObjectAttributes(pimcoreClassId, obj.id);
        // System audit fields (o_creationDate/o_modificationDate) may not
        // be on this class's stored definition yet (it was migrated
        // before they were always-appended) - always convert them too.
        const fieldsWithSystem = [...dataClass.fields];
        appendPimcoreSystemFields(fieldsWithSystem);
        const converted = await PimcoreObjectConverter.convertObject(raw, fieldsWithSystem, {
          resolveAssetPath: adapter.resolveAssetPath,
          resolveRelation,
          resolveAssetUuid,
        });

        // Every locale row for this one Pimcore object shares one
        // translationGroupId - reuse an already-migrated sibling's group
        // (idempotent re-runs) rather than minting a fresh, disconnected
        // one every time.
        let translationGroupId: string | undefined;
        for (const { locale } of converted) {
          const existing = await getDataObjectByPimcoreId(objectPimcoreId(obj.id, locale));
          if (existing) {
            translationGroupId = existing.translationGroupId;
            break;
          }
        }

        for (const { locale, attributes } of converted) {
          if (dryRun) {
            console.log(`[dry-run] Object ${obj.id} (${obj.key}, ${locale}) -> ${obj.path}${obj.key}`);
            console.log(JSON.stringify(attributes, null, 2));
          } else {
            const created = await upsertDataObjectByPimcoreId({
              pimcoreId: objectPimcoreId(obj.id, locale),
              classId: dataClass.id,
              key: obj.key,
              path: obj.path,
              locale,
              translationGroupId,
              attributes,
              // Pimcore's own real o_creationDate/o_modificationDate
              // (Unix seconds) - always carried through as-is, not
              // stamped "now" at migration time.
              createdAt: new Date(obj.creationDate * 1000),
              updatedAt: new Date(obj.modificationDate * 1000),
            });
            // The first locale processed for a brand-new object mints its
            // own group id (the schema column's own defaultRandom()) -
            // reuse that same one for this object's remaining locales.
            translationGroupId = created.translationGroupId;
            migratedIds.push(created.id);
          }
        }
        if (!dryRun) console.log(`[ETL] Migrated object ${obj.id} -> ${obj.key} (${converted.length} locale row(s))`);
        succeeded++;
      } catch (err: any) {
        errors.push({ item: `${obj.id} (${obj.key})`, message: err.message });
        console.error(`[ETL] Failed to migrate object ${obj.id} (${obj.key}): ${err.message}`);
      }
      options.onProgress?.(++processed, toProcess.length);
    }

    // The upserts send no event of their own: one summary for the whole run.
    if (!dryRun) await emitBulkSummary({ classId: dataClass.id, kind: 'migration', count: migratedIds.length, ids: migratedIds, actor: { type: 'import' } });
    console.log(`[ETL] Done. ${succeeded} succeeded, ${errors.length} failed.`);
    return { succeeded, failed: errors.length, errors };
  } finally {
    await adapter.disconnect();
  }
}

async function migrateObjects(flags: CliFlags): Promise<void> {
  if (!flags.class) throw new Error('--class=<Name> is required (Data Objects migrate one class at a time - see help).');
  const sourceConfig = flags.source === 'mysql' ? buildMysqlSourceConfigFromEnv() : {};
  await runObjectMigration({ className: flags.class, source: flags.source, sourceConfig, dryRun: flags.dryRun, limit: flags.limit });
}

/**
 * migrate-assets - docs/plans/cms/documents-migration.md §3 Phase 1. The
 * single biggest correctness blocker for the real site: documents were
 * migrating but the assets they reference (image/video editables resolve to
 * Pimcore paths like "/communication/Visore_2023.jpg") were not being copied
 * into this system's own S3/DAM, so every such image 404'd at render time.
 *
 * Approach: walk the SAME documents migrate-documents walks (same source
 * adapter, same editables), collect the set of asset paths those documents
 * actually reference (top-level image/video editables AND image/video fields
 * nested inside every areablock brick - the bricks' own mapped/unmapped
 * converters consume the same normalized editables), then for each referenced
 * path: read the real bytes from the source install's filesystem
 * (readAssetFile), upload to S3 via the DAM's own S3 provider, and
 * insert/upsert the `assets` row path-keyed exactly like a normal DAM upload
 * (upsertAssetRecord) - reusing the DAM's conventions, not inventing a second
 * asset store.
 *
 * Deliberately path-filtered rather than uploading the whole source assets
 * table: the goal is "every asset a migrated page needs is available", not a
 * wholesale copy of the source library (which could contain unused uploads).
 */
export interface RunAssetMigrationOptions {
  source?: string;
  sourceConfig: Record<string, unknown>;
  dryRun?: boolean;
  limit?: number;
  /**
   * Whether migrated assets upload as public-read (ACL + assets.is_public).
   * Defaults to false (private, resolved via presigned URLs at render time) -
   * the same default the DAM upload path itself uses. Pass true for folders
   * that must be directly fetchable without auth.
   */
  isPublic?: boolean;
}

/** Recursively collects every image/video path a document's editables reference. */
function collectReferencedAssetPaths(elements: PimcoreEditableElement[], into: Set<string>): void {
  for (const element of elements) {
    if (element.type === 'image' || element.type === 'video') {
      const path = element.data?.path || element.data;
      if (typeof path === 'string' && path) into.add(path);
    } else if (element.type === 'areablock' && Array.isArray(element.data)) {
      for (const brick of element.data) {
        if (brick?.fields) collectReferencedAssetPaths(Object.values(brick.fields), into);
      }
    }
  }
}

function deriveFolderPath(pimcorePath: string): string {
  const idx = pimcorePath.lastIndexOf('/');
  return idx <= 0 ? '/' : pimcorePath.substring(0, idx);
}

/** Best-effort folder-record creation for an asset's full folder chain -
 * folders are only browsable once every ancestor has a `folders` row (see
 * damStore's folder tree, which navigates parentPath -> children), so a
 * nested path like /communication/2023 needs both /communication and
 * /communication/2023 to exist. Duplicates are a no-op. */
async function ensureFolderRecord(folderPath: string): Promise<void> {
  if (!folderPath || folderPath === '/') return;
  const segments = folderPath.split('/').filter(Boolean);
  let current = '';
  for (const segment of segments) {
    current += `/${segment}`;
    const parentIdx = current.lastIndexOf('/');
    const parentPath = parentIdx <= 0 ? '/' : current.substring(0, parentIdx);
    try {
      await createFolderRecord({
        path: current,
        name: segment,
        parentPath,
      });
    } catch {
      // Already exists - fine.
    }
  }
}

export async function runAssetMigration(options: RunAssetMigrationOptions): Promise<MigrationRunResult> {
  const { source = 'mysql', sourceConfig, dryRun = false, limit, isPublic = false } = options;
  console.log(`[ETL] Source adapter: "${source}"${dryRun ? ' (dry run - no writes)' : ''}`);

  const adapter = createPimcoreSourceAdapter(source, sourceConfig);
  await adapter.connect();

  try {
    if (!adapter.listAssets || !adapter.readAssetFile) {
      throw new Error(`Source adapter "${source}" does not support asset migration.`);
    }

    const documents = await adapter.listDocuments();
    const toProcess = limit ? documents.slice(0, limit) : documents;
    console.log(`[ETL] Found ${documents.length} document(s)${limit ? `, collecting references from first ${toProcess.length}` : ''}.`);

    const referencedPaths = new Set<string>();
    for (const doc of toProcess) {
      const elements = await adapter.getDocumentElements(doc.id);
      collectReferencedAssetPaths(elements, referencedPaths);
    }
    console.log(`[ETL] ${referencedPaths.size} unique referenced asset path(s).`);

    const allAssets = await adapter.listAssets();
    const assetByPath = new Map(allAssets.map((asset) => [asset.path, asset]));

    const provider = createS3ProviderFromEnv();
    let succeeded = 0;
    const errors: { item: string; message: string }[] = [];

    for (const path of [...referencedPaths].sort()) {
      const asset = assetByPath.get(path);
      if (!asset) {
        errors.push({ item: path, message: 'Referenced by a document but missing from the source assets table' });
        console.error(`[ETL] Referenced asset "${path}" missing from the source assets table - skipped.`);
        continue;
      }
      try {
        const bytes = await adapter.readAssetFile(asset);
        if (!bytes) {
          errors.push({ item: path, message: 'File bytes not found on the source filesystem' });
          console.error(`[ETL] Could not read file bytes for "${path}" - skipped.`);
          continue;
        }

        if (dryRun) {
          console.log(`[dry-run] Asset ${path} (${bytes.length} bytes, ${asset.mimetype})`);
          succeeded++;
          continue;
        }

        const { fileType } = getFileTypeFromFilename(asset.filename);
        const folderPath = deriveFolderPath(path);
        await ensureFolderRecord(folderPath);
        const upload = await provider.uploadAsset(path, bytes, asset.mimetype, { isPublic });
        await upsertAssetRecord({
          pimcorePath: path,
          filename: asset.filename,
          folderPath,
          sizeBytes: bytes.length,
          mimeType: asset.mimetype,
          fileType,
          s3Key: upload.s3Key,
          isPublic,
        }, { silent: true });   // a migration run is not an event per file
        console.log(`[ETL] Migrated asset ${path} -> ${upload.s3Key}`);
        succeeded++;
      } catch (err: any) {
        errors.push({ item: path, message: err.message });
        console.error(`[ETL] Failed to migrate asset ${path}: ${err.message}`);
      }
    }

    console.log(`[ETL] Done. ${succeeded} succeeded, ${errors.length} failed.`);
    return { succeeded, failed: errors.length, errors };
  } finally {
    await adapter.disconnect();
  }
}

async function migrateAssets(flags: CliFlags): Promise<void> {
  const sourceConfig = flags.source === 'mysql' ? buildMysqlSourceConfigFromEnv() : {};
  await runAssetMigration({ source: flags.source, sourceConfig, dryRun: flags.dryRun, limit: flags.limit, isPublic: flags.public });
}

/**
 * promote-staging - the second half of the staged migration workflow
 * (docs/plans/cms/documents-migration.md §3 Phase 1 / Option B): copies
 * every row from `whoobe_pages_staging` into `whoobe_pages` via the SAME
 * upsertByPimcoreId primitive the direct migration path uses, so a promoted
 * page is byte-identical to one migrated straight in. Idempotent by
 * pimcore_id - re-promoting (or promoting a row already migrated directly)
 * updates in place rather than duplicating.
 *
 * A staged row without a pimcore_id is a real error, not something to
 * silently drop - staging rows are only ever written by migrate-documents
 * --staging, which always sets it.
 */
export interface RunPromoteDocumentsOptions {
  dryRun?: boolean;
  /** Delete staged rows that promoted successfully. Off by default so a
   *  failed batch can be retried without re-staging. */
  clear?: boolean;
}

export async function runPromoteDocuments(options: RunPromoteDocumentsOptions = {}): Promise<MigrationRunResult> {
  const { dryRun = false, clear = false } = options;
  console.log(`[ETL] Promote staged documents${dryRun ? ' (dry run - no writes)' : ''}${clear ? ' (clearing staged rows after promote)' : ''}`);

  const staged = await listStagedWhoobePages();
  console.log(`[ETL] Found ${staged.length} staged page(s).`);

  let succeeded = 0;
  const errors: { item: string; message: string }[] = [];

  for (const row of staged) {
    try {
      if (!row.pimcoreId) {
        throw new Error('Staged page has no pimcoreId - cannot promote a non-migrated row.');
      }
      // Never overwrite a live, published page at the same path / for the
      // same source document - the exact clobber this workflow was built to
      // prevent (an editor's published edits must survive re-imports).
      const conflict = await findPublishedWhoobePageConflict(row.locale, row.slug, row.pimcoreId);
      if (conflict) {
        const message = `Skipped - a published page already exists at ${row.slug} (pimcore ${conflict.pimcoreId ?? 'n/a'}), refusing to overwrite it`;
        errors.push({ item: `${row.pimcoreId ?? row.slug}`, message });
        console.error(`[ETL] ${message}`);
        continue;
      }
      if (dryRun) {
        console.log(`[dry-run] Promote ${row.pimcoreId} (${row.slug})`);
      } else {
        await upsertWhoobePageByPimcoreId({
          pimcoreId: row.pimcoreId,
          title: row.title,
          slug: row.slug,
          locale: row.locale,
          category: row.category,
          content: row.content,
          seo: row.seo,
          sitemap: row.sitemap,
          search: row.search,
          websiteId: row.websiteId,
        });
        if (clear) {
          await deleteStagedWhoobePage(row.id);
        }
        console.log(`[ETL] Promoted ${row.pimcoreId} -> ${row.slug}`);
      }
      succeeded++;
    } catch (err: any) {
      errors.push({ item: `${row.pimcoreId ?? row.slug}`, message: err.message });
      console.error(`[ETL] Failed to promote ${row.pimcoreId ?? row.slug}: ${err.message}`);
    }
  }

  console.log(`[ETL] Done. ${succeeded} succeeded, ${errors.length} failed.`);
  return { succeeded, failed: errors.length, errors };
}

/**
 * promote-staging for a SINGLE staged page - the per-row Promote action in
 * the Pages panel's Staged tab. Same upsert primitive and same
 * never-touch-publish-state guarantee as runPromoteDocuments, but scoped to
 * one staged row by id, so "promote this page" promotes exactly that page
 * and nothing else. A missing row is reported as a failure, not a crash.
 */
export interface RunPromoteDocumentOptions {
  stagedId: string;
  dryRun?: boolean;
  /** Delete the staged row if it promoted successfully. */
  clear?: boolean;
}

export async function runPromoteDocument(options: RunPromoteDocumentOptions): Promise<MigrationRunResult> {
  const { stagedId, dryRun = false, clear = false } = options;
  console.log(`[ETL] Promote staged document ${stagedId}${dryRun ? ' (dry run - no writes)' : ''}${clear ? ' (clearing staged row after promote)' : ''}`);

  const row = await getStagedWhoobePage(stagedId);
  if (!row) {
    const errors = [{ item: stagedId, message: 'Staged page not found' }];
    console.error(`[ETL] Staged page ${stagedId} not found.`);
    return { succeeded: 0, failed: 1, errors };
  }

  try {
    if (!row.pimcoreId) {
      throw new Error('Staged page has no pimcoreId - cannot promote a non-migrated row.');
    }
    // Same published-page guard as runPromoteDocuments - a single-page
    // promote must never clobber a live, published page either.
    const conflict = await findPublishedWhoobePageConflict(row.locale, row.slug, row.pimcoreId);
    if (conflict) {
      const message = `Skipped - a published page already exists at ${row.slug} (pimcore ${conflict.pimcoreId ?? 'n/a'}), refusing to overwrite it`;
      const errors = [{ item: `${row.pimcoreId ?? row.slug}`, message }];
      console.error(`[ETL] ${message}`);
      return { succeeded: 0, failed: 1, errors };
    }
    if (dryRun) {
      console.log(`[dry-run] Promote ${row.pimcoreId} (${row.slug})`);
    } else {
      await upsertWhoobePageByPimcoreId({
        pimcoreId: row.pimcoreId,
        title: row.title,
        slug: row.slug,
        locale: row.locale,
        category: row.category,
        content: row.content,
        seo: row.seo,
        sitemap: row.sitemap,
        search: row.search,
        websiteId: row.websiteId,
      });
      if (clear) {
        await deleteStagedWhoobePage(row.id);
      }
      console.log(`[ETL] Promoted ${row.pimcoreId} -> ${row.slug}`);
    }
    return { succeeded: 1, failed: 0, errors: [] };
  } catch (err: any) {
    const errors = [{ item: `${row.pimcoreId ?? row.slug}`, message: err.message }];
    console.error(`[ETL] Failed to promote ${row.pimcoreId ?? row.slug}: ${err.message}`);
    return { succeeded: 0, failed: 1, errors };
  }
}

async function promoteStaging(flags: CliFlags): Promise<void> {
  await runPromoteDocuments({ dryRun: flags.dryRun, clear: flags.clear });
}

export function runMigrationCli(args: string[] = process.argv.slice(2)): void {
  console.log('----------------------------------------------------');
  console.log('PIMCORE TO WHOOBE MIGRATION SUITE');
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

    case 'migrate-assets':
      migrateAssets(flags).catch((err) => {
        console.error('[ETL] Fatal error:', err);
        process.exitCode = 1;
      });
      break;

    case 'promote-staging':
      promoteStaging(flags).catch((err) => {
        console.error('[ETL] Fatal error:', err);
        process.exitCode = 1;
      });
      break;

    case 'extract-collection-types':
      runExtractCollectionTypes({ dryRun: flags.dryRun, className: flags.class, clear: flags.clear, classesDir: flags.classesDir }).catch((err) => {
        console.error('[extract-collection-types] Fatal error:', err);
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
      console.log('                              --limit=<N>, --staging (land in whoobe_pages_staging');
      console.log('                              instead, for review-then-promote - see promote-staging)');
      console.log('  promote-staging    - Copy every row from whoobe_pages_staging into whoobe_pages');
      console.log('                       (idempotent by pimcore_id), completing the staged migration');
      console.log('                       workflow started by `migrate-documents --staging`.');
      console.log('                       Flags: --dry-run, --clear (delete promoted staging rows)');
      console.log('  migrate-classes    - Translate real Pimcore class definitions (var/classes/*.php,');
      console.log('                       filesystem - not MySQL, see PIMCORE_VAR_CLASSES_PATH) into');
      console.log('                       data_classes.');
      console.log('                       Flags: --dry-run, --class=<Name> (default: every class file)');
      console.log('  migrate-objects    - Import one already-migrated class\'s real object instances into');
      console.log('                       data_objects. Relation fields resolve only against already-');
      console.log('                       migrated targets - migrate reference/lookup classes first.');
      console.log('                       Flags: --dry-run, --source=<mysql|fixture> (default: mysql),');
      console.log('                              --limit=<N>, --class=<Name> (required)');
      console.log('  migrate-assets     - Upload Pimcore assets referenced by migrated documents into');
  console.log('                       this system\'s own S3 bucket + assets table, so migrated');
  console.log('                       pages\' images/videos actually load (documents-migration plan');
  console.log('                       Phase 1 - the site\'s biggest correctness blocker). Walks the same');
  console.log('                       documents migrate-documents walks, uploads only what they');
  console.log('                       reference (not the whole source library).');
console.log('                       Flags: --dry-run, --source=<mysql|fixture> (default: mysql),');
      console.log('                              --limit=<N>, --public (upload as public-read)');
      console.log('  extract-collection-types - Extract embedded collectionTypes from fieldcollections');
      console.log('                       fields into standalone data_components, then convert the');
      console.log('                       class field to use allowedComponentTypes instead.');
      console.log('                       Flags: --dry-run, --class=<Name> (optional, default: all classes)');
      console.log('');
      console.log('Source config (for --source=mysql, the default) via env vars or packages/migration-tool/.env:');
      console.log('  PIMCORE_DB_HOST, PIMCORE_DB_PORT, PIMCORE_DB_USER, PIMCORE_DB_PASSWORD, PIMCORE_DB_NAME');
      console.log('  Optional overrides if a specific instance\'s schema differs:');
      console.log('  PIMCORE_DOCUMENTS_TABLE, PIMCORE_DOCUMENTS_ELEMENTS_TABLE, PIMCORE_ASSETS_TABLE');
  console.log('  PIMCORE_VAR_CLASSES_PATH - filesystem path to the source install\'s var/classes');
  console.log('                             directory (migrate-classes only, no default)');
  console.log('  PIMCORE_VAR_ASSETS_PATH  - filesystem path to the source install\'s asset directory');
  console.log('                             (e.g. .../web/var/assets - migrate-assets only, no default)');
  break;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrationCli();
}

export type { ExtractCollectionTypesOptions } from './extract-collection-types-to-components.js';
