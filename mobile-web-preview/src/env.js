/* Runtime env values, injected by webpack DefinePlugin at build time.
 * Mirrors the react-native-dotenv `@env` module the native app imports.
 */
export const API_URL = process.env.__AAGAM_API_URL__;
export const APP_VARIANT = process.env.__AAGAM_APP_VARIANT__;
export const APP_VERSION_CODE = process.env.__AAGAM_APP_VERSION_CODE__ || '0';
export const GOOGLE_WEB_CLIENT_ID = process.env.__AAGAM_GOOGLE_WEB_CLIENT_ID__ || '';
export const GOOGLE_ANDROID_CLIENT_ID = process.env.__AAGAM_GOOGLE_ANDROID_CLIENT_ID__ || '';
export const EXPO_PUBLIC_MAPBOX_TOKEN = process.env.__AAGAM_MAPBOX_TOKEN__ || '';
export const EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = process.env.__AAGAM_GOOGLE_MAPS_API_KEY__ || '';
