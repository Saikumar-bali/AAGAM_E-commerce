# Phase 1 — Security, Tenancy, Soft Delete, and Inventory Foundation

Base commit: `9613392b92348d0bd0cc7bc9d1c14292160588c2`

## Goal

Make the existing quick-commerce foundation safer before adding more features.

This phase covers only:

1. RBAC and protected route correctness.
2. Store-owner tenancy checks.
3. Soft-delete behavior for business records.
4. Inventory ledger/audit trail.
5. Focused backend tests and proof.

## Do not start in this phase

- Payment gateway integration.
- Coupons/promotions.
- Loyalty/reviews.
- Final Zomato/Blinkit-style UI redesign.
- Rider earnings.
- Support/ticketing.
- Large analytics dashboards.
- Unrelated refactors.

## Required work

### 1. RBAC audit and fixes

Check every controller route that uses role restrictions. A route with `@Roles(...)` must also have the correct guards.

Inspect carefully:

- `GET /auth/users`
- Rider admin/profile routes
- `GET /riders/:id`
- `PATCH /riders/:id`
- Store inventory update routes
- Order assignment and status routes
- Tracking routes

Expected behavior:

- Admin routes reject non-admin users.
- Rider routes reject non-rider users unless admin access is explicitly intended.
- Customer-only routes reject rider/store-owner/admin where appropriate.
- Store-owner routes are scoped to the owner’s store only.

### 2. Store-owner tenancy

A store owner must not update another store’s inventory or read restricted data for another store.

Minimum required checks:

- Inventory update verifies ownership unless the user is admin.
- Store-owner order views only return orders for that owner’s store.
- Store-owner tracking access only works for that owner’s store orders.
- Add tests for cross-store access rejection.

### 3. Soft delete for products and stores

Product/store deletion must not remove historical orders or order items.

Minimum required behavior:

- Add `isActive` and/or `deletedAt` fields where needed.
- Product delete hides the product from public listings instead of deleting order history.
- Store delete hides/deactivates the store instead of deleting historical orders.
- Public product/store queries exclude inactive/deleted records by default.
- Admin behavior is documented.

### 4. Inventory ledger

Every stock change must create an audit row.

Minimum required behavior:

- Manual stock update writes a ledger record.
- Checkout stock decrement writes a ledger record.
- Order cancellation stock restore writes a ledger record.
- Ledger writes happen in the same database transaction as inventory changes.
- Ledger includes store, product, quantity change, balance after, reason, actor/reference where available.

Suggested reasons:

- `MANUAL_ADJUSTMENT`
- `CHECKOUT_RESERVATION`
- `ORDER_CANCEL_RESTORE`
- `ORDER_DELIVERED_FINALIZE`
- `STOCK_CORRECTION`

### 5. Tests required

Add focused backend tests for:

- Admin-only route rejects non-admin.
- Rider route rejects wrong role.
- Store-owner cannot update another store’s inventory.
- Product soft delete hides product from public list.
- Store soft delete preserves historical orders.
- Checkout decrements inventory and writes ledger.
- Cancellation restores inventory and writes ledger.

### 6. Migration

- Use Prisma migration for schema changes.
- Keep demo/seed data working.
- Document the migration name and command used.

## Required CLI-AI proof file

Create or update:

`docs/ai-runs/YYYY-MM-DD_phase-1-security-inventory-foundation.md`

It must include:

- Branch name.
- Base commit SHA.
- Final commit SHA.
- Changed files.
- Migration name.
- Commands run and results.
- API checks with masked tokens.
- Playwright screenshots only if UI changed.
- GitHub Actions result after pushing.
- Known failures or limitations.

## Acceptance checklist

This phase is accepted only if:

- No direct push to `main`.
- Build passes.
- Tests pass.
- RBAC issues are fixed.
- Store-owner cross-access is blocked.
- Product/store delete no longer removes historical business records.
- Inventory ledger is written by manual update, checkout, and cancellation.
- Proof file is honest and complete.
