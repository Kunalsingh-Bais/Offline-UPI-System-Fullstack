import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.offlineupi',
  appName: 'Offline UPI',
  webDir: 'dist/Fronted/browser',

  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  }
};

export default config;
