#!/usr/bin/env bash
# Build both react-native-web bundles and serve them through the /api proxy.
#
#   ./run.sh                 # production build, serve on :12001
#   APP=mobile-partners ./run.sh build
#   PORT=12001 API_ORIGIN=http://127.0.0.1:3005 ./run.sh serve
#
# Requires the api-gateway on API_ORIGIN and the shared workspace packages built.
set -u
cd "$(dirname "$0")"

# Optional local config (gitignored): public client keys + origins. Real values
# are never committed; see README. `set -a` exports every assignment.
if [ -f .env ]; then set -a; . ./.env; set +a; fi

ROOT="$(cd .. && pwd)"
WEBPACK="$ROOT/node_modules/.bin/webpack"
PORT="${PORT:-12001}"
API_ORIGIN="${API_ORIGIN:-http://127.0.0.1:3005}"
STRIP_API_PREFIX="${STRIP_API_PREFIX:-1}"
export EXPO_PUBLIC_MAPBOX_TOKEN="${EXPO_PUBLIC_MAPBOX_TOKEN:-${MAPBOX_TOKEN:-}}"

build() {
  APP_LIST="${APP:-mobile-partners mobile-customer rider-map}"
  # Copy 1: local api-gateway, served under /preview/<app>/ (API_URL=/api).
  for name in $APP_LIST; do
    echo "=== building $name (local -> /preview) ==="
    APP="$name" API_URL=/api NODE_ENV=production PUBLIC_BASE=/preview OUT_DIR=dist \
      "$WEBPACK" --config webpack.config.js || exit 1
  done
  # Copy 2: live origin, served under /live/<app>/ (API_URL=/live/api).
  for name in $APP_LIST; do
    echo "=== building $name (live -> /live) ==="
    APP="$name" API_URL=/live/api NODE_ENV=production PUBLIC_BASE=/live OUT_DIR=dist-live \
      "$WEBPACK" --config webpack.config.js || exit 1
  done
}

serve() {
  echo "=== serving on :$PORT (api -> $API_ORIGIN, live -> ${AAGAAM_LIVE_ORIGIN:-<disabled>}) ==="
  PORT="$PORT" API_ORIGIN="$API_ORIGIN" STRIP_API_PREFIX="$STRIP_API_PREFIX" \
    AAGAAM_LIVE_ORIGIN="${AAGAAM_LIVE_ORIGIN:-}" node server.js
}

case "${1:-all}" in
  build) build ;;
  serve) serve ;;
  all) build && serve ;;
  *) echo "usage: $0 [build|serve|all]" >&2; exit 2 ;;
esac
