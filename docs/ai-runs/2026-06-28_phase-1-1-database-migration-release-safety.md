# Phase 1.1 — Database Migration Release Safety

**Date:** 2026-06-28
**Branch:** `phase-1-1-database-migration-release-safety`
**Base commit:** `1d4c4d3bce7c7b643d1fe612f108fc46b61e0f34`
**Implementation commit:** `6223daf2d2a0188f5ffccae4d1f30e4e272290e4` (catch-up migration, CI changes, scripts)
**Proof commit / final branch head:** `60ff49c0dd660099014b3cc2075bc360e76888f4` (enum safety fix, proof doc update)
**GitHub Actions CI run (initial):** https://github.com/Saikumar-bali/AAGAM_E-commerce/actions/runs/28323829429 — ✅ PASSED
**GitHub Actions CI run (final):** https://github.com/Saikumar-bali/AAGAM_E-commerce/actions/runs/28324231509 — ✅ PASSED

---

## 1. Problem

The existing 4 migration files (`init`, `add_store_is_active`, `add_google_auth_fields`, `phase1_security_inventory`) are **incomplete**. Many schema changes were applied locally via `prisma db push` without creating migration files. This means:

- `prisma migrate deploy` (the production-safe way to apply schema changes) would produce a database that does **not** match what the application expects.
- CI used `prisma db push` as a workaround, which is explicitly forbidden by the architect protocol clause 9: *"Do not rely on production `db push` as the main release method."*
- Any production deployment relying on `migrate deploy` would fail with missing columns, tables, and enum values.

## 2. Migration Audit

Comparing `schema.prisma` against the combined output of all 4 existing migrations reveals **3 missing tables, 3 missing enums, 20+ missing columns, and 4 missing enum values**:

| Category | Schema Object | Status in Migrations | Migration |
|----------|-------------|----------------------|-----------|
| **User** | `fcmToken String?` | ❌ Missing | Added in phase_1_1_catchup |
| **OrderStatus** | `PAYMENT_PENDING` | ❌ Missing | Added in phase_1_1_catchup |
| **OrderStatus** | `PAYMENT_FAILED` | ❌ Missing | Added in phase_1_1_catchup |
| **OrderStatus** | `PACKED` | ❌ Missing | Added in phase_1_1_catchup |
| **OrderStatus** | `RIDER_ASSIGNED` | ❌ Missing | Added in phase_1_1_catchup |
| **Order** | `currency`, `subtotal`, `deliveryFee`, `discountAmount`, `taxAmount`, `grandTotal` | ❌ Missing | Added in phase_1_1_catchup |
| **Order** | `idempotencyKey` (unique) | ❌ Missing | Added in phase_1_1_catchup |
| **Order** | `customerSnapshot`, `addressSnapshot`, `itemsSnapshot`, `pricingSnapshot` | ❌ Missing | Added in phase_1_1_catchup |
| **Order** | `confirmedAt`, `pickingAt`, `packedAt`, `riderAssignedAt`, `outForDeliveryAt`, `deliveredAt`, `cancelledAt`, `paymentFailedAt` | ❌ Missing | Added in phase_1_1_catchup |
| **CustomerAddress** | Entire table (14 columns + FK) | ❌ Missing | Created in phase_1_1_catchup |
| **Payment** | Entire table (11 columns + FK + enums) | ❌ Missing | Created in phase_1_1_catchup |
| **PaymentMethod** | `ONLINE`, `COD` | ❌ Missing | Created in phase_1_1_catchup |
| **PaymentStatus** | `CREATED`, `CAPTURED`, `FAILED`, `PENDING_COD` | ❌ Missing | Created in phase_1_1_catchup |
| **OrderStatusHistory** | Entire table (8 columns + FK + index) | ❌ Missing | Created in phase_1_1_catchup |
| **RiderLocationPing** | Entire table (9 columns + 2 FKs + 2 indexes) | ❌ Missing | Created in phase_1_1_catchup |

**Already present in migrations (no action needed):**
- `User` base columns (id, email, password, phone, name, role, timestamps) — init migration ✓
- `User.googleSub`, `avatarUrl`, `emailVerified` — add_google_auth_fields ✓
- `Store.isActive` — add_store_is_active ✓
- `Store.deletedAt` — phase1 inventory ✓
- `Product.isActive`, `deletedAt` — phase1 inventory ✓
- `InventoryLedger` + `InventoryAdjustmentReason` — phase1 inventory ✓

