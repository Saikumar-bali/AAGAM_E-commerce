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
DEPLOY_NODE_HEAP_MB="${DEPLOY_NODE_HEAP_MB:-1536}"
# The monorepo is compiled on the GitHub runner (4 vCPU, 16 GB) and shipped as
# a prebuilt archive. The 2 vCPU / 2 GB VPS only installs runtime dependencies,
# runs migrations and restarts pm2; it never builds. Deploying required tsc to
# run on the host, which needs 30-40 minutes and multi-gigabyte swap files.
DEPLOY_ARTIFACT_ARCHIVE="${DEPLOY_ARTIFACT_ARCHIVE:-}"
# Deployment swap files were a build-time fixture of the old VPS-side build.
# They are no longer created, but leftovers from an interrupted deploy are still
# cleaned up so the 19 GB volume does not keep carrying a 4 GB file.
DEPLOY_SWAP_FILE="${DEPLOY_SWAP_FILE:-/var/tmp/aagam-deploy.swap}"
DEPLOY_SUPPLEMENTAL_SWAP_FILE="${DEPLOY_SUPPLEMENTAL_SWAP_FILE:-${DEPLOY_SWAP_FILE}.extra}"

cd "$APP_DIR"

on_error() {
  local exit_code=$?
  trap - ERR
  echo "Deployment failed with exit code $exit_code."
  # Restore the previously-live build artifacts so a failed release never leaves
  # the VPS unable to serve the old one. Artifact installs replace dist/.next in
  # place, so the previous build is kept in DIST_BACKUP_DIR until the new
  # release passes every health check. Always restore to disk, then bring
  # processes back.
  if [[ -n "${DIST_BACKUP_DIR:-}" && -d "$DIST_BACKUP_DIR" ]]; then
    echo "Restoring previous build artifacts from $DIST_BACKUP_DIR"
    for rel_dir in "packages/types/dist" "packages/utils/dist" "packages/ui/dist" "packages/database/dist" "apps/api-gateway/dist" "apps/worker-service/dist" "apps/admin-dashboard/.next"; do
      if [[ -e "$DIST_BACKUP_DIR/$rel_dir" ]]; then
        rm -rf "$rel_dir" || true
        cp -a "$DIST_BACKUP_DIR/$rel_dir" "$rel_dir" 2>/dev/null || true
      fi
    done
    rm -rf "$DIST_BACKUP_DIR" || true
  fi
  # Bring the (restored) old release back up so a failed deploy never leaves
  # production down.
  if [[ -n "${DIST_BACKUP_DIR:-}" ]]; then
    echo "Restoring pm2 processes to the previous release."
    pm2 startOrReload ecosystem.config.js --update-env --interpreter "$(command -v node)" >/dev/null 2>&1 || true
    pm2 restart admin-dashboard --update-env >/dev/null 2>&1 || true
  fi
  if [[ -r /proc/meminfo ]]; then
    awk '/MemAvailable:|SwapFree:|SwapTotal:/ { printf "%s %s %s\n", $1, $2, $3 }' /proc/meminfo || true
  fi
  if command -v pm2 >/dev/null 2>&1; then
    pm2 status || true
    pm2 logs api-gateway --lines 80 --nostream || true
  fi
  # A deploy that fails before touching anything must still not leave a stale
  # deployment swap on the volume. Guarded because this trap can fire before
  # the function is parsed; the function itself is best-effort.
  if declare -F release_deploy_swap >/dev/null 2>&1; then
    release_deploy_swap || true
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

swap_is_active() {
  local swap_file="$1"
  sudo -n swapon --show=NAME --noheadings 2>/dev/null | awk '{$1=$1};1' | grep -Fxq "$swap_file"
}

# Deployment swap files belonged to the era when the VPS compiled the release.
# The build now happens on the GitHub runner, so this helper only removes files
# left behind by an interrupted older deploy.

# The 1.9 GB host cannot compile the release without ~4 GB of extra swap, but
# that file has no business occupying 4 GB of a 19 GB volume while the site is
# simply running: on this host it sat permanently at 4.1 GB holding 167 MB of
# pages, and the volume reached 100% during the 2026-10-01 outage.
#
# Best-effort by design: cleanup must never turn a successful deploy into a
# failed one, so every failure path here is swallowed. Only the
# deployment-owned files are touched; /var/swap/aagam.swap (persistent runtime
# swap) is never removed.
release_deploy_swap() {
  # Cleanup is optional; on hosts without passwordless sudo (or sudo at all)
  # leave the file alone instead of prompting or failing the deploy.
  if ! sudo -n true >/dev/null 2>&1; then
    return 0
  fi

  local swap_file
  for swap_file in "$DEPLOY_SUPPLEMENTAL_SWAP_FILE" "$DEPLOY_SWAP_FILE"; do
    [[ -n "$swap_file" && -f "$swap_file" ]] || continue

    if swap_is_active "$swap_file"; then
      # /proc/swaps columns: Filename Type Size Used Free (all kB).
      # `exit` inside awk rather than a `| head` pipeline: under
      # `set -o pipefail` a SIGPIPE from head could fail this assignment.
      local used_kb
      used_kb="$(awk -v f="$swap_file" '$1 == f { print $4; exit }' /proc/swaps 2>/dev/null)"
      [[ "$used_kb" =~ ^[0-9]+$ ]] || used_kb=0

      local available_kb
      available_kb="$(awk '/MemAvailable:/ { print $2; exit }' /proc/meminfo 2>/dev/null)"
      [[ "$available_kb" =~ ^[0-9]+$ ]] || available_kb=0

      # swapoff migrates those pages straight back into RAM. Refuse rather
      # than hand them to the OOM killer: keep 256 MB of headroom after the
      # migration so the live release is never put at risk by housekeeping.
      # (The host no longer compiles releases, so it needs far less reserve.)
      if (( used_kb + 262144 > available_kb )); then
        echo "Leaving deployment swap in place: $swap_file holds ${used_kb} kB which cannot safely migrate into ${available_kb} kB MemAvailable."
        continue
      fi

      echo "Releasing deployment swap $swap_file (${used_kb} kB in use)."
      if ! sudo swapoff "$swap_file" >/dev/null 2>&1; then
        echo "swapoff $swap_file failed; leaving it active rather than deleting a mounted swap."
        continue
      fi
    fi

    sudo rm -f "$swap_file" 2>/dev/null || true
  done

  # Report the space actually returned so a deploy log shows the gain.
  if command -v df >/dev/null 2>&1; then
    echo "Disk after deployment swap release: $(df -Ph / | awk 'NR == 2 { print $4 " free (" $5 ")" }')"
  fi
}

create_swap_file() {
  local swap_file="$1"
  local swap_mb="$2"
  sudo -n swapoff "$swap_file" >/dev/null 2>&1 || true
  sudo -n rm -f "$swap_file"
  sudo -n fallocate -l "${swap_mb}M" "$swap_file"
  sudo -n chmod 600 "$swap_file"
  sudo -n mkswap -f "$swap_file" >/dev/null
  sudo -n swapon "$swap_file"
}

# `npm ci` on the full workspace tree peaks above the 1.9 GB host's free RAM and
# was previously able to trigger the OOM killer. Provision a temporary swap file
# only for the duration of a dependency install, then release it in the same
# deploy so the 19 GB volume does not carry it at rest.
ensure_install_swap() {
  if ! sudo -n true >/dev/null 2>&1; then
    return 0
  fi

  local available_mb
  available_mb="$(awk '/MemAvailable:/ { print int($2 / 1024) }' /proc/meminfo 2>/dev/null || echo 0)"
  if (( available_mb >= 1024 )); then
    return 0
  fi

  local swap_mb=2048
  local free_disk_mb
  free_disk_mb="$(df -Pm /var/tmp | awk 'NR == 2 { print $4 }')"
  if (( free_disk_mb < swap_mb + 512 )); then
    echo "Not enough free disk for a temporary install swap (${free_disk_mb} MB free)."
    return 0
  fi

  if swap_is_active "$DEPLOY_SWAP_FILE"; then
    return 0
  fi

  echo "Memory is tight (${available_mb} MB available); provisioning ${swap_mb} MB temporary swap for the dependency install."
  create_swap_file "$DEPLOY_SWAP_FILE" "$swap_mb"
}

redis_target_host() {
  REDIS_URL="$REDIS_URL" node -e '
    const target = new URL(process.env.REDIS_URL);
    process.stdout.write(target.hostname);
  '
}

redis_tcp_ready() {
  REDIS_URL="$REDIS_URL" node - <<'NODE'
const net = require('node:net');
const target = new URL(process.env.REDIS_URL);
const port = Number(target.port || 6379);
const socket = net.createConnection({ host: target.hostname, port });
let settled = false;
const finish = (ok) => {
  if (settled) return;
  settled = true;
  socket.destroy();
  process.exit(ok ? 0 : 1);
};
socket.setTimeout(1500);
socket.once('connect', () => finish(true));
socket.once('timeout', () => finish(false));
socket.once('error', () => finish(false));
NODE
}

ensure_redis_runtime() {
  if redis_tcp_ready; then
    echo "Redis endpoint is reachable before deployment."
    return
  fi

  local redis_host
  redis_host="$(redis_target_host)"
  case "$redis_host" in
    localhost|127.0.0.1|::1) ;;
    *)
      echo "Configured external Redis endpoint is unreachable: ${redis_host}."
      echo "Deployment will not attempt to manage a remote Redis service."
      exit 1
      ;;
  esac

  require_command systemctl
  require_command sudo
  if ! sudo -n true >/dev/null 2>&1; then
    echo "Local Redis is stopped and passwordless sudo is required to start it."
    echo "Allow the deployment user to start redis-server.service (or redis.service)."
    exit 1
  fi

  local service_name
  local started=false
  for service_name in redis-server redis; do
    if systemctl list-unit-files --type=service --no-legend "${service_name}.service" 2>/dev/null | grep -q "^${service_name}\\.service"; then
      echo "Local Redis is stopped; starting ${service_name}.service."
      sudo -n systemctl start "${service_name}.service"
      started=true
      break
    fi
  done

  if [[ "$started" != true ]]; then
    echo "Local REDIS_URL is configured, but no redis-server.service or redis.service unit exists."
    exit 1
  fi

  for attempt in $(seq 1 10); do
    if redis_tcp_ready; then
      echo "Redis endpoint became reachable after starting ${service_name}.service."
      return
    fi
    sleep 1
  done

  echo "Redis service was started, but ${REDIS_URL} did not become reachable."
  exit 1
}

