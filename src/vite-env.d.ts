/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_ENV_LABEL: string
  readonly VITE_USE_MOCKS: string
  readonly VITE_RELEASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
