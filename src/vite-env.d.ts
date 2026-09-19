/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** "3d" makes the immersive experience the default homepage for first-time visitors. */
  readonly VITE_HOME_VIEW?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
