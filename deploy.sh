#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_SHA="${DEPLOY_SHA:-}"
DEPLOY_PUBLIC_API_URL="${DEPLOY_PUBLIC_API_URL:-}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1:3005/health}"
DEPLOY_LOCK_FILE="${DEPLOY_LOCK_FILE:-/tmp/aagam-production-deploy.lock}"
DEPLOY_NODE_VERSION="${DEPLOY_NODE_VERSION:-22.22.3}"
DEPLOY_NODE_CACHE_DIR="${DEPLOY_NODE_CACHE_DIR:-$HOME/.cache/aagam-node}"
DEPLOY_MIN_AVAILABLE_MEMORY_MB="${DEPLOY_MIN_AVAILABLE_MEMORY_MB:-1536}"
DEPLOY_SWAP_MB="${DEPLOY_SWAP_MB:-1536}"
DEPLOY_SWAP_FILE="${DEPLOY_SWAP_FILE:-/var/tmp/aagam-deploy.swap}"
DEPLOY_NODE_HEAP_MB="${DEPLOY_NODE_HEAP_MB:-1536}"

cd "$APP_DIR"

on_error() {
  local exit_code=$?
  trap - ERR
  echo "Deployment failed with exit code $exit_code."
  if [[ -r /proc/meminfo ]]; then
    awk '/MemAvailable:|SwapFree:|SwapTotal:/ { printf "%s %s %s\n", $1, $2, $3 }' /proc/meminfo || true
  fi
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

node_runtime_is_supported() {
  command -v node >/dev/null 2>&1 && node -e '
    const [major, minor] = process.versions.node.split(".").map(Number);
    process.exit(major === 22 && minor >= 11 ? 0 : 1);
  '
}

ensure_node_runtime() {
  if node_runtime_is_supported; then
    return
  fi

  local node_arch
  case "$(uname -m)" in
    x86_64|amd64) node_arch="x64" ;;
    aarch64|arm64) node_arch="arm64" ;;
    *)
      echo "Unsupported production architecture for managed Node runtime: $(uname -m)"
      exit 1
      ;;
  esac

  local archive="node-v${DEPLOY_NODE_VERSION}-linux-${node_arch}.tar.gz"
  local runtime_dir="${DEPLOY_NODE_CACHE_DIR}/node-v${DEPLOY_NODE_VERSION}-linux-${node_arch}"
  if [[ ! -x "$runtime_dir/bin/node" ]]; then
    echo "System Node $(node --version 2>/dev/null || echo missing) is unsupported; installing verified Node v${DEPLOY_NODE_VERSION} for this deployment."
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    curl --fail --silent --show-error --location \
      "https://nodejs.org/dist/v${DEPLOY_NODE_VERSION}/${archive}" \
      --output "${tmp_dir}/${archive}"
    curl --fail --silent --show-error --location \
      "https://nodejs.org/dist/v${DEPLOY_NODE_VERSION}/SHASUMS256.txt" \
      --output "${tmp_dir}/SHASUMS256.txt"
    (
      cd "$tmp_dir"
      grep "  ${archive}$" SHASUMS256.txt | sha256sum --check --strict -
    )
    mkdir -p "$DEPLOY_NODE_CACHE_DIR"
    rm -rf "$runtime_dir"
    tar -xzf "${tmp_dir}/${archive}" -C "$DEPLOY_NODE_CACHE_DIR"
    rm -rf "$tmp_dir"
  fi

  export PATH="${runtime_dir}/bin:${PATH}"
  hash -r
  if ! node_runtime_is_supported; then
    echo "Unable to activate the required Node 22 runtime. Active version: $(node --version 2>/dev/null || echo missing)"
    exit 1
  fi
}

available_memory_mb() {
  awk '
    /MemAvailable:/ { memory = $2 }
    /SwapFree:/ { swap = $2 }
    END { printf "%d\n", (memory + swap) / 1024 }
  ' /proc/meminfo
}

