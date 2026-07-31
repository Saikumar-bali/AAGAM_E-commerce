#!/usr/bin/env bash
set -euo pipefail
node scripts/validate-brand-pngs.js \
  apps/admin-dashboard/public/brand/aagam-mark.png \
  apps/admin-dashboard/src/app/icon.png \
  apps/mobile-customer/src/assets/aagam-mark.png \
  apps/mobile-customer/android/app/src/main/res/drawable-nodpi/aagam_launcher_logo.png \
  apps/mobile-partners/src/assets/aagam-mark.png \
  apps/mobile-partners/android/app/src/main/res/drawable-nodpi/aagam_launcher_logo.png
