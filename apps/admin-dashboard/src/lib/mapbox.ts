export function getMapboxToken(): string | null {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (token && typeof token === 'string' && token.startsWith('pk.')) return token;
  // Allow Jest/Playwright/CI local runs to render map without real token (covers next build with NODE_ENV=production)
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'pk.test-dummy-token-for-jest';
  }
  if (typeof process !== 'undefined' && ((process.env as any).NODE_ENV === 'test' || (process.env as any).JEST_WORKER_ID || (process.env as any).PLAYWRIGHT_TEST)) {
    return 'pk.test-dummy-token-for-jest';
  }
  if (typeof window !== 'undefined') {
    console.warn('[mapbox] NEXT_PUBLIC_MAPBOX_TOKEN is missing or invalid. Map will not render.');
  }
  return null;
}

export function setMapboxTokenOrWarn(mapboxgl: { accessToken: string }): boolean {
  const token = getMapboxToken();
  if (!token) return false;
  mapboxgl.accessToken = token;
  return true;
}

export function getGoogleMapsApiKey(): string | null {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (key && typeof key === 'string' && key.startsWith('AIza')) return key;
  return null;
}
