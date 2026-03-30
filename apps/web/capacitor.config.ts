import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'at.kassomat.pos',
  appName: 'Kassomat',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // For production: API calls go to Railway.
    // VITE_API_URL is baked in at build time via .env.android or the
    // android:build / android:release npm scripts, so the bundled JS
    // already contains the full https://kassomat-production.up.railway.app URL.
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
