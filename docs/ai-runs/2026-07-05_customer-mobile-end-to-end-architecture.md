# AI Run: Customer Mobile End-to-End Architecture Plan

**Date:** 2026-07-05  
**Branch:** `architect/customer-mobile-end-to-end-plan`  
**Status:** Planning docs committed; implementation not started.

## Request

Complete the separated customer mobile application end-to-end from signup through order placement and order tracking. Work phase by phase, verify from the codebase, and provide local test cases for owner testing.

## Repository findings

- Root workspace includes `apps/*` and `packages/*`.
- `apps/mobile-customer` is the separated customer React Native app.
- `apps/mobile-partners` is the separated rider/store/admin app.
- `packages/mobile-shared` contains shared API client, auth store, socket, location, notification, and map utilities.
- Customer navigation already blocks non-CUSTOMER roles.
- Customer screens already exist for Login, SignUp, Shop, Product Detail, Cart, Checkout, Orders, Order Detail, and Profile.
- Backend checkout already supports quote and place-order endpoints with JWT and CUSTOMER role guard.
- Backend checkout supports an idempotency header, but customer mobile checkout still needs to send it to protect duplicate taps.
- Backend customer address controller supports list, create, update, and delete, but current customer mobile profile only lists and creates addresses.

## Files added

- `docs/mobile-customer/PHASE_PLAN_CUSTOMER_APP_END_TO_END.md`
- `docs/cli-ai/CUSTOMER_MOBILE_PHASE_CM_0_TO_CM_1_PROMPT.md`
- `docs/qa/customer-mobile/manual-test-cases.md`

## Recommended next implementation

Start with CM-0 + CM-1 only:

1. Prove current customer app build/runtime baseline.
2. Fix signup/login reliability.
3. Confirm role guard, session restore, and logout.
4. Collect Android build proof and screenshots.

Do not start cart, checkout, or catalog polish until CM-0 + CM-1 passes.

## Owner local testing

Use `docs/qa/customer-mobile/manual-test-cases.md` after each implementation phase. For CM-0 + CM-1, prioritize TC-01 through TC-07.

## Known risks

- TypeScript may fail around environment-module typings if declaration files are missing.
- Android build may reveal native dependency drift from the split app.
- Social login requires valid native/mobile configuration.
- Signup currently collects phone in UI, but the current shared auth function signature does not pass it.
- Address edit/delete exists on backend but not yet exposed in mobile UI.
- Checkout backend supports idempotency, but mobile checkout currently does not send an idempotency header.

## Next status expected from CLI-AI

CLI-AI must return:

- branch name
- commit SHA
- exact changed files
- commands and results
- APK path if Android build passed
- screenshots/logcat proof requested from owner
- known issues
- whether CM-2 can start
