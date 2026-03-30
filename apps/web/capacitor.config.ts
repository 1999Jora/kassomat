import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'at.kassomat.pos',
  appName: 'Kassomat',
  webDir: 'dist',
  server: {
    // Live-Update: App lädt UI direkt von Vercel.
    // Frontend-Änderungen kommen sofort ohne APK-Rebuild.
    // Nur native Änderungen (Bluetooth, Push) brauchen neuen Build.
    url: 'https://kassomat-pos.vercel.app',
    androidScheme: 'https',
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#080a0c',
    },
    Keyboard: {
      resize: 'body',
      style: 'DARK',
    },
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#080a0c',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
  },
  android: {
    minSdkVersion: 26,
    targetSdkVersion: 34,
  },
};

export default config;
