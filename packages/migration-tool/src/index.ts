export * from './transformers/class.js';
export * from './pimcore-document-converter.js';
export * from './php-unserialize.js';
export * from './pimcore-serialized-data.js';
export * from './source-adapter.js';
export * from './adapters/mysql-adapter.js';
export * from './adapters/fixture-adapter.js';
export * from './areabrick-mappings/index.js';
// Real migrate-classes/migrate-objects/migrate-assets/migrate-documents
// logic, parameterized for reuse outside the CLI - docs/plans/datamodel/
// native-class-authoring-plan.md §3.4/Phase 4 (apps/core-api's on-demand
// admin-triggered import).
export {
  runClassMigration,
  previewClassMigration,
  runObjectMigration,
  runAssetMigration,
  runDocumentMigration,
  runPromoteDocuments,
  runPromoteDocument,
} from './cli.js';
export { createMigrationJobRegistry } from './import-jobs.js';
export type { MigrationJob, MigrationJobResult } from './import-jobs.js';
export { runExtractCollectionTypes } from './extract-collection-types-to-components.js';
export type {
  MigrationRunResult,
  RunClassMigrationOptions,
  ClassMigrationPreview,
  RunObjectMigrationOptions,
  RunAssetMigrationOptions,
  RunDocumentMigrationOptions,
  RunPromoteDocumentsOptions,
  RunPromoteDocumentOptions,
  ExtractCollectionTypesOptions,
} from './cli.js';