### Enum Duplicate-Value Risk

The initial migration used plain `ALTER TYPE "OrderStatus" ADD VALUE '...'` for the 4 missing enum values. This fails on databases where those values already exist (e.g. a database previously managed with `prisma db push` that already has `PAYMENT_PENDING`, `PAYMENT_FAILED`, `PACKED`, and `RIDER_ASSIGNED` in the `OrderStatus` enum).

**Fix:** Changed to `ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS '...'` for all 4 values. This silently skips values that already exist. Supported since PostgreSQL 9.3; the project requires 12+.

## 3. Migration Strategy

### New Migration: `20260628010000_phase_1_1_catchup`

**File:** `packages/database/prisma/migrations/20260628010000_phase_1_1_catchup/migration.sql`

**Design principles:**
- **Data-safe:** All `ALTER TABLE` use `IF NOT EXISTS` or guarded `DO` blocks. No `DROP`, no `DELETE`, no `ALTER COLUMN` that would truncate.
- **Idempotent where practical:** `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ALTER TABLE ADD COLUMN IF NOT EXISTS` are used throughout.
- **Enum add-value safety:** `ALTER TYPE ... ADD VALUE IF NOT EXISTS` prevents failure when enum values already exist (e.g., databases previously managed with `db push`). Supported since PostgreSQL 9.3; project requires 12+.
- **PostgreSQL 12+ required:** `ALTER TYPE ... ADD VALUE` inside a transaction is supported from PostgreSQL 12 onward.
- **One migration, not multiple:** A single catch-up migration is cleaner than 3+ partial fixes, easier to review and roll back.

### Production Baseline

For production databases that were previously managed with `prisma db push`:
```bash
# 1. Mark existing migrations as applied (do this once)
npx prisma migrate resolve --applied 20260418064051_init
npx prisma migrate resolve --applied 20260422131532_add_store_is_active
npx prisma migrate resolve --applied 20260523103500_add_google_auth_fields
npx prisma migrate resolve --applied 20260628000000_phase1_security_inventory

# 2. Apply the new catchup migration
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma

# 3. Verify
npx prisma migrate status --schema packages/database/prisma/schema.prisma
```

For a **fresh database** (CI, new deployment):
```bash
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
```
This applies all 5 migrations in order. The `_prisma_migrations` table is created automatically.

### Local Dev Database

For the local dev database (which was set up with `db push`):
```bash
# Mark all 4 old migrations as applied
npx prisma migrate resolve --applied 20260418064051_init
npx prisma migrate resolve --applied 20260422131532_add_store_is_active
npx prisma migrate resolve --applied 20260523103500_add_google_auth_fields
npx prisma migrate resolve --applied 20260628000000_phase1_security_inventory

# Apply the catchup migration
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma

# Or for a full reset (if you can lose data):
npx prisma migrate reset --force --schema packages/database/prisma/schema.prisma
```

## 4. CI Changes

**File:** `.github/workflows/ci.yml`

The test job now uses `prisma migrate deploy` instead of `prisma db push`:

```yaml
- name: Apply all migrations to test database
  run: npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
```

Additional CI verification steps added:
```yaml
- name: Validate Prisma schema
  run: npx prisma validate --schema packages/database/prisma/schema.prisma

- name: Verify migration status
  run: npx prisma migrate status --schema packages/database/prisma/schema.prisma
```

## 5. Migration Verification Commands

| Command | Purpose |
|---------|---------|
| `npx prisma validate --schema packages/database/prisma/schema.prisma` | Validate schema syntax |
| `npx prisma migrate status --schema packages/database/prisma/schema.prisma` | Check which migrations are pending |
| `npx prisma migrate deploy --schema packages/database/prisma/schema.prisma` | Apply pending migrations (production-safe) |
| `npx prisma generate --schema packages/database/prisma/schema.prisma` | Generate Prisma client |
| `npm run test:ci --workspace=apps/api-gateway` | Run CI-safe tests |
| `npx turbo build --force` | Full project build (no cache) |

These are also available as package.json scripts:
- `npm run db:migrate:deploy` (in `packages/database`)
- `npm run db:migrate:status`
- `npm run db:validate`
- `npm run db:verify` (validate + status combo)
- `npm run db:migrate:prod` (root level)

## 6. Files Changed

