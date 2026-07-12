# Phase 3 Security Patch — Local Tester Runbook

This runbook verifies the fixes for GitHub issues #30–#34 on the exact Phase 3 branch.

## Rules

- Use an isolated local database only.
- Do not test deleted-user behavior with a production account.
- Do not commit `.env`, passwords, cookies, JWTs, database URLs, or screenshots containing secrets.
- Redact cookie values, bearer tokens, payment identifiers, customer information, and OTP values before uploading evidence.
- Record `PASS`, `PARTIAL`, or `FAIL` honestly for every scenario.
- Test the exact commit printed by `git rev-parse HEAD`.

## 1. Pull the exact branch

```bash
git fetch origin
git checkout phase-3-delivery-exceptions-cod-returns
git pull origin phase-3-delivery-exceptions-cod-returns
git status
git rev-parse HEAD
```

Expected:

- working tree is clean;
- branch is `phase-3-delivery-exceptions-cod-returns`;
- the commit matches the latest PR #24 head.

Record the SHA in every issue report.

## 2. Configure the local environment

Use a local `.env` based on `.env.example`.

Required minimum:

```dotenv
NODE_ENV=development
PORT=3005
DATABASE_URL=postgresql://LOCAL_USER:LOCAL_PASSWORD@localhost:5432/aagam_ecom?schema=public
JWT_SECRET=<strong local test secret>
DELIVERY_OTP_SECRET=<different strong local test secret>
DELIVERY_OTP_REQUIRED=true
COD_COLLECTION_REQUIRED=true
NEXT_PUBLIC_API_URL=http://localhost:3005
```

For headed Playwright, set the local QA accounts in the terminal environment. Do not add real values to a committed file.

Linux/macOS:

```bash
export QA_ADMIN_EMAIL='<admin QA email>'
export QA_ADMIN_PASSWORD='<admin QA password>'
export QA_CUSTOMER_EMAIL='<customer QA email>'
export QA_CUSTOMER_PASSWORD='<customer QA password>'
export QA_STORE_EMAIL='<store QA email>'
export QA_STORE_PASSWORD='<store QA password>'
export QA_RIDER_EMAIL='<rider QA email>'
export QA_RIDER_PASSWORD='<rider QA password>'
```

PowerShell:

```powershell
$env:QA_ADMIN_EMAIL='<admin QA email>'
$env:QA_ADMIN_PASSWORD='<admin QA password>'
$env:QA_CUSTOMER_EMAIL='<customer QA email>'
$env:QA_CUSTOMER_PASSWORD='<customer QA password>'
$env:QA_STORE_EMAIL='<store QA email>'
$env:QA_STORE_PASSWORD='<store QA password>'
$env:QA_RIDER_EMAIL='<rider QA email>'
$env:QA_RIDER_PASSWORD='<rider QA password>'
```

## 3. Install, migrate, build, and run automated gates

From the repository root:

```bash
npm install
npx prisma validate --schema=packages/database/prisma/schema.prisma
npx prisma generate --schema=packages/database/prisma/schema.prisma
npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
npx prisma migrate status --schema=packages/database/prisma/schema.prisma
npm run test:security --workspace=apps/api-gateway
npm run test:phase3 --workspace=apps/api-gateway
npm test --workspace=apps/api-gateway
npm run test:phase3 --workspace=AagamPartners
npx turbo build --force
```

Expected:

- schema validates;
- all migrations apply and status reports up to date;
- focused security suite passes;
- Phase 3 API suite passes;
- full API regression passes;
- Partners tests pass;
- monorepo build passes.

Optional Android build:

```bash
cd apps/mobile-partners/android
gradle assembleDebug --no-daemon --stacktrace
```

## 4. Start the local applications

Terminal 1:

```bash
npm run dev --workspace=apps/api-gateway
```

Expected API:

```text
http://localhost:3005
```

Terminal 2:

```bash
npm run dev --workspace=apps/admin-dashboard
```

Expected dashboard:

```text
http://localhost:3001
```

Keep both terminal logs available for evidence, but redact secrets and raw tokens.

## 5. Headed browser regression

```bash
npx playwright test --project=phase-3-delivery-operations --headed
npx playwright test --project=phase-1-notifications --headed
```

The login helpers now require:

- an HttpOnly `access_token` cookie;
- no `access_token` in browser localStorage.

Capture the terminal summary and screenshots. A screenshot alone is not proof of authentication behavior; include the browser storage/network evidence described below.

---

# Scenario #30 — deleted users must lose access immediately

Use a temporary Customer account created only for this test.

## Steps

1. Sign in through the web login page.
2. Confirm `/auth/me` returns `200` before deletion.
3. Record the temporary user ID.
4. Delete that temporary user from the isolated local database.
5. Without logging out or clearing cookies, call `/auth/me` again.
6. Repeat using the temporary account's native bearer token from `/auth/mobile/login` if testing the mobile contract.

Example database lookup/delete must be performed carefully using your preferred PostgreSQL client. Verify the email before deleting.

## Expected

- before deletion: `/auth/me` returns `200`;
- after deletion: cookie request returns `401`;
- after deletion: bearer-token request returns `401`;
- no fallback user object is returned from JWT claims;
- Admin/Rider/Store role permissions cannot survive deletion.

## Required evidence

- sanitized request and response before deletion;
- database evidence that the temporary record was deleted;
- sanitized `401` responses after deletion;
- API log showing rejection without printing the token.

---

