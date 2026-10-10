# mobile-web-preview

Browser preview harness for the React Native apps in this monorepo
(`apps/mobile-partners`, `apps/mobile-customer`). It bundles the **real** app
code (`App.tsx`, navigators, screens, `@aagam/mobile-shared`) with
`react-native-web` and serves it through a same-origin `/api` proxy to the
running `api-gateway`.

## Run

```bash
# 1. api-gateway + Redis must be up (see AGENTS.md "Restoring the local stack")
#    gateway listens on :3005, backed by the Supabase DATABASE_URL.
# 2. build + serve the previews
cd mobile-web-preview
./run.sh                     # builds both apps, serves on :12001
```

Then open:

- partners: `http://127.0.0.1:12001/preview/mobile-partners/`
- customer: `http://127.0.0.1:12001/preview/mobile-customer/`

Both are also reachable through the work host proxy
(`https://work-2-<...>.prod-runtime.all-hands.dev/preview/<app>/`).

| env | default | meaning |
| --- | --- | --- |
| `PORT` | `12001` | listen port |
| `API_ORIGIN` | `http://127.0.0.1:3005` | api-gateway origin |
| `STRIP_API_PREFIX` | `1` | forward `/api/foo` as `/foo` (local gateway has no `/api` prefix) |
| `EXPO_PUBLIC_MAPBOX_TOKEN` | – | injected as `window.__ENV__` for the Leaflet/Mapbox maps |

## What the harness does

- `webpack.config.js` bundles TypeScript/JSX from the app + shared packages with
  Babel, targeting the browser. `@env` is aliased to `src/env.js`, populated at
  build time by `DefinePlugin` (`API_URL=/api` so the app talks to the proxy).
- `mocks/navigation.js` reuses the real `@react-navigation/core` builder, so
  route state, params, nested navigators and `useNavigation`/`useRoute` behave
  like the device. `Screen`/`Group` are taken from `createNavigatorFactory` (core
  does not export them from its index).
- `mocks/*.js` shim the native-only modules: `react-native` (re-exports
  `react-native-web` + `PermissionsAndroid`/`NativeModules`), WebView (an
  iframe), geolocation (fixed position), keychain (localStorage), datetimepicker,
  Firebase messaging, toast.
- `react-native-screens` is aliased to `react-native-web`; its only native-stack
  consumer is `NativeStackView.native.js`, which webpack never selects for the
  `web` platform.
- `server.js` proxies `/api/*` and `/socket.io/*` to `API_ORIGIN`, injects
  `window.__ENV__` and an SSE live-reload client, and serves each bundle under
  `/preview/<app>/`.

## Notes / known issues

- `apps/mobile-partners/src/components/StoreKit.tsx` did **not** exist on this
  branch (or on `main`/`bugs`) even though `StoreDeliveriesScreen` and
  `ManageSubscriberSheet` import it. A compatibility shim was added so the store
  workspace compiles; replace it with the real implementation when it lands.
- Authenticated flows depend on role credentials. Without seeded logins the
  previews render their login/onboarding screens; pointing the gateway at a
  database with real users (e.g. the configured `AAGAM_*` accounts) exercises the
  full navigators.
