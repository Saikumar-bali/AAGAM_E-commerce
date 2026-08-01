# Customer reference UI, dynamic category artwork, adaptive icons, and hero campaign proof

## Scope

This change keeps the customer experience API-backed and updates the existing screens to match the supplied reference direction: white surfaces, Aagaam teal, rounded cards, product imagery, compact action icons, and a persistent five-item bottom navigation.

The bottom navigation is shared by the main tabs and the stack screens that customers commonly visit from them. It exposes:

1. Home — live hero campaigns, delivery location, search, category rail, and category product sections.
2. Categories — live category rail, search, sorting affordance, and two-column product catalog.
3. Cart — live cart lines, quantity mutations, coupon route, address route, totals, and checkout.
4. Orders — existing live order history and order detail route.
5. Profile — live profile, order/alert counts, account actions, and saved-address entry point.

Product details, checkout, alerts, support, deals, order detail, and saved addresses retain the same navigation bar through the shared stack wrapper. No screen adds hardcoded product, order, address, or promotion records.

## Dynamic category artwork

Category artwork is now a first-class catalog field rather than a mobile-only fallback:

- `Category.imageUrl` is nullable and added by the Prisma migration `20260801090000_category_images`.
- `GET /products/categories` returns the stored artwork URL.
- Admin category create/update accepts only `name` and `imageUrl`; image URLs must be public HTTP(S) URLs.
- Admin uploads use the existing `/upload/image` storage flow and validate JPEG, PNG, or WebP under 3MB.
- The customer app renders the uploaded category artwork. The **All** tile uses the bundled Aagaam mark, and is not a database category.

To configure this after the PR is merged, open **Catalog → Product Catalog → Manage Categories**, upload one square image per category, save, and drag categories into the required order. Product images, prices/MRP, active visibility, and store inventory remain configured from the existing Product Catalog and Store Inventory controls.

## Icon fix

The launcher manifests previously referenced the padded legacy drawable directly. Android then applied launcher scaling to an already-padded artwork canvas. Both apps now use:

- transparent `ic_launcher_foreground.png` derived from the existing Aagaam mark;
- teal adaptive background;
- `mipmap-anydpi-v26/ic_launcher.xml` and `ic_launcher_round.xml`;
- a solid-background `mipmap-nodpi` fallback for older Android versions;
- unchanged Firebase notification icon configuration.

The customer and partners applications share the visual mark but keep their existing application labels and package identities.

## Admin-to-hero workflow

From the admin portal:

1. Open **Promotions & Coupons → Campaign placements → New hero campaign**.
2. Enter the internal name, customer title, supporting subtitle, badge, and CTA label.
3. In **Placement & destination**, select **HOME HERO** and choose the destination: Deals, product, category, or internal path.
4. In **Hero creative**, upload the finished banner artwork under **Final hero banner · desktop / web**. Upload the phone-safe artwork under **Final hero banner · mobile app** when available.
5. Use the live **Customer preview** before saving. For a completed artwork banner, the preview is image-first; the app does not draw a second text layer over it.
6. Set `ACTIVE` for immediate publication, or `SCHEDULED` with a future start. A published hero must have a future end time or no end date.
7. Save with **Publish hero campaign**.

The customer app reads `/promotions/active`, filters the server-approved `HOME_HERO` placement, uses the mobile creative when present, and keeps the banner click destination from the campaign record. If the hero does not appear, verify placement, status, schedule, image URL, and the public campaign response before changing mobile code.

Draft saves are explicitly reported as drafts, scheduled campaigns as scheduled, and active campaigns as published. A draft may be saved without a hero image so the Admin can finish it later; an active or scheduled Home Hero still requires finished artwork.

## Required proof for the PR

- Customer typecheck and Jest suites.
- Admin production build.
- API promotion tests and public promotion Playwright proof.
- Android debug builds for customer and partners.
- Manifest/resource validation confirming both apps use `@mipmap/ic_launcher` and `@mipmap/ic_launcher_round`.
- Screenshots from a clean APK install showing the launcher icon, Home, Categories, Product Detail, Cart, Profile, Saved Addresses, and the admin hero preview.
- No secrets, tokens, OTPs, or personal account values in logs or screenshots.

## Local verification run

- `npm run typecheck --workspace=AagamCustomer` — passed.
- `npm run test --workspace=AagamCustomer -- --runInBand` — passed (4 suites, 8 tests).
- `npm run typecheck --workspace=AagamPartners` — passed.
- `npm run build:admin` — passed.
- `git diff --check` — passed.
- Android debug builds — not runnable in this checkout because neither Android app includes a `gradlew` wrapper; the PR workflow remains the authoritative APK check.
- Customer and partner lint — blocked by the existing lack of an ESLint configuration in those app packages.
- API category contract — passed (6 tests, including category artwork persistence/upload/rendering contract).
- Prisma validation — passed with a non-secret local dummy `DATABASE_URL`; no database credentials were added or logged.
- API integration tests — still require the repository’s configured `DATABASE_URL`; no database credentials were added or logged.

## Known limitation

This workspace can validate source, builds, tests, and GitHub Actions. Final launcher-mask screenshots must be captured by the Android workflow or on a clean physical/emulator installation because launcher rendering is device-specific.
