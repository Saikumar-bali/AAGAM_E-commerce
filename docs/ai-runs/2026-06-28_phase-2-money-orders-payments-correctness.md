# Phase 2 — Money, Orders, Payments, Refund Correctness

**Date:** 2026-06-28
**Branch:** `phase-2-money-orders-payments-correctness`
**Base commit:** `6ad3850c6bec6eb34859769423ad7a5e3ec80c1a`
**Final commit:** `2c58327b8f2a35f530b7e4b1b4c80c21d1e9b2b2`
**GitHub Actions CI run:** https://github.com/Saikumar-bali/AAGAM_E-commerce/actions/runs/28325625321

---

## 1. Schema / Migration Summary

**Migration:** `20260628020000_phase2_money_orders_payments`
**Strategy:** Safe additive migration — no drops, no data loss, PostgreSQL 12+ required.

### New Fields (paise-based, integer)

| Table | Field | Type | Backfill |
|-------|-------|------|----------|
| `Product` | `pricePaise` | `Int @default(0)` | `ROUND(price * 100)` |
| `Order` | `subtotalPaise` | `Int @default(0)` | `ROUND(subtotal * 100)` |
| `Order` | `deliveryFeePaise` | `Int @default(0)` | `ROUND(deliveryFee * 100)` |
| `Order` | `discountPaise` | `Int @default(0)` | `ROUND(discountAmount * 100)` |
| `Order` | `taxPaise` | `Int @default(0)` | `ROUND(taxAmount * 100)` |
| `Order` | `grandTotalPaise` | `Int @default(0)` | `ROUND(grandTotal * 100)` |
| `OrderItem` | `unitPricePaise` | `Int @default(0)` | `ROUND(price * 100)` |
| `OrderItem` | `lineTotalPaise` | `Int @default(0)` | `ROUND(price * quantity * 100)` |
| `Payment` | `amountPaise` | `Int @default(0)` | `ROUND(amount * 100)` |
| `Payment` | `idempotencyKey` | `String? @unique` | — |

### New Enum Values

| Enum | Values Added |
|------|-------------|
| `PaymentStatus` | `REFUND_PENDING`, `REFUNDED` |

### New Model: `Refund`

| Field | Type |
|-------|------|
| `id` | `String @id @default(cuid())` |
| `orderId` | `String` (FK → Order) |
| `paymentId` | `String` (FK → Payment) |
| `amountPaise` | `Int` |
| `status` | `RefundStatus @default(PENDING)` |
| `reason` | `String` |
| `providerRefundId` | `String?` |
| `requestedByUserId` | `String?` |
| `processedAt` | `DateTime?` |
| `createdAt` | `DateTime @default(now())` |

### New Enum: `RefundStatus`

Values: `PENDING`, `PROCESSED`, `FAILED`

Old Float fields are preserved for backward compatibility. All new service logic uses paise integers.

---

## 2. Money Model Decision

**Decision:** Use integer paise (paise = INR/100) for all monetary calculations in service logic.

- Product prices have `pricePaise` which is populated during creation/quotes.
- Order totals use `grandTotalPaise = subtotalPaise + deliveryFeePaise + taxPaise - discountPaise`.
- Line totals are `unitPricePaise * quantity`.
- Payment amounts are stored as `amountPaise` and validated against `order.grandTotalPaise`.
- Backfill from existing Float values rounds to nearest integer paise (`ROUND(float * 100)`).

**Rationale:** Eliminates all floating-point rounding errors in financial calculations. Integer arithmetic is deterministic across all platforms. Float fields remain for backward compatibility with existing queries.

---

## 3. Payment / Refund State Machine

### Payment Status Lifecycle

```
CREATED ──→ CAPTURED ──→ REFUND_PENDING ──→ REFUNDED
  │
  └──→ FAILED
  │
PENDING_COD (COD only, no capture)
```

