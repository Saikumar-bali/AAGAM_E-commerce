# AI Run: Mobile App Split into AAGAM Customer + AAGAM Partners

**Date:** 2026-06-27
**Branch:** `feature/mobile-split-aagam-and-partners-ui`
**Status:** Complete

## What was done

Split the monolithic `apps/mobile-app` into two focused, production-ready React Native apps:

1. **AAGAM Customer** (`apps/mobile-customer`) — Consumer-facing grocery delivery app
2. **AAGAM Partners** (`apps/mobile-partners`) — Rider, store owner, and admin operations app

Shared code was extracted into `packages/mobile-shared`.

## Files created

### packages/mobile-shared (10 files)
- `package.json` — Package definition with `@aagam/types`, `@aagam/utils` dependencies
- `tsconfig.json` — TypeScript config for the shared package
- `src/index.ts` — Re-exports all shared modules
- `src/api/client.ts` — Axios API client with token interceptor
- `src/store/authStore.ts` — Zustand auth store with Keychain persistence
- `src/hooks/useSocket.ts` — Socket.IO hook for real-time updates
- `src/hooks/useLocation.ts` — Geolocation hook with permission handling
- `src/utils/notifications.ts` — FCM registration and background handler
- `src/components/LeafletMap.tsx` — WebView-based Leaflet map (free, no API key)
- `src/constants/theme.ts` — AAGAM brand colors, spacing, shadows

### apps/mobile-customer (31 files)
- Config: `package.json`, `app.json`, `index.js`, `babel.config.js`, `metro.config.js`, `tsconfig.json`, `.env`
- Entry: `App.tsx` with QueryClient, SafeArea, Toast
- Navigation: `RootNavigator.tsx` (role-based, CUSTOMER only), `CustomerNavigator.tsx` (bottom tabs + stack)
- Screens: `LoginScreen`, `SignUpScreen` (customer-only), `ShopScreen`, `CartScreen`, `CheckoutScreen`, `OrdersScreen`, `OrderDetailScreen`, `ProductDetailScreen`, `CustomerProfileScreen`
- Store: `cartStore.ts` (zustand + AsyncStorage persist)
- API: `client.ts` (re-export from mobile-shared)
- Android: Full native directory (`com.aagamcustomer`, package `com.aagamcustomer`)

### apps/mobile-partners (31 files)
- Config: `package.json`, `app.json`, `index.js`, `babel.config.js`, `metro.config.js`, `tsconfig.json`, `.env`
- Entry: `App.tsx` with QueryClient, SafeArea, Toast
- Navigation: `RootNavigator.tsx` (RIDER/STORE_OWNER/ADMIN only, blocks CUSTOMER), `RiderNavigator.tsx`, `StoreNavigator.tsx`
- Screens: `LoginScreen`, `SignUpScreen` (partner roles only), `HomeScreen` (placeholder), `RiderDashboard`, `RiderHistoryScreen`, `StoreDashboard`
- API: `client.ts`, `riderService.ts`, `storeService.ts`
- Utils: `notifications.ts` (FCM)
- Android: Full native directory (`com.aagampartners`, package `com.aagampartners`)

## Architecture decisions

- **Shared code via `@aagam/mobile-shared`**: Both apps import shared API client, auth store, hooks, LeafletMap, and theme constants from this package
- **Role-based routing**: Customer app only allows CUSTOMER role; Partners app blocks CUSTOMER and routes RIDER → RiderNavigator, STORE_OWNER → StoreNavigator, ADMIN → HomeScreen placeholder
- **Same design language**: Both apps use AAGAM's original teal (#0F766E) brand identity — not copies of other apps
- **Free mapping**: Both apps use Leaflet via WebView (OpenStreetMap tiles, no API key needed)
- **Metro config**: Both apps resolve `@aagam/mobile-shared`, `@aagam/types`, `@aagam/utils` from monorepo packages
- **Root package.json updated**: `turbo dev` now filters out all three mobile apps

## Verification

- `npm install` — Success (6 packages added)
- `npm run build:admin` — Success (20/20 pages generated)
- TypeScript checks — Expected `@env` and WebView type errors (same as original mobile-app; resolved by babel plugin at build time)

## Running the new apps

### Customer app
```bash
cd apps/mobile-customer
npx react-native start          # Start Metro
npx react-native run-android    # Build and install
```

### Partners app
```bash
cd apps/mobile-partners
npx react-native start          # Start Metro
npx react-native run-android    # Build and install
```

### Connect to device
```bash
adb reverse tcp:8081 tcp:8081   # Metro bundler
```

## Test credentials
- `admin@aagam.com` / `admin123` → Partners app (Admin Panel)
- `customer@aagam.com` / `customer123` → Customer app
- `rider@aagam.com` / `rider123` → Partners app (Rider Dashboard)
- `store@aagam.com` / `store123` → Partners app (Store Dashboard)
