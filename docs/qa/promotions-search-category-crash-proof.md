# AAGAM Promotion, Search, and Category Regression Proof

Branch: `agent/fix-promotions-search-category-crash`

This checkpoint covers three reported regressions:

1. An admin-created promotion must reach the customer feed when it is
   published and assigned to a customer placement.
2. The customer mobile app must not request `/products` for every typed
   character. Search requests are debounced and use the final normalized
   query; the keyboard Search action runs the query immediately.
3. Switching from a category to `All` must not crash the customer app.

## Root causes

- New campaign forms used `DRAFT` as their default. The customer API correctly
  excludes drafts, so a successful admin save could be invisible to customers.
  Date and placement filters still apply.
- `ShopScreen` used the raw `query` in the React Query key. Every
  `onChangeText` event therefore created a new product request.
- `ShopScreen` reused one `FlatList` while switching between a section list and
  `numColumns={2}`. React Native does not support changing `numColumns` on an
  existing list instance; the category-to-All transition could crash.

## Code changes

- `apps/api-gateway/src/promotions/promotion-scheduling.ts`
- `apps/api-gateway/src/promotions/promotion-scheduling.spec.ts`
- `apps/api-gateway/src/promotions/promotions.service.ts`
- `apps/admin-dashboard/src/app/(admin)/admin/promotions/page.tsx`
- `apps/mobile-customer/src/screens/customer/ShopScreen.tsx`
- `apps/mobile-customer/src/screens/customer/ShopScreen.behavior.spec.ts`
- `apps/mobile-customer/src/utils/shopSearch.ts`
- `apps/mobile-customer/src/utils/shopSearch.spec.ts`
- `apps/admin-dashboard/e2e/public-promotions.spec.ts`

## Required CLI-AI/device proof before merge

Do not include credentials, OTPs, bearer tokens, cookies, or full phone
numbers in logs, screenshots, artifacts, or this document.

### Automated checks

```bash
npm ci
npm run build:api
npx prisma validate --schema packages/database/prisma/schema.prisma
npm test --workspace=@aagam/api-gateway -- --runInBand
npm run typecheck --workspace=AagamCustomer
npm test --workspace=AagamCustomer -- --runInBand
git diff --check
```

### Admin/customer web proof

```bash
npm run start:prod --workspace=@aagam/api-gateway > /tmp/aagam-api-gateway.log 2>&1 &
API_PID=$!
trap 'kill "$API_PID" 2>/dev/null || true' EXIT
curl --fail --retry 30 --retry-delay 2 --retry-connrefused http://localhost:3005/health >/dev/null

npx playwright test --config=apps/admin-dashboard/playwright.config.ts \
  --project=chromium apps/admin-dashboard/e2e/public-promotions.spec.ts
```

Record:

- the admin creation request omits lifecycle status, exercising the publish-by-default path;
- the customer `/shop` feed displays the resulting campaign;
- selected placement is `HOME_HERO` or `HOME_TODAY_OFFERS`;
- customer `/shop` displays the campaign title;
- an expired campaign is not displayed;
- screenshots under `docs/qa/promotions-search-category-crash/`.

### Customer Android proof

```bash
cd apps/mobile-customer/android
./gradlew assembleRelease
cd ../../..
adb install -r apps/mobile-customer/android/app/build/outputs/apk/release/app-release.apk
adb shell pm clear com.aagamcustomer
adb shell monkey -p com.aagamcustomer -c android.intent.category.LAUNCHER 1
adb logcat -c
```

Using a customer test account, capture:

1. the published promotion on the Shop screen;
2. the product request count while typing a multi-letter query (there should
   be no request for each intermediate character);
3. category selected, followed by `All`, with the catalog still visible;
4. the first fatal-exception block from filtered logcat, if any.

Suggested redacted evidence commands:

```bash
adb logcat -d -t 500 | grep -E "FATAL EXCEPTION|AndroidRuntime|ShopScreen|ReactNativeJS"
```

Expected result: no fatal exception during category → All, and no new
`FATAL EXCEPTION` block after the interaction.

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| Promotion lifecycle/controller tests | PASS — 6/6 | `apps/api-gateway` Jest |
| Customer mobile search/category contracts | PASS — 4/4 new tests | `ShopScreen.behavior.spec.ts`, `shopSearch.spec.ts` |
| Customer mobile typecheck | PASS | `npm run typecheck --workspace=AagamCustomer` |
| Customer mobile Jest suites | PASS — 4 suites, 8/8 | `npm run test --workspace=AagamCustomer -- --runInBand` |
| API build | PASS | `npm run build --workspace=@aagam/api-gateway` |
| Admin production build | PASS | `npm run build --workspace=@aagam/admin-dashboard` |
| Prisma schema validation | PASS with local dummy URL | `DATABASE_URL=... npx prisma validate` |
| Category → All mobile device flow | Pending device run |  |
| Customer Android release build | Pending device/CI run |  |
| Customer web promotion/default-publish flow | Pending Playwright run | `public-promotions.spec.ts` |
| Customer mobile lint | BLOCKED — no ESLint config in baseline package | `npm run lint --workspace=AagamCustomer` |
| Direct admin TypeScript check | BLOCKED by baseline React/Lucide type mismatch | Next build type validation remains disabled in baseline config |
| `git diff --check` | PASS | `git diff --check` |

## Remaining limitation

This repository checkout does not have an Android emulator or physical device,
so release APK installation, request-count inspection, and logcat proof must be
completed by CLI-AI/GitHub Actions or on the supplied Android test device before
the PR is merged.