# Scenario #31 — web cookie session and native bearer session separation

## Browser checks

1. Clear site data for `localhost:3001` and `localhost:3005`.
2. Sign in through `http://localhost:3001/login`.
3. Inspect the `/auth/login` network response.
4. Open DevTools → Application → Cookies.
5. Open DevTools → Application → Local Storage.
6. Refresh a protected page.
7. Log out and retry a protected API request.

## Expected browser behavior

- `/auth/login` response contains `message` and `user` only;
- response JSON does not contain `access_token`;
- cookie `access_token` exists and has `HttpOnly=true`;
- localStorage contains role/name/email/avatar only and no `access_token`;
- protected API calls work using the cookie;
- browser refresh preserves the authenticated session;
- logout clears the cookie;
- protected request after logout returns `401`.

## Native contract checks

Use a temporary QA account and do not expose the returned token in uploaded evidence.

```bash
curl -sS -X POST http://localhost:3005/auth/mobile/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<qa email>","password":"<qa password>"}'
```

Expected:

- `/auth/mobile/login` returns `user` and `access_token`;
- `/auth/login` does not return a token;
- Partners login still works;
- the Partners app stores the bearer credential in platform Keychain, not browser localStorage;
- raw tokens are absent from screenshots and logs.

---

# Scenario #32 — store payload allowlisting

Use an existing local store and an Admin web session.

## Unsupported-field attack

Send a PATCH containing fields that must never be accepted:

```bash
curl -i -X PATCH http://localhost:3005/stores/<STORE_ID> \
  -H 'Content-Type: application/json' \
  -H 'Cookie: access_token=<REDACTED_LOCAL_COOKIE>' \
  -d '{"ownerId":"other-user-id","deletedAt":"2026-01-01T00:00:00.000Z"}'
```

Do not upload the actual cookie value.

## Expected

- response is `400`;
- message identifies non-whitelisted properties;
- store `ownerId` is unchanged;
- store `deletedAt` is unchanged.

## Legitimate update

```bash
curl -i -X PATCH http://localhost:3005/stores/<STORE_ID> \
  -H 'Content-Type: application/json' \
  -H 'Cookie: access_token=<REDACTED_LOCAL_COOKIE>' \
  -d '{"name":"QA Updated Store Name"}'
```

Expected:

- response is `200`;
- only the allowed name field changes;
- malformed coordinates and invalid data types return `400`.

Restore the original store name after testing.

---

# Scenario #33 — payment ownership/IDOR protection

Prepare:

- Customer A with Order A and a Payment record;
- Customer B with a different account.

## Steps

1. Sign in as Customer A.
2. Request `GET /payments/<ORDER_A_ID>`.
3. Sign out.
4. Sign in as Customer B.
5. Request the same `GET /payments/<ORDER_A_ID>`.
6. Sign in again as Customer A and repeat the own-order request.

## Expected

- Customer A own payment request returns `200`;
- Customer B request for Order A returns `403`;
- the `403` response does not include payment amount, method, status, refunds, or customer information;
- Customer A still receives the correct payment/refund result;
- capture/fail ownership protection remains unchanged.

## Required evidence

- sanitized status and response for Customer A;
- sanitized `403` for Customer B;
- order ownership query showing A owns the order;
- no raw cookies, tokens, payment gateway secrets, or unnecessary customer data.

---

# Scenario #34 — credentialed Admin WebSocket

## Admin Riders page

1. Sign in as Admin through the browser.
2. Open `/admin/riders`.
3. Inspect DevTools Network → WS.
4. Check API terminal logs.
5. Produce or simulate one valid rider-location update using the normal test workflow.

## Admin Orders page

1. Open `/admin/orders` with the same Admin session.
2. Inspect the Socket.IO connection.
3. Produce a normal order update using local QA data.

## Expected

- connection targets API port `3005` or the configured `NEXT_PUBLIC_API_URL`;
- browser sends the HttpOnly cookie through the credentialed Socket.IO handshake;
- API logs show the Admin authenticated;
- `joinAdminMonitor` and `joinAdminOrders` are accepted;
- logs do not show `Connection rejected: no token` for the signed-in Admin;
- Rider updates reach the Admin Riders page;
- order events reach the Admin Orders page;
- browser localStorage still has no JWT;
- console has no uncaught Socket.IO connection error.

## Evidence

- Network WS/Socket.IO entry with cookie/token value redacted;
- sanitized API log showing authenticated Admin and room join;
- before/after UI screenshot for a real-time update;
- browser console screenshot showing no connection failure.

---

# Regression smoke after security testing

Verify these still work:

- Admin login and navigation;
- Customer login, shop, cart, orders, and notification centre;
- Store Owner login and Store Operations;
- Rider login and Rider Operations;
- web logout;
- Partners native login;
- background notification settings page;
- Admin Riders and Orders pages;
- Phase 3 OTP/COD/return screens.

# Evidence template for issues #30–#34

```text
Status: PASS | PARTIAL | FAIL
Issue:
Commit tested:
Branch:
Date/time and timezone:
OS/browser/device:
API URL:
Dashboard URL:
Database:
Automated commands and results:
Manual setup:
Steps performed:
Expected result:
Actual result:
HTTP/socket status:
Database verification:
Screenshots/logs/recordings:
Secrets redacted: YES | NO
Regression result:
Defects found:
```

Add evidence to the matching GitHub issue. Keep an issue open when any required step is missing or when the result is only terminal/unit-test proof.