ensure_deploy_memory() {
  local available_mb
  available_mb="$(available_memory_mb)"
  echo "Deployment memory available before install: ${available_mb} MB"
  if (( available_mb >= DEPLOY_MIN_AVAILABLE_MEMORY_MB )); then
    return
  fi

  for command_name in sudo swapon mkswap stat df; do
    require_command "$command_name"
  done
  if ! sudo -n true >/dev/null 2>&1; then
    echo "At least ${DEPLOY_MIN_AVAILABLE_MEMORY_MB} MB combined free memory/swap is required."
    echo "Passwordless sudo is required to activate the deployment swap file at ${DEPLOY_SWAP_FILE}."
    exit 1
  fi

  local desired_bytes=$((DEPLOY_SWAP_MB * 1024 * 1024))
  local existing_bytes=0
  if [[ -f "$DEPLOY_SWAP_FILE" ]]; then
    existing_bytes="$(stat -c '%s' "$DEPLOY_SWAP_FILE" 2>/dev/null || echo 0)"
  fi

  if (( existing_bytes < desired_bytes )); then
    local swap_dir
    swap_dir="$(dirname "$DEPLOY_SWAP_FILE")"
    local free_disk_mb
    free_disk_mb="$(df -Pm "$swap_dir" | awk 'NR == 2 { print $4 }')"
    if (( free_disk_mb < DEPLOY_SWAP_MB + 512 )); then
      echo "Not enough disk space to create ${DEPLOY_SWAP_MB} MB deployment swap at ${DEPLOY_SWAP_FILE}."
      echo "Free disk: ${free_disk_mb} MB; required: $((DEPLOY_SWAP_MB + 512)) MB."
      exit 1
    fi

    echo "Creating ${DEPLOY_SWAP_MB} MB deployment swap file at ${DEPLOY_SWAP_FILE}."
    sudo swapoff "$DEPLOY_SWAP_FILE" >/dev/null 2>&1 || true
    sudo rm -f "$DEPLOY_SWAP_FILE"
    if command -v fallocate >/dev/null 2>&1; then
      sudo fallocate -l "${DEPLOY_SWAP_MB}M" "$DEPLOY_SWAP_FILE"
    else
      sudo dd if=/dev/zero of="$DEPLOY_SWAP_FILE" bs=1M count="$DEPLOY_SWAP_MB" status=none
    fi
    sudo chmod 600 "$DEPLOY_SWAP_FILE"
    sudo mkswap -f "$DEPLOY_SWAP_FILE" >/dev/null
  fi

  if ! sudo swapon --show=NAME --noheadings | awk '{$1=$1};1' | grep -Fxq "$DEPLOY_SWAP_FILE"; then
    sudo swapon "$DEPLOY_SWAP_FILE"
  fi

  available_mb="$(available_memory_mb)"
  echo "Deployment memory available after swap activation: ${available_mb} MB"
  if (( available_mb < DEPLOY_MIN_AVAILABLE_MEMORY_MB )); then
    echo "Unable to provide the minimum deployment memory budget of ${DEPLOY_MIN_AVAILABLE_MEMORY_MB} MB."
    exit 1
  fi
}

for command_name in git curl tar sha256sum uname flock awk grep; do
  require_command "$command_name"
done

exec 9>"$DEPLOY_LOCK_FILE"
if ! flock -n 9; then
  echo "Another AAGAM production deployment is already running."
  exit 1
fi

ensure_node_runtime
for command_name in node npm npx pm2; do
  require_command "$command_name"
done

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
export REQUIRE_CLOSED_APP_PUSH=true
export NEXT_TELEMETRY_DISABLED=1
export npm_config_jobs="${npm_config_jobs:-1}"
export NODE_OPTIONS="${NODE_OPTIONS:+${NODE_OPTIONS} }--max-old-space-size=${DEPLOY_NODE_HEAP_MB}"
if [[ -n "$DEPLOY_PUBLIC_API_URL" ]]; then
  export NEXT_PUBLIC_API_URL="$DEPLOY_PUBLIC_API_URL"
fi

# Remove stale .env.local files that shadow deploy-time env vars.
# Next.js .env.local overrides process env vars at build time, which means
# a leftover .env.local with an incorrect API URL will silently break the
# build even when NEXT_PUBLIC_API_URL is correctly exported here.
find apps -maxdepth 2 -name '.env.local' -delete 2>/dev/null || true

echo "Deploying AAGAM commit $DEPLOY_SHA"
node --version
npm --version

npm run check:env:prod
ensure_deploy_memory

# Build tooling is stored in devDependencies, so production deployment must
# install it before compiling. Runtime processes still run with NODE_ENV=production.
npm ci --include=dev --no-audit --no-fund

npx prisma generate --schema packages/database/prisma/schema.prisma
npx prisma validate --schema packages/database/prisma/schema.prisma

# The production VPS is intentionally small. Build one workspace at a time so
# npm/Next/Turbo cannot exhaust RAM even when the previous release remains live.
npx turbo build \
  --filter=@aagam/api-gateway \
  --filter=@aagam/admin-dashboard \
  --filter=@aagam/worker-service \
  --cache-dir=.turbo \
  --concurrency=1 \
  --force

# Deploy only checked-in migrations. Never use prisma db push in production.
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
npx prisma migrate status --schema packages/database/prisma/schema.prisma

deploy_node="$(command -v node)"
pm2 startOrReload ecosystem.config.js --update-env --interpreter "$deploy_node"
pm2 save

pm2 jlist | node -e '
  const fs = require("fs");
  const expected = ["admin-dashboard", "api-gateway", "worker-service"];
  const expectedRuntime = fs.realpathSync(process.execPath);
  const apps = JSON.parse(fs.readFileSync(0, "utf8"));
  const byName = new Map(apps.map((app) => [app.name, app]));
  const offline = expected.filter((name) => byName.get(name)?.pm2_env?.status !== "online");
  const wrongRuntime = expected.flatMap((name) => {
    const pid = Number(byName.get(name)?.pid);
    if (!Number.isInteger(pid) || pid <= 0) return [`${name}: invalid PID ${pid}`];
    try {
      const actualRuntime = fs.realpathSync(`/proc/${pid}/exe`);
      return actualRuntime === expectedRuntime ? [] : [`${name}: ${actualRuntime}`];
    } catch (error) {
      return [`${name}: unable to inspect /proc/${pid}/exe (${error.message})`];
    }
  });
  if (offline.length) {
    console.error(`PM2 processes not online: ${offline.join(", ")}`);
    process.exit(1);
  }
  if (wrongRuntime.length) {
    console.error(`PM2 processes not using ${expectedRuntime}: ${wrongRuntime.join(", ")}`);
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
for readiness_path in ready ready/realtime ready/notifications; do
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
