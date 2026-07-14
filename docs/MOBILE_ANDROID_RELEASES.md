# Android release channels

The Android workflow publishes two independent applications:

- `aagam-customer-<run>-<sha>.apk` for customers
- `aagam-partners-<run>-<sha>.apk` for riders and store partners

Pushes to `main` create a stable GitHub release. Pushes to `agent/**` and
`phase-*` create a prerelease for device testing. A manual run can build both
apps or either app individually. Normal pushes inspect changed paths: a change
inside one mobile app rebuilds only that APK, while shared mobile, type, or
utility package changes rebuild both.

The release build targets Android 12 through 15, ships ARMv7 and ARM64 native
code, enables Hermes, resource shrinking, and R8 minification, and disables
clear-text HTTP traffic.

## Repository configuration

Set the Actions variable `API_URL` to the deployed API root. The workflow has a
safe default of `https://aagam.accesscam.org/api`.

Optional app-specific Firebase/Google secrets:

- `GOOGLE_SERVICES_JSON_CUSTOMER`
- `GOOGLE_SERVICES_JSON_PARTNERS`
- `GOOGLE_WEB_CLIENT_ID`
- `GOOGLE_ANDROID_CLIENT_ID_CUSTOMER`
- `GOOGLE_ANDROID_CLIENT_ID_PARTNERS`

Production signing secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

When production signing is not configured, the workflow creates an installable
debug-signed release APK for private device testing. Configure and preserve the
production keystore before distributing stable builds to end users; Android
requires future upgrades to use the same signing key.
