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

ROOT="$(cd .. && pwd)"
WEBPACK="$ROOT/node_modules/.bin/webpack"
PORT="${PORT:-12001}"
API_ORIGIN="${API_ORIGIN:-http://127.0.0.1:3005}"
STRIP_API_PREFIX="${STRIP_API_PREFIX:-1}"
export EXPO_PUBLIC_MAPBOX_TOKEN="${EXPO_PUBLIC_MAPBOX_TOKEN:-${MAPBOX_TOKEN:-}}"

build() {
  for app in "${APP:-mobile-partners mobile-customer}"; do
    for name in $app; do
      echo "=== building $name ==="
      APP="$name" API_URL=/api NODE_ENV=production "$WEBPACK" --config webpack.config.js || exit 1
    done
  done
}

serve() {
  echo "=== serving on :$PORT (api -> $API_ORIGIN) ==="
  PORT="$PORT" API_ORIGIN="$API_ORIGIN" STRIP_API_PREFIX="$STRIP_API_PREFIX" node server.js
}

case "${1:-all}" in
  build) build ;;
  serve) serve ;;
  all) build && serve ;;
  *) echo "usage: $0 [build|serve|all]" >&2; exit 2 ;;
esac
