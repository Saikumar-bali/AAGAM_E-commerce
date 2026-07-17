#!/usr/bin/env bash
set -euo pipefail

app_slug="${1:?app slug is required}"
package_name="${2:?package name is required}"
google_services_path="${3:?google-services.json path is required}"
validator_path="${4:?validator path is required}"
proof_dir="${5:-release-proof}"

required=(GOOGLE_WEB_CLIENT_ID GOOGLE_ANDROID_CLIENT_ID GOOGLE_SERVICES_JSON)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "::error::$name is required for $app_slug Google Sign-In"
    exit 1
  fi
done

mkdir -p "$(dirname "$google_services_path")" "$proof_dir"
printf '%s' "$GOOGLE_SERVICES_JSON" > "$google_services_path"

release_values=(
  "${KEYSTORE_BASE64:-}"
  "${AAGAM_ANDROID_KEYSTORE_PASSWORD:-}"
  "${AAGAM_ANDROID_KEY_ALIAS:-}"
  "${AAGAM_ANDROID_KEY_PASSWORD:-}"
)
configured=0
for value in "${release_values[@]}"; do
  [[ -n "$value" ]] && configured=$((configured + 1))
done
if (( configured > 0 && configured < 4 )); then
  echo "::error::Android release signing secrets must be configured together."
  exit 1
fi

if (( configured == 4 )); then
  signing_store="${RUNNER_TEMP:?RUNNER_TEMP is required}/aagam-release.keystore"
  printf '%s' "$KEYSTORE_BASE64" | base64 --decode > "$signing_store"
  signing_alias="$AAGAM_ANDROID_KEY_ALIAS"
  signing_store_password="$AAGAM_ANDROID_KEYSTORE_PASSWORD"
  signing_channel="release"
  echo "AAGAM_ANDROID_KEYSTORE_PATH=$signing_store" >> "$GITHUB_ENV"
else
  if [[ -z "${DEBUG_KEYSTORE_BASE64:-}" ]]; then
    echo "::error::No release keystore is configured and DEBUG_KEYSTORE_BASE64 is missing. Refusing to generate an ephemeral certificate because Google Sign-In would be invalid on the produced APK."
    exit 1
  fi
  signing_store="$HOME/.android/debug.keystore"
  mkdir -p "$HOME/.android"
  printf '%s' "$DEBUG_KEYSTORE_BASE64" | base64 --decode > "$signing_store"
  signing_alias="androiddebugkey"
  signing_store_password="android"
  signing_channel="pinned-debug"
fi

signing_sha1="$(keytool -list -v -keystore "$signing_store" -alias "$signing_alias" -storepass "$signing_store_password" 2>/dev/null | awk '/SHA1:/{print $2; exit}')"
signing_sha256="$(keytool -list -v -keystore "$signing_store" -alias "$signing_alias" -storepass "$signing_store_password" 2>/dev/null | awk '/SHA256:/{print $2; exit}')"
if [[ -z "$signing_sha1" || -z "$signing_sha256" ]]; then
  echo "::error::Could not read SHA fingerprints from the configured Android keystore."
  exit 1
fi

proof_file="$proof_dir/${app_slug}-google-signin-proof.md"
{
  echo "# ${app_slug^} Google Sign-In proof"
  echo
  echo "- Package: \`$package_name\`"
  echo "- Signing channel: \`$signing_channel\`"
  echo "- APK signing SHA-1: \`$signing_sha1\`"
  echo "- APK signing SHA-256: \`$signing_sha256\`"
  echo "- Web OAuth client configured: yes"
  echo "- Android OAuth client configured: yes"
  echo "- google-services.json supplied: yes"
  echo
  echo "## Validation"
  echo '```text'
} > "$proof_file"

EXPECTED_PACKAGE_NAME="$package_name" \
SIGNING_CERT_SHA1="$signing_sha1" \
GOOGLE_SERVICES_JSON_PATH="$google_services_path" \
node "$validator_path" | tee -a "$proof_file"

echo '```' >> "$proof_file"
echo "Validated $app_slug Google Sign-In against APK signing SHA-1 $signing_sha1"
