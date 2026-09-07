/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FONT_FAMILIES?: string
  readonly VITE_ASSET_PROCESSOR_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
