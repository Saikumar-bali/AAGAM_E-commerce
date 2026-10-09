#!/usr/bin/env bash
#
# Persistent local-demo provisioning.
#
# The partner web previews need more than the base catalog: the store console
# shows the subscription hub, milk grid and delivery runs only when there are
# real demo plans, customers, subscriptions and a dispatched/delivered run. That
# data used to be created by hand inside a chat/preview session, so it vanished
# the moment the sandbox expired. This script is the durable replacement:
#
#   * committed to the repo, so a fresh sandbox is demo-ready with no manual work;
#   * idempotent — the underlying seeders upsert their rows and clear their own
#     previous demo rows first, so re-running is safe and never duplicates data;
#   * self-cleaning — it can run against a brand-new schema (recovery after an
#     expired sandbox) because every delete/upsert is a no-op when nothing exists;
#   * non-production only — refuses to run with NODE_ENV=production.
#
# Usage:
#   DATABASE_URL=postgresql://... bash scripts/seed-demo.sh
#   SEED_DEMO_DATA=false bash scripts/seed-demo.sh   # explicit opt-out, exit 0
#
# Environment:
#   DATABASE_URL    required (falls back to packages/database/.env, then .env)
#   SEED_DEMO_DATA  set to "false" to skip demo seeding without failing setup
#   NODE_ENV        must not be "production"
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { echo "[seed-demo] $*"; }

if [ "${NODE_ENV:-development}" = "production" ]; then
  log "refusing to seed demo data with NODE_ENV=production"
  exit 1
fi

if [ "${SEED_DEMO_DATA:-true}" = "false" ]; then
  log "SEED_DEMO_DATA=false — skipping (base setup still succeeds)"
  exit 0
fi

# Resolve DATABASE_URL without leaking it into shell history or logs.
if [ -z "${DATABASE_URL:-}" ]; then
  for env_file in packages/database/.env .env; do
    if [ -f "$env_file" ]; then
      url="$(grep -E '^DATABASE_URL=' "$env_file" | head -1 | cut -d= -f2- || true)"
      if [ -n "$url" ]; then
        export DATABASE_URL="$url"
        break
      fi
    fi
  done
fi

if [ -z "${DATABASE_URL:-}" ]; then
  log "DATABASE_URL is not set and could not be read from packages/database/.env or .env"
  exit 1
fi

log "1/2 base catalog, accounts and sample orders…"
( cd packages/database && node seed.js )

log "2/2 subscription demo flow (offline + online customers, dispatch, delivery)…"
( cd apps/api-gateway && npx ts-node --transpile-only --project tsconfig.json demo-seed.flow.ts )

log "done — demo store, plans, customers, subscriptions and a delivered run are ready."
