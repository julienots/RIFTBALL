import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.superessence.riftball',
  appName: 'RIFTBALL',
  webDir: 'dist',
  backgroundColor: '#000000',
  server: { androidScheme: 'https', cleartext: true },
  android: {
    backgroundColor: '#000000',
    // allows ws:// / http:// game servers on a local network for testing (production should use wss://)
    allowMixedContent: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