# Swap the runner-built release outputs into place. The archive is unpacked
# into a staging directory on the same filesystem as the app, verified, and
# then each output directory is moved into position. A failed extraction
# therefore leaves the previous dist/.next untouched.
install_build_artifacts() {
  local archive="$DEPLOY_ARTIFACT_ARCHIVE"
  local staging
  staging="$(mktemp -d "$APP_DIR/.deploy-artifacts.XXXXXX")"

  tar -xzf "$archive" -C "$staging"

  local required_dir
  for required_dir in apps/api-gateway/dist apps/worker-service/dist apps/admin-dashboard/.next; do
    if [[ ! -d "$staging/$required_dir" ]]; then
      echo "Prebuilt artifact archive $archive is missing $required_dir."
      rm -rf "$staging"
      exit 1
    fi
  done

  local rel_dir
  for rel_dir in \
    packages/types/dist \
    packages/utils/dist \
    packages/ui/dist \
    packages/database/dist \
    apps/api-gateway/dist \
    apps/worker-service/dist \
    apps/admin-dashboard/.next; do
    if [[ -d "$staging/$rel_dir" ]]; then
      rm -rf "$rel_dir"
      mv "$staging/$rel_dir" "$rel_dir"
    fi
  done

  rm -rf "$staging"
  echo "Installed prebuilt build artifacts from $archive."
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

# Remove stale .env.local files that shadow deploy-time env vars. Next.js
# .env.local overrides process env vars, so a leftover .env.local with an
# incorrect API URL can silently break what the release serves even when
# NEXT_PUBLIC_API_URL is correctly exported here.
find apps -maxdepth 2 -name '.env.local' -delete 2>/dev/null || true

echo "Deploying AAGAM commit $DEPLOY_SHA"
node --version
npm --version

npm run check:env:prod
ensure_redis_runtime

# Release any deployment swap file left behind by an interrupted deploy, or by
# the dependency install below. Best-effort: this is the first command that
# touches sudo, so a host without passwordless sudo just skips it.
release_deploy_swap || true

if [[ -z "$DEPLOY_ARTIFACT_ARCHIVE" || ! -s "$DEPLOY_ARTIFACT_ARCHIVE" ]]; then
  echo "Prebuilt artifact archive is missing (DEPLOY_ARTIFACT_ARCHIVE=${DEPLOY_ARTIFACT_ARCHIVE:-unset})."
  echo "The GitHub workflow compiles the monorepo on the runner and uploads it before this script runs."
  exit 1
fi

# Resolve the Prisma CLI version from the committed lockfile and run it through
# npx so the generated client always matches @prisma/client, even though the
# runtime install below omits devDependencies.
PRISMA_VERSION="$(node -e "process.stdout.write((require('./package-lock.json').packages['node_modules/prisma'] || {}).version || '')")"
if [[ -z "$PRISMA_VERSION" ]]; then
  echo "Unable to determine the pinned Prisma version from package-lock.json."
  exit 1
fi
run_prisma() {
  npx --yes --prefer-offline "prisma@${PRISMA_VERSION}" "$@"
}

# Install dependencies only when package-lock.json changed since the last
# successful install, and install only what this host actually runs. The mobile
# workspaces are excluded and devDependencies omitted, which keeps node_modules
# at ~1.3 GB instead of ~1.8 GB on a 19 GB volume. When the lockfile does
# change, the install runs under a temporary swap file (see ensure_install_swap)
# that is released immediately afterwards.
INSTALL_STAMP_VERSION="scoped-prod-v1"
LOCK_STAMP="node_modules/.aagam-package-lock.sha256"
lock_sha="$(sha256sum package-lock.json | awk '{print $1}')"
stamp_expectation="${lock_sha} ${INSTALL_STAMP_VERSION}"
if [[ -d node_modules && -f "$LOCK_STAMP" && "$(cat "$LOCK_STAMP" 2>/dev/null)" == "$stamp_expectation" ]]; then
  echo "package-lock.json ($lock_sha) is unchanged; keeping installed dependencies."
else
  echo "Installing runtime dependencies for the deployed workspaces."
  ensure_install_swap
  if npm ci \
    --workspace=@aagam/api-gateway \
    --workspace=@aagam/admin-dashboard \
    --workspace=@aagam/worker-service \
    --include-workspace-root \
    --omit=dev \
    --no-audit --no-fund --prefer-offline; then
    :
  else
    echo "Scoped runtime install failed; falling back to the full dev-inclusive install."
    npm ci --include=dev --no-audit --no-fund --prefer-offline
  fi
  printf '%s\n' "$stamp_expectation" > "$LOCK_STAMP"
  # Return the temporary install swap immediately; it must not sit on disk
  # until the next deploy.
  release_deploy_swap || true
fi

run_prisma generate --schema packages/database/prisma/schema.prisma
run_prisma validate --schema packages/database/prisma/schema.prisma

# Back up the currently-live build artifacts before the prebuilt archive is
# unpacked over them, so a failed release can roll back to the previous one
# instead of leaving the VPS with only a 502.
DIST_BACKUP_DIR="$(mktemp -d)"
echo "Backing up current build artifacts to $DIST_BACKUP_DIR"
for rel_dir in "packages/types/dist" "packages/utils/dist" "packages/ui/dist" "packages/database/dist" "apps/api-gateway/dist" "apps/worker-service/dist" "apps/admin-dashboard/.next"; do
  if [[ -d "$rel_dir" ]]; then
    mkdir -p "$DIST_BACKUP_DIR/$(dirname "$rel_dir")"
    cp -a "$rel_dir" "$DIST_BACKUP_DIR/$rel_dir" 2>/dev/null || true
  fi
done

# Unpack the release that was compiled on the GitHub runner.
install_build_artifacts

# Deploy only checked-in migrations. Never use prisma db push in production.
run_prisma migrate deploy --schema packages/database/prisma/schema.prisma
run_prisma migrate status --schema packages/database/prisma/schema.prisma

deploy_node="$(command -v node)"
pm2 startOrReload ecosystem.config.js --update-env --interpreter "$deploy_node"
# `pm2 startOrReload` does not restart a process whose script is unchanged, so
# the dashboard could keep serving the previous release's in-memory route table
# and cache. Restart it explicitly to load the freshly built .next output.
pm2 restart admin-dashboard --update-env
pm2 restart api-gateway --update-env || pm2 start ecosystem.config.js --only api-gateway --update-env --interpreter "$deploy_node"
pm2 restart worker-service --update-env || pm2 start ecosystem.config.js --only worker-service --update-env --interpreter "$deploy_node"
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

# Best-effort cleanup of any leftover deployment swap from an older deploy.
# The runtime keeps its persistent /var/swap/aagam.swap, which is never touched.
release_deploy_swap || true

pm2 status
echo "Deployment completed successfully for commit $DEPLOY_SHA"

# Everything is healthy, so this release is definitely superseded and the
# previous release's backup is dead weight. Removed only after the final
# failure-capable verification (pm2 status) so on_error() can still restore the
# build artifacts if that check fails.
if [[ -n "${DIST_BACKUP_DIR:-}" && -d "$DIST_BACKUP_DIR" ]]; then
  echo "Removing build artifact backup $DIST_BACKUP_DIR"
  rm -rf "$DIST_BACKUP_DIR" || true
fi

# The release is compiled on the GitHub runner, so the VPS-side turbo cache is
# dead weight on a 92%-full volume. Reclaim it; it is regenerated locally if
# anyone ever builds on the host again.
rm -rf .turbo || true

# The uploaded archive is single-use.
if [[ -n "$DEPLOY_ARTIFACT_ARCHIVE" && -f "$DEPLOY_ARTIFACT_ARCHIVE" ]]; then
  rm -f "$DEPLOY_ARTIFACT_ARCHIVE" || true
fi

# Best-effort housekeeping so the 19 GB volume does not creep full again:
# package caches and the repository's object store grow with every upgrade and
# deploy. Neither command can fail the deploy.
sudo -n apt-get clean >/dev/null 2>&1 || true
git gc --auto >/dev/null 2>&1 || true

echo "Disk after deploy: $(df -Ph / | awk 'NR == 2 { print $3 " used, " $4 " free (" $5 ")" }')"
