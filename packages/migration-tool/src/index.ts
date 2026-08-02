export * from './extractors/mysql.js';
export * from './transformers/class.js';
export * from './pimcore-document-converter.js';

export function runMigrationPipeline(): void {
  console.log('[Migration Tool] Initialized Pimcore ETL migration pipeline.');
}
