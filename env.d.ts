/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Which shops the app runs on: the real Dianping listings (default) or the nine hand-written demo shops ('demo'). */
  readonly VITE_DATASET?: 'dianping' | 'demo'
}
