# Phase 2 — Money, Orders, Payments, Refund Correctness

**Date:** 2026-06-28
**Branch:** `phase-2-money-orders-payments-correctness`
**Base commit:** `6ad3850c6bec6eb34859769423ad7a5e3ec80c1a`
**Final commit:** `acedadd296f2775845c207b78f3356b1d9cb7deb`
**GitHub Actions CI run:** https://github.com/Saikumar-bali/AAGAM_E-commerce/actions/runs/28325099660

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
| `CAPTURED → REFUND_PENDING` | Cancellation after capture | Creates Refund record |
| `CAPTURED → CAPTURED` | Duplicate capture | Idempotent — returns success |
| `FAILED → FAILED` | Duplicate fail | Idempotent — returns success |
| `REFUND_PENDING → REFUNDED` | (Future: real gateway) | — |

### Refund Lifecycle

```
PENDING ──→ PROCESSED (future: real gateway)
  │
  └──→ FAILED
```

### Cancellation Money Behavior

| Payment Status | Cancellation Action |
|---------------|-------------------|
| `CAPTURED` | Creates Refund (PENDING), marks payment REFUND_PENDING |
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
- Refund amount cannot exceed captured payment amount (application-enforced)
- Multiple refunds must not exceed captured amount

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
| `apps/api-gateway/src/orders/order.service.ts` | Cancellation creates refund for CAPTURED payments, imports refund-related types |
| `apps/api-gateway/src/payments.spec.ts` | New: 18 tests covering money, checkout, payment, refund, inventory regression |
| `apps/api-gateway/package.json` | Updated `test:ci` pattern to include `payments.spec.ts` |

---

## 6. Commands Run

| Command | Result |
|---------|--------|
| `npx prisma validate` | ✅ Valid |
| `npx prisma migrate deploy` | ✅ Applied |
| `npx prisma generate` | ✅ Generated |
| `npm run test:ci --workspace=apps/api-gateway` | ✅ 27/27 pass (9 inventory + 18 payments) |
| `npx turbo build --force` | ✅ 7/7 tasks pass |

---

## 7. Tests Added (18 tests)

### Money (4 tests)
- Paise conversion from product prices
- No floating point rounding bug
- Grand total calculation formula
- Negative grand total rejection (via nonexistent order scenario)

### Quantity Validation (2 tests)
- Zero quantity rejected
- Negative quantity rejected

### Checkout (4 tests)
- Pricing snapshot stored with all required fields
- Order totals immutable after product price changes
- Insufficient inventory rejected
- Payment amount equals order amount

### Payment Lifecycle (4 tests)
- COD creates PENDING_COD payment
- Online payment capture success
- Failed payment sets PAYMENT_FAILED
- Duplicate capture is idempotent

### Refund (3 tests)
- Captured payment cancellation creates refund
- COD cancellation creates no refund
- Refund amount cannot exceed captured amount

### Inventory Regression (2 tests)
- Checkout still creates CHECKOUT_RESERVATION ledger
- Cancellation still restores inventory and creates ORDER_CANCEL_RESTORE ledger

---

## 8. CI Status

**GitHub Actions Run:** https://github.com/Saikumar-bali/AAGAM_E-commerce/actions/runs/28325099660
**Status:** ✅ PASSED — Build job passed, Service Tests job passed (27/27 tests)

CI runs the following:
- `prisma validate`
- `prisma migrate deploy`
- `prisma migrate status`
- `npm run test:ci`
- `npx turbo build --force`

No `prisma db push` in CI or production scripts.

---

## 9. Known Limitations

1. **Refund processing is not connected to a real gateway.** Refunds are created with `PENDING` status and must be processed externally.
2. **No real-time refund webhook handling.** The `providerRefundId` field is populated only when a real gateway is integrated.
3. **Partial refunds are not yet implemented.** The current cancellation creates a full refund for the entire order amount. Partial refunds would require a more granular API.
4. **Payment idempotency is basic.** The `idempotencyKey` field exists on Payment but is not wired into the simulated capture flow. The capture endpoint checks for CAPTURED status as implicit idempotency.
5. **No Razorpay/Stripe integration.** All payments use the `SIMULATED` provider.
6. **Refund amount cap is enforced at application layer only.** There is no database-level CHECK constraint preventing refunds from exceeding the captured amount.

## 10. Explicit Statement

**No real payment gateway was added.** Payment processing remains simulated via the `POST /payments/simulated/capture` and `POST /payments/simulated/fail` endpoints. The refund model is foundational (stores refund data) but is not connected to any external payment gateway (Razorpay, Stripe, etc.).