| File | Summary |
|------|---------|
| `packages/database/prisma/migrations/20260628010000_phase_1_1_catchup/migration.sql` | New catch-up migration (161 lines, all additive). Later updated to use `ALTER TYPE ... ADD VALUE IF NOT EXISTS` for enum safety (lines 11-14). |
| `.github/workflows/ci.yml` | Replaced `db push` with `migrate deploy` + validation steps |
| `packages/database/package.json` | Added `db:migrate:deploy`, `db:migrate:status`, `db:migrate:reset`, `db:validate`, `db:verify` scripts |
| `package.json` | Updated `railway:start:api` to use `db:migrate:prod` instead of `db:push:prod` |
| `docs/ai-runs/2026-06-28_phase-1-security-inventory-foundation.md` | Replaced migration-drift limitation with reference to Phase 1.1 |

## 7. Local Verification

Before push, the following commands were run and passed:

| Command | Result |
|---------|--------|
| `npx prisma validate --schema packages/database/prisma/schema.prisma` | ✅ Valid |
| `npx turbo build --force` | ✅ 7/7 tasks pass |
| `npm run test:ci --workspace=apps/api-gateway` | ✅ 9/9 pass |

## 8. CI Status

- **Initial Run URL:** https://github.com/Saikumar-bali/AAGAM_E-commerce/actions/runs/28323829429 — ✅ PASSED
- **Final Run URL:** https://github.com/Saikumar-bali/AAGAM_E-commerce/actions/runs/28324231509 — ✅ PASSED
- **Status:** ✅ PASSED — Build job passed, Service Tests job passed (9/9 tests)
- **Migration method:** `prisma migrate deploy` (all 5 migrations applied in order)

## 9. Commands Run

```bash
# Branch management
git checkout -b phase-1-1-database-migration-release-safety

# Audit migration drift
npx prisma migrate diff --from-empty --to-schema-datamodel packages/database/prisma/schema.prisma --script

# Validate
npx prisma validate --schema packages/database/prisma/schema.prisma

# Build
npx turbo build --force

# Test
npm run test:ci --workspace=apps/api-gateway

# Push initial
git push -u origin phase-1-1-database-migration-release-safety

# --- Enum safety fix iteration ---

# Fix enum ADD VALUE to use IF NOT EXISTS
# (edit migration.sql: ALTER TYPE ... ADD VALUE → ALTER TYPE ... ADD VALUE IF NOT EXISTS)

# Validate fix
npx prisma validate --schema packages/database/prisma/schema.prisma

# Baseline local db push-managed database for verification
npx prisma migrate resolve --applied 20260418064051_init --schema packages/database/prisma/schema.prisma
npx prisma migrate resolve --applied 20260422131532_add_store_is_active --schema packages/database/prisma/schema.prisma
npx prisma migrate resolve --applied 20260523103500_add_google_auth_fields --schema packages/database/prisma/schema.prisma
npx prisma migrate resolve --applied 20260628000000_phase1_security_inventory --schema packages/database/prisma/schema.prisma

# Apply catchup migration
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma

# Verify
npx prisma migrate status --schema packages/database/prisma/schema.prisma

# Test & build
npm run test:ci --workspace=apps/api-gateway
npx turbo build --force

# Push final
git push
```

## 10. Remaining Risks

1. **PostgreSQL 12+ required:** The migration uses `ALTER TYPE ... ADD VALUE IF NOT EXISTS` which requires PostgreSQL 12+ for the transaction context (the `IF NOT EXISTS` syntax itself is available since PG 9.3). If running on PostgreSQL 9.6-11, the migration will fail. In that case, run the enum additions outside a transaction: `ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_PENDING'` (separate connections), then re-run `migrate deploy`.
2. **Existing data in new NOT NULL columns:** `Order.currency`, `subtotal`, `deliveryFee`, `discountAmount`, `taxAmount`, `grandTotal` have `NOT NULL DEFAULT` values, which is safe for existing rows.
3. **Production baseline:** If the production database was managed with `db push`, the 4 existing migrations must be baselined using `prisma migrate resolve --applied` before `migrate deploy` can work. This is a one-time manual step per environment.
4. **Enum value ordering:** `ALTER TYPE ... ADD VALUE IF NOT EXISTS` appends values at the end. If the application code depends on a specific ordering (unlikely for PG enums), verify behavior. No existing enum values are reordered.
5. **Migration file naming collision:** The timestamp `20260628010000` is after the phase 1 migration (`20260628000000`). If a migration with a timestamp between these was created elsewhere, reorder accordingly.
