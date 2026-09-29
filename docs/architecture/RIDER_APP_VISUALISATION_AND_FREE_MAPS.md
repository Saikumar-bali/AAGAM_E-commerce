# Rider app: local visualisation and free live maps

## See the screens from a Git branch

The Partners app is React Native. From the repository root:

```bash
npm install
npm run start --workspace=apps/mobile-partners
```

In a second terminal, connect an Android phone with USB debugging enabled (or start an Android Studio emulator), then run:

```bash
npm run android --workspace=apps/mobile-partners
```

Use a rider-approved account. The Rider tabs cover Dashboard/offers, the context-aware pickup or delivery workflow, Alerts, History and Profile. Metro refreshes the device as files change, so checking out a PR branch is enough to review its screens.

## Map architecture and cost

The active-delivery card embeds Leaflet with OpenStreetMap tiles, requiring no Google Maps SDK key. The destination comes from the assigned order and the blue rider marker follows device GPS while the tracking session is active. The existing tracking manager continues sending signed location pings to AAGAM's API and queues pings while offline; the map is presentation only and never replaces the server-side tracking audit trail.

The in-app line is an overview, not turn-by-turn road routing. **Navigate** opens the installed/browser maps experience for safe turn-by-turn guidance. This avoids adding a paid directions API or depending on an unsupported public routing demo server.

OpenStreetMap data is free and must be attributed. The public `tile.openstreetmap.org` service is community-funded and has a usage policy; it is suitable for development and light early-stage traffic, but it is not a free unlimited production CDN. Before material scale, use a policy-compliant hosted tile provider with a free tier or self-host tiles, and update the tile URL in `RiderRouteMap.tsx`. Do not remove attribution or prefetch/offline-scrape the public tile service.

## Live-tracking checklist

1. Grant precise and background location when the Rider goes online.
2. Accept an offer and confirm that the live map shows the pickup destination.
3. Move the emulator location and confirm that the blue marker and tracking-health timestamp update.
4. Complete pickup; the map destination should switch to the customer.
5. Background the app and verify the Android foreground-service notification remains visible.
6. Disable network briefly, move location, restore network, and verify the offline queue returns to zero.