| Transition | Trigger | Validation |
|-----------|---------|-----------|
| `CREATED → CAPTURED` | Simulated capture | Amount must match order grandTotalPaise |
| `CREATED → FAILED` | Simulated fail | Status must be CREATED |
| `CAPTURED → REFUND_PENDING` | Cancellation after capture | Creates Refund record via RefundsService |
| `CAPTURED → CAPTURED` | Duplicate capture | Idempotent — returns success |
| `FAILED → FAILED` | Duplicate fail | Idempotent — returns success |
| `REFUND_PENDING → REFUNDED` | (Future: real gateway) | — |

### Refund Lifecycle

```
PENDING ──→ PROCESSED (future: real gateway)
  │
  └──→ FAILED
```

### Refund Cap Enforcement (`RefundsService.createRefundForPayment`)

The service validates all refund creation:

1. **Payment must exist** — throws `NotFoundException` if not found
2. **Payment must be CAPTURED or REFUND_PENDING** — throws `BadRequestException` otherwise
3. **amountPaise must be a positive integer** — throws `BadRequestException` for zero/negative/non-integer
4. **Cumulative refund cap** — `existingNonFailedRefunds + requestedAmount ≤ payment.amountPaise` — throws `BadRequestException` if exceeded
5. **Duplicate full refund protection** — if `requestedAmount === payment.amountPaise` and there's already a non-failed refund for that amount, throws `BadRequestException`
6. On success, marks payment `REFUND_PENDING` and creates the refund record

This service is used by:
- `OrderService.cancelMyOrder()` — during cancellation transaction
- Future endpoints for manual/partial refunds

### Cancellation Money Behavior

| Payment Status | Cancellation Action |
|---------------|-------------------|
| `CAPTURED` | Creates Refund via `RefundsService.createRefundForPayment()` (PENDING), marks payment REFUND_PENDING |
| `PENDING_COD` | No refund created |
| `FAILED` | No refund created |
| `CREATED` | No refund (order in PAYMENT_PENDING, inventory restored) |

---

## 4. Validation Rules Added

- `grandTotalPaise = subtotalPaise + deliveryFeePaise + taxPaise - discountPaise` (enforced on checkout)
- No negative grand totals
- Item quantity must be positive integer (validated before quote)
- Line totals must match `quantity * unitPricePaise`
- Inventory check before reservation (throws `Insufficient inventory`)
- Payment amount must match order `grandTotalPaise` on capture
- Payment cannot be captured twice (idempotent)
- Refund amount cannot exceed captured payment amount (validated in `RefundsService`)
- Multiple refunds must not exceed captured amount
- Duplicate full refund for same cancelled order is rejected
- Duplicate cancellation on already-cancelled order is rejected

---

## 5. Files Changed

| File | Summary |
|------|---------|
| `packages/database/prisma/schema.prisma` | Added paise fields, Refund model, RefundStatus enum, PaymentStatus values, idempotencyKey |
| `packages/database/prisma/migrations/20260628020000_phase2_money_orders_payments/migration.sql` | New migration: all additive, backfill for existing data |
| `packages/database/src/index.ts` | Added `REFUND_PENDING`, `REFUNDED` to PaymentStatus export; added `RefundStatus` export |
| `apps/api-gateway/src/checkout/checkout.service.ts` | Paise-based calculations, pricing snapshot with all required fields, quantity validation, grand total validation, inventory check |
| `apps/api-gateway/src/payments/payments.service.ts` | Amount validation on capture, idempotent duplicate handling, `getPaymentByOrder`, `getTotalCapturedPaise` |
| `apps/api-gateway/src/payments/payments.controller.ts` | Added `GET payments/:orderId` endpoint |
| `apps/api-gateway/src/payments/refunds.service.ts` | **New** — `createRefundForPayment` with full refund cap enforcement |
| `apps/api-gateway/src/payments/payments.module.ts` | Added `RefundsService` to providers and exports |
| `apps/api-gateway/src/orders/order.service.ts` | Cancellation uses `RefundsService.createRefundForPayment()` instead of direct `tx.refund.create` |
| `apps/api-gateway/src/orders/order.module.ts` | Imports `PaymentsModule` for `RefundsService` access |
| `apps/api-gateway/src/payments.spec.ts` | 20 tests: added refund cap, multiple refunds, duplicate cancellation tests |
| `apps/api-gateway/src/inventory.spec.ts` | Updated `OrderService` constructor for `RefundsService` argument |
| `apps/api-gateway/package.json` | Updated `test:ci` pattern to include `payments.spec.ts` |

