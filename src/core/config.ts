/** Build / environment configuration. Values that change per environment live here only. */
const env = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};

export const BuildConfig = {
  appName: 'RIFTBALL',
  studio: 'SuperEssence',
  version: '1.0.7',
  /** Dev builds expose the debug menu and the mock billing store. */
  isDev: !!env.DEV,
  /** Base URL of the authoritative game server (online play). Empty = offline, bots only. Overridable in settings. */
  serverUrl: (env.VITE_SERVER_URL as string) || '',
  defaultServerUrl: (env.VITE_SERVER_URL as string) || '',
  /** Allow the mock store (simulated purchases) — only in dev builds or when explicitly enabled. */
  allowMockStore: !!env.DEV || env.VITE_MOCK_STORE === '1',
  saveKey: 'riftball.save',
};

/** Fixed simulation step (seconds). */
export const SIM_DT = 1 / 60;
