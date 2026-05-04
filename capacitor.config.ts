import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.62a0c63cce0043b78502545142fa925d',
  appName: 'UECC',
  webDir: 'dist',
  server: {
    url: 'https://uecc.lovable.app',
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: true,
  },
};

export default config;
