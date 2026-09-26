/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** localStorage key for the life record. Pre-release builds use the preview key. */
  readonly VITE_LIFE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
