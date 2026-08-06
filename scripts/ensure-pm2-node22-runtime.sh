#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

# This hook is part of the remote production deployment only. Local validation,
# CI, Railway and fresh environments do not carry DEPLOY_SHA and must remain
# side-effect free.
if [[ -z "${DEPLOY_SHA:-}" ]]; then
  exit 0
fi

for command_name in node npm pm2 readlink; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Required PM2 runtime migration command is missing: $command_name"
    exit 1
  }
done

deploy_node="$(readlink -f "$(command -v node)")"
deploy_npm="$(readlink -f "$(command -v npm)")"
export AAGAM_NODE_INTERPRETER="$deploy_node"
export AAGAM_NPM_CLI="$deploy_npm"

required_apps=("admin-dashboard" "api-gateway" "worker-service")

for app_name in "${required_apps[@]}"; do
  current_runtime="$(
    pm2 jlist | APP_NAME="$app_name" node -e '
      const fs = require("fs");
      const apps = JSON.parse(fs.readFileSync(0, "utf8"));
      const app = apps.find((candidate) => candidate.name === process.env.APP_NAME);
      if (!app) {
        process.stdout.write("__MISSING__");
        process.exit(0);
      }
      if (app.pm2_env?.status !== "online") {
        process.stdout.write("__RECREATE__");
        process.exit(0);
      }
      const pid = Number(app.pid);
      if (!Number.isInteger(pid) || pid <= 0) {
        process.stdout.write("__RECREATE__");
        process.exit(0);
      }
      try {
        process.stdout.write(fs.realpathSync(`/proc/${pid}/exe`));
      } catch {
        process.stdout.write("__RECREATE__");
      }
    '
  )"

  if [[ "$current_runtime" == "__MISSING__" ]]; then
    echo "PM2 process $app_name does not exist yet; it will be created after the build."
    continue
  fi

  if [[ "$current_runtime" == "$deploy_node" ]]; then
    echo "PM2 process $app_name already uses $deploy_node."
    continue
  fi

  echo "Recreating $app_name with managed Node 22 (current runtime: $current_runtime)."
  pm2 delete "$app_name" >/dev/null 2>&1 || true
  pm2 start ecosystem.config.js --only "$app_name" --update-env

done

# Fail before the expensive install/build if an existing process definition
# still points at the system Node runtime after recreation.
pm2 jlist | node -e '
  const fs = require("fs");
  const expected = ["admin-dashboard", "api-gateway", "worker-service"];
  const expectedRuntime = fs.realpathSync(process.execPath);
  const apps = JSON.parse(fs.readFileSync(0, "utf8"));
  const byName = new Map(apps.map((app) => [app.name, app]));
  const mismatches = expected.flatMap((name) => {
    const app = byName.get(name);
    if (!app) return [];
    if (app.pm2_env?.status !== "online") return [`${name}: ${app.pm2_env?.status || "unknown"}`];
    const pid = Number(app.pid);
    if (!Number.isInteger(pid) || pid <= 0) return [`${name}: invalid PID ${pid}`];
    try {
      const actualRuntime = fs.realpathSync(`/proc/${pid}/exe`);
      return actualRuntime === expectedRuntime ? [] : [`${name}: ${actualRuntime}`];
    } catch (error) {
      return [`${name}: ${error.message}`];
    }
  });
  if (mismatches.length) {
    console.error(`PM2 runtime migration failed; expected ${expectedRuntime}: ${mismatches.join(", ")}`);
    process.exit(1);
  }
'
