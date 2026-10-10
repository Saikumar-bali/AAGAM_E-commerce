/* Runtime env values for the preview harness. Mirrors the react-native-dotenv
 * `@env` module the native app imports.
 *
 * The non-secret config (API URL, variant) is baked in by webpack DefinePlugin.
 * Client keys (Mapbox, Google Maps/Web) are read at runtime from
 * `window.__ENV__`, which server.js injects into index.html, so no key value is
 * embedded in the built bundle.
 */
const runtimeEnv =
  (typeof window !== 'undefined' && window.__ENV__) || {};

export const API_URL = process.env.__AAGAM_API_URL__;
export const APP_VARIANT = process.env.__AAGAM_APP_VARIANT__;
export const APP_VERSION_CODE = process.env.__AAGAM_APP_VERSION_CODE__ || '0';
export const GOOGLE_WEB_CLIENT_ID = runtimeEnv.GOOGLE_WEB_CLIENT_ID || '';
export const GOOGLE_ANDROID_CLIENT_ID = runtimeEnv.GOOGLE_ANDROID_CLIENT_ID || '';
export const EXPO_PUBLIC_MAPBOX_TOKEN = runtimeEnv.MAPBOX_TOKEN || '';
export const EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = runtimeEnv.GOOGLE_MAPS_API_KEY || '';
