#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_SHA="${DEPLOY_SHA:-}"
DEPLOY_PUBLIC_API_URL="${DEPLOY_PUBLIC_API_URL:-}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1:3005/health}"
DEPLOY_LOCK_FILE="${DEPLOY_LOCK_FILE:-/tmp/aagam-production-deploy.lock}"

cd "$APP_DIR"

on_error() {
  local exit_code=$?
  trap - ERR
  echo "Deployment failed with exit code $exit_code."
  if command -v pm2 >/dev/null 2>&1; then
    pm2 status || true
    pm2 logs api-gateway --lines 80 --nostream || true
  fi
  exit "$exit_code"
}
trap on_error ERR

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Required command is missing: $1"
    exit 1
  }
}

for command_name in git node npm npx pm2 curl flock; do
  require_command "$command_name"
done

exec 9>"$DEPLOY_LOCK_FILE"
if ! flock -n 9; then
  echo "Another AAGAM production deployment is already running."
  exit 1
fi

if [[ -z "$DEPLOY_SHA" ]]; then
  echo "DEPLOY_SHA is required."
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "Production .env file is missing at $APP_DIR/.env"
  exit 1
fi

actual_sha="$(git rev-parse HEAD)"
if [[ "$actual_sha" != "$DEPLOY_SHA" ]]; then
  echo "Refusing deployment: repository is at $actual_sha, expected $DEPLOY_SHA."
  exit 1
fi

# The GitHub secret must contain a shell-compatible dotenv file. Strip CRLF
# endings so files encoded on Windows can be sourced safely on Linux.
set -a
# shellcheck disable=SC1091
source <(sed 's/\r$//' .env)
set +a
export NODE_ENV=production
if [[ -n "$DEPLOY_PUBLIC_API_URL" ]]; then
  export NEXT_PUBLIC_API_URL="$DEPLOY_PUBLIC_API_URL"
fi

echo "Deploying AAGAM commit $DEPLOY_SHA"
node --version
npm --version

npm run check:env:prod

# Build tooling is stored in devDependencies, so production deployment must
# install it before compiling. Runtime processes still run with NODE_ENV=production.
npm ci --include=dev --no-audit --no-fund

npx prisma generate --schema packages/database/prisma/schema.prisma
npx prisma validate --schema packages/database/prisma/schema.prisma

npx turbo build \
  --filter=@aagam/api-gateway \
  --filter=@aagam/admin-dashboard \
  --filter=@aagam/worker-service \
  --cache-dir=.turbo \
  --force

# Deploy only checked-in migrations. Never use prisma db push in production.
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
npx prisma migrate status --schema packages/database/prisma/schema.prisma

pm2 startOrReload ecosystem.config.js --update-env
pm2 save

pm2 jlist | node -e '
  const fs = require("fs");
  const expected = ["admin-dashboard", "api-gateway", "worker-service"];
  const apps = JSON.parse(fs.readFileSync(0, "utf8"));
  const status = new Map(apps.map((app) => [app.name, app.pm2_env?.status]));
  const failed = expected.filter((name) => status.get(name) !== "online");
  if (failed.length) {
    console.error(`PM2 processes not online: ${failed.join(", ")}`);
    process.exit(1);
  }
'

healthy=false
for attempt in $(seq 1 30); do
  health_response="$(curl --fail --silent --show-error --max-time 10 "$HEALTHCHECK_URL" || true)"
  if HEALTH_RESPONSE="$health_response" node -e '
    let response;
    try { response = JSON.parse(process.env.HEALTH_RESPONSE || "{}"); }
    catch { process.exit(1); }
    if (response.status !== "ok" || response.revision !== process.env.DEPLOY_SHA) process.exit(1);
  '; then
    healthy=true
    echo "Health check passed for exact revision $DEPLOY_SHA: $HEALTHCHECK_URL"
    break
  fi
  echo "Waiting for API health check ($attempt/30)..."
  sleep 2
done

if [[ "$healthy" != true ]]; then
  echo "Health check failed after 30 attempts: $HEALTHCHECK_URL"
  exit 1
fi

health_base="${HEALTHCHECK_URL%/health}"
for readiness_path in ready ready/realtime; do
  readiness_url="$health_base/$readiness_path"
  readiness_response="$(curl --fail --silent --show-error --max-time 10 "$readiness_url")"
  READINESS_RESPONSE="$readiness_response" node -e '
    const response = JSON.parse(process.env.READINESS_RESPONSE || "{}");
    if (response.status !== "ready") process.exit(1);
  '
  echo "Readiness check passed: $readiness_url"
done

pm2 status
echo "Deployment completed successfully for commit $DEPLOY_SHA"
