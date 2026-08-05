export * from './transformers/class.js';
export * from './pimcore-document-converter.js';
export * from './php-unserialize.js';
export * from './pimcore-serialized-data.js';
export * from './source-adapter.js';
export * from './adapters/mysql-adapter.js';
export * from './adapters/fixture-adapter.js';
export * from './areabrick-mappings/index.js';
// Real migrate-classes/migrate-objects logic, parameterized for reuse
// outside the CLI - docs/plans/datamodel/native-class-authoring-plan.md
// §3.4/Phase 4 (apps/core-api's on-demand admin-triggered import).
export { runClassMigration, runObjectMigration } from './cli.js';
export type { MigrationRunResult, RunClassMigrationOptions, RunObjectMigrationOptions } from './cli.js';