---

## 6. Commands Run

| Command | Result |
|---------|--------|
| `npx prisma validate` | ✅ Valid |
| `npx prisma migrate deploy` | ✅ Applied |
| `npx prisma generate` | ✅ Generated |
| `npm run test:ci --workspace=apps/api-gateway` | ✅ 29/29 pass (9 inventory + 20 payments) |
| `npx turbo build --force` | ✅ 7/7 tasks pass |

---

## 7. Tests (20 tests in payments.spec.ts + 9 in inventory.spec.ts)

### Money (4 tests)
- Paise conversion from product prices
- No floating point rounding bug
- Grand total calculation formula
- Unit price * quantity = line total (validated via checkout)

### Quantity Validation (2 tests)
- Zero quantity rejected
- Negative quantity rejected

### Checkout (4 tests)
- Pricing snapshot stored with all required fields
- Order totals immutable after product price changes
- Insufficient inventory rejected
- Payment amount equals order amount (on creation)

### Payment Lifecycle (4 tests)
- COD creates PENDING_COD payment
- Online payment capture success
- Failed payment sets PAYMENT_FAILED
- Duplicate capture is idempotent

### Refund (6 tests)
- Captured payment cancellation creates refund record
- COD cancellation creates no refund
- Refund larger than captured amount is rejected (**new**)
- Multiple refunds cannot exceed captured payment amount (**new**)
- Duplicate cancellation cannot create duplicate refund (**new**)
- First cancellation succeeds, second fails

### Inventory Regression (2 tests)
- Checkout still creates CHECKOUT_RESERVATION ledger
- Cancellation still restores inventory and creates ORDER_CANCEL_RESTORE ledger

---

## 8. CI Status

**GitHub Actions Run:** https://github.com/Saikumar-bali/AAGAM_E-commerce/actions/runs/28325625321
**Status:** ✅ PASSED — Build job passed, Service Tests job passed (29/29 tests)

CI runs the following:
- `prisma validate`
- `prisma migrate deploy`
- `prisma migrate status`
- `npm run test:ci`
- `npx turbo build --force`

No `prisma db push` in CI or production scripts.

---

## 9. Known Limitations

1. **Refund processing is not connected to a real gateway.** Refunds are created with `PENDING` status and must be processed externally via `RefundStatus.PROCESSED`.
2. **No real-time refund webhook handling.** The `providerRefundId` field is populated only when a real gateway is integrated.
3. **Partial refunds are not yet exposed via API.** The `RefundsService` supports partial refunds internally, but only full-order refunds via cancellation are wired. A dedicated refund endpoint would expose partial refunds.
4. **Payment idempotency is basic.** The `idempotencyKey` field exists on Payment but is not wired into the simulated capture flow. The capture endpoint checks for CAPTURED status as implicit idempotency.
5. **No Razorpay/Stripe integration.** All payments use the `SIMULATED` provider.
6. **Refund amount cap is enforced at application layer only.** There is no database-level CHECK constraint preventing refunds from exceeding the captured amount.
7. **Circular dependency risk if PaymentsModule ever imports OrderModule.** Currently no circular dependency exists (verified).

## 10. Explicit Statement

**No real payment gateway was added.** Payment processing remains simulated via the `POST /payments/simulated/capture` and `POST /payments/simulated/fail` endpoints. The refund model is foundational (stores refund data) but is not connected to any external payment gateway (Razorpay, Stripe, etc.).
