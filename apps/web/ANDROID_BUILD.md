# Android APK Build Guide

## Prerequisites
- Android Studio (latest)
- Java 17+
- Node.js 20+

## First-time setup
```bash
# From monorepo root
pnpm install

# From apps/web
cd apps/web
pnpm cap:sync
pnpm cap:open   # Opens Android Studio
```

## Build Debug APK
```bash
cd apps/web/android
./gradlew assembleDebug
# APK at: android/app/build/outputs/apk/debug/app-debug.apk
```

## Build Release APK
1. Create keystore: `keytool -genkey -v -keystore kassomat.keystore -alias kassomat -keyalg RSA -keysize 2048 -validity 10000`
2. In Android Studio: Build → Generate Signed Bundle/APK
3. APK at: `android/app/build/outputs/apk/release/`

## Tablet-optimized settings
- Lock to landscape: add `android:screenOrientation="landscape"` to MainActivity in AndroidManifest.xml
- Keep screen on: add `android:keepScreenOn="true"` to the activity

## After code changes
```bash
pnpm cap:sync  # rebuilds web + syncs to android
```
