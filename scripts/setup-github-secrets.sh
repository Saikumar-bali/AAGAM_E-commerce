#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# AAGAM Android — GitHub Secrets & Variables Setup
# ============================================================
# Run from the repo root. Requires `gh` CLI authenticated.
#
# Two DIFFERENT Google OAuth clients are used:
#   1. 416380795567-... — Web dashboard (admin-dashboard login)
#   2. 102394932542-28cqd8... — Mobile apps (from google-services.json)
#
# The VPS backend accepts BOTH via GOOGLE_WEB_CLIENT_ID and
# GOOGLE_ANDROID_CLIENT_ID. Do NOT merge them into one.
# ============================================================

REPO="${GITHUB_REPOSITORY:-Saikumar-bali/AAGAM_E-commerce}"

echo "=== AAGAM GitHub Secrets Setup ==="
echo "Target repo: $REPO"
echo ""

# ---- Shared Variables (non-sensitive) ----
echo "Setting variables..."
gh variable set API_URL --repo "$REPO" --body "https://aagaam.in/api"

# ---- Shared Secret: Mobile Web client ID (from google-services.json type 3) ----
echo "Setting GOOGLE_WEB_CLIENT_ID..."
gh secret set GOOGLE_WEB_CLIENT_ID --repo "$REPO" --body \
  "102394932542-28cqd8mpikofnicaa0tmiu611c968ipa.apps.googleusercontent.com"

# ---- Customer ----
echo "Setting Customer secrets..."
gh secret set GOOGLE_ANDROID_CLIENT_ID_CUSTOMER --repo "$REPO" --body \
  "102394932542-ifkdn6nvfa4v5enmpul4jp8t8etuss9r.apps.googleusercontent.com"

gh secret set GOOGLE_SERVICES_JSON_CUSTOMER --repo "$REPO" \
  --body "$(cat apps/mobile-customer/android/app/google-services.json)"

# ---- Partners ----
echo "Setting Partners secrets..."
gh secret set GOOGLE_ANDROID_CLIENT_ID_PARTNERS --repo "$REPO" --body \
  "102394932542-lnu02h6uo5bhku4bl48ps6ji7dkrdtud.apps.googleusercontent.com"

gh secret set GOOGLE_SERVICES_JSON_PARTNERS --repo "$REPO" \
  --body "$(cat apps/mobile-partners/android/app/google-services.json)"

# ---- Keystore (release signing) ----
# Uncomment and fill in after encoding your keystore:
#   base64 -w 0 your-release.keystore > keystore.b64
#
# gh secret set ANDROID_KEYSTORE_BASE64 --repo "$REPO" --body "$(cat keystore.b64)"
# gh secret set ANDROID_KEYSTORE_PASSWORD --repo "$REPO" --body "YOUR_KEYSTORE_PASSWORD"
# gh secret set ANDROID_KEY_ALIAS      --repo "$REPO" --body "YOUR_KEY_ALIAS"
# gh secret set ANDROID_KEY_PASSWORD    --repo "$REPO" --body "YOUR_KEY_PASSWORD"

# ---- Debug keystore (CI fallback) ----
#   base64 -w 0 ~/.android/debug.keystore > debug-keystore.b64
# gh secret set DEBUG_KEYSTORE_BASE64 --repo "$REPO" --body "$(cat debug-keystore.b64)"

echo ""
echo "=== Done ==="
echo ""
echo "CRITICAL: Signing SHA-1 must match google-services.json:"
echo "  cad934113b9d425499fc3456a8c2ec1f68ef74c6"
echo "  (CA:D9:34:11:3B:9D:42:54:99:FC:34:56:A8:C2:EC:1F:68:EF:74:C6)"
echo ""
echo "Verify your keystore matches:"
echo "  keytool -list -v -keystore YOUR.keystore -alias YOUR_ALIAS"
echo ""
echo "NOT set (uncomment above):"
echo "  ANDROID_KEYSTORE_BASE64 / PASSWORD / ALIAS / KEY_PASSWORD"
echo "  DEBUG_KEYSTORE_BASE64"
echo ""
echo "DO NOT change GOOGLE_WEB_CLIENT_ID on VPS — it is for the web dashboard."
echo "DO NOT change GOOGLE_ANDROID_CLIENT_ID on VPS — it is for mobile apps."
