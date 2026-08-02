/// <reference types="vite/client" />

interface ImportMetaEnv {
  // S3/MinIO bucket, endpoint, and credentials are intentionally NOT
  // exposed here: they are owned exclusively by the asset-processor
  // backend's own environment variables and must never be bundled into
  // the browser-shipped SPA. See apps/asset-processor/src/server.ts.
  readonly VITE_ASSET_PROCESSOR_URL?: string
  readonly VITE_CORE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
