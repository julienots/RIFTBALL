#!/usr/bin/env bash
# Builds RIFTBALL for Android.  Usage: scripts/build-android.sh debug|release
#   debug   -> releases/riftball-<ver>-debug.apk
#   release -> releases/riftball-<ver>-release.apk + .aab (signed with android/keystore.properties)
set -euo pipefail
cd "$(dirname "$0")/.."
MODE="${1:-debug}"
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
VER=$(node -p "require('./package.json').version")
npm run build
npx cap sync android
mkdir -p releases
cd android
echo "sdk.dir=$ANDROID_HOME" > local.properties
if [ "$MODE" = "release" ]; then
  if [ ! -f keystore.properties ]; then echo "Missing android/keystore.properties — run scripts/create-keystore.sh"; exit 1; fi
  ./gradlew --no-daemon assembleRelease bundleRelease
  cp app/build/outputs/apk/release/app-release.apk "../releases/riftball-$VER-release.apk"
  cp app/build/outputs/bundle/release/app-release.aab "../releases/riftball-$VER-release.aab"
else
  ./gradlew --no-daemon assembleDebug
  cp app/build/outputs/apk/debug/app-debug.apk "../releases/riftball-$VER-debug.apk"
fi
ls -la ../releases
