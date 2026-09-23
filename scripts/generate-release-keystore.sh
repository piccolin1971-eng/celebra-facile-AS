#!/usr/bin/env bash
# Genera una keystore di release fissa per aggiornamenti APK in-place.
# Uso (una tantum sul PC):
#   bash scripts/generate-release-keystore.sh
# Poi carica su GitHub → Settings → Secrets:
#   ANDROID_KEYSTORE_BASE64  (output base64 del file)
#   ANDROID_KEYSTORE_PASSWORD
#   ANDROID_KEY_ALIAS
#   ANDROID_KEY_PASSWORD     (spesso uguale alla store password)
set -euo pipefail
OUT="${1:-celebra-release.keystore}"
ALIAS="${2:-celebra}"
PASS="${3:-}"

if [ -z "$PASS" ]; then
  echo "Usage: $0 [outfile] [alias] <password>"
  echo "Esempio: $0 celebra-release.keystore celebra 'MiaPasswordSicura'"
  exit 1
fi

keytool -genkeypair -v \
  -keystore "$OUT" \
  -alias "$ALIAS" \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$PASS" -keypass "$PASS" \
  -dname "CN=Celebra Prega Facile,OU=AP,O=AP,L=IT,C=IT"

echo ""
echo "Keystore creata: $OUT"
echo "Aggiungi questo secret ANDROID_KEYSTORE_BASE64:"
base64 -w0 "$OUT" 2>/dev/null || base64 "$OUT" | tr -d '\n'
echo ""
echo ""
echo "Secrets da impostare:"
echo "  ANDROID_KEYSTORE_BASE64=<sopra>"
echo "  ANDROID_KEYSTORE_PASSWORD=$PASS"
echo "  ANDROID_KEY_ALIAS=$ALIAS"
echo "  ANDROID_KEY_PASSWORD=$PASS"
echo ""
echo "Conserva il file .keystore in un posto sicuro (NON nel repo git)."
