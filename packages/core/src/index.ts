// Browser-safe barrel: no Node built-ins (pg, crypto, etc.) reachable from
// here, since apps/admin-dashboard imports directly from this entry point
// and Vite would otherwise try to bundle them for the browser. Node-only
// auth/DB code lives under the separate './server' entry - see server.ts.
export * from './db/schema.js';
export * from './schema/dynamic.js';
export * from './dam/storage.js';
export * from './dam/visibility-manager.js';
export * from './dam/s3-provider.js';
export * from './dam/thumbnail-generator.js';
export * from './dam/processing-pipeline.js';
export * from './dam/metadata-extractor.js';
export * from './dam/file-type.js';
export * from './cms/block-schema.js';
export * from './cms/data-binding.js';
// Real functions too, not just types - xstate itself is browser-safe, so
// admin-dashboard can compute "which transitions are valid right now" the
// exact same way core-api's own /transition route does, rather than
// duplicating this logic in the UI layer.
export * from './workflow/workflow-engine.js';
