#!/bin/bash
# Build the web app with production API URL, then sync to Android
set -e

export VITE_API_URL=https://kassomat-production.up.railway.app

echo "Building web app with VITE_API_URL=$VITE_API_URL ..."
pnpm --filter web build

echo "Syncing to Android ..."
npx cap sync android

echo ""
echo "Done! Open Android Studio: npx cap open android"
echo "Or build APK:  cd android && ./gradlew assembleDebug"
