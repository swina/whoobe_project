/// <reference types="vite/client" />

interface ImportMetaEnv {
  // S3/MinIO bucket, endpoint, and credentials are intentionally NOT
  // exposed here: they are owned exclusively by the asset-processor
  // backend's own environment variables and must never be bundled into
  // the browser-shipped SPA. See apps/asset-processor/src/server.ts.
  readonly VITE_ASSET_PROCESSOR_URL?: string
  readonly VITE_CORE_API_URL?: string
  // Full base URL of the whoobe-one editor (no trailing slash); overrides the
  // hostname-based default in utils/editor-urls.ts.
  readonly VITE_WHOOBE_ONE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

import type { BrowserLogger } from '@whoobe-cms/logger/browser'
declare global {
  interface Window {
    __logger: BrowserLogger
  }
}
