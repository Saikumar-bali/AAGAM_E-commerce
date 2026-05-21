# Railway Production Test Guide

This project should be production-tested with a public API URL. Rider live tracking will not work from a physical phone if the app points to `localhost`, `127.0.0.1`, or a laptop LAN IP.

## Recommended Railway Services

Create one Railway project with these services:

- `aagam-api`: Node/Nest API gateway from this repo.
- `Postgres`: Railway PostgreSQL plugin.
- `Redis`: Railway Redis plugin, required for production WebSocket rooms and rider tracking.

The mobile app is not deployed to Railway. Build a staging APK/IPA that points to the public Railway API URL.

## API Service Settings

Set these Railway service variables on `aagam-api`:

```bash
NODE_ENV=production
DATABASE_URL=<Railway Postgres DATABASE_URL>
REDIS_URL=<Railway Redis REDIS_URL>
JWT_SECRET=<strong random secret>
CORS_ORIGINS=https://your-admin-domain.up.railway.app
```

If you test only with the mobile app, `CORS_ORIGINS` can be empty because native mobile requests are not browser-CORS restricted. Add admin/customer web domains before browser testing.

Use these Railway build/start commands for the API service:

```bash
npm ci
npm run build:api
```

```bash
npm run start:api
```

For the first Railway staging database, run:

```bash
npm run db:push:prod
```

For a mature production release, replace `db push` with Prisma migrations and run:

```bash
npm run db:migrate:prod
```

## Mobile Staging Build

After Railway gives the API a public domain, set the mobile `.env` before building:

```bash
API_URL=https://your-aagam-api.up.railway.app
SUPABASE_URL=<your value>
SUPABASE_ANON_KEY=<your value>
```

Then rebuild the rider/customer app. The API client and Socket.IO client will both use `API_URL`.

For the current Railway staging deployment:

```bash
API_URL=https://aagam-api-production.up.railway.app
WEB_URL=https://aagam-web-production.up.railway.app
```

Build a debug Android APK from Windows PowerShell:

```powershell
cd D:\aagam_ecommerse\apps\mobile-app\android
.\gradlew.bat assembleDebug
```

Expected APK output:

```text
D:\aagam_ecommerse\apps\mobile-app\android\app\build\outputs\apk\debug\app-debug.apk
```

## Tracking Acceptance Test

1. Deploy the API and confirm `https://your-aagam-api.up.railway.app` responds.
2. Push the Prisma schema to Railway Postgres.
3. Build/install the mobile app with `API_URL` set to the Railway API URL.
4. Create a customer order.
5. Assign or accept the order as a rider.
6. Rider taps online, then starts live delivery.
7. Customer order details should show timeline updates and latest rider coordinates.
8. Admin monitor should receive `riderLocationUpdated` / `adminRiderUpdate` events.
9. Rider marks order delivered and tracking should stop.

## Important Security Notes

- Do not commit Firebase service-account JSON files or Railway tokens.
- Rotate any Railway token shared in chat after deployment.
- Use Railway variables for secrets, not `.env` committed to git.
