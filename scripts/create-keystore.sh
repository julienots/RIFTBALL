#!/usr/bin/env bash
# Creates an upload keystore for Google Play (keep it safe & out of git!).
set -euo pipefail
cd "$(dirname "$0")/../android"
mkdir -p keystore
PASS="${KEYSTORE_PASSWORD:-$(openssl rand -hex 16)}"
keytool -genkeypair -v -keystore keystore/riftball-upload.jks -alias riftball -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$PASS" -keypass "$PASS" -dname "CN=SuperEssence, OU=RIFTBALL, O=SuperEssence, C=FR"
cat > keystore.properties <<P
storeFile=keystore/riftball-upload.jks
storePassword=$PASS
keyAlias=riftball
keyPassword=$PASS
P
echo "Keystore created: android/keystore/riftball-upload.jks (password stored in android/keystore.properties)"
