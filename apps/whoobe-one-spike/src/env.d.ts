/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FONT_FAMILIES?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
