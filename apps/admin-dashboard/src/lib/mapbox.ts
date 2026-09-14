export function getMapboxToken(): string | null {
  const raw = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const token = (raw || '').replace(/['"]/g, '').trim();
  if (token && token.startsWith('pk.') && token !== 'pk.test-dummy-token-for-jest') {
    return token;
  }
  // Allow Jest/Playwright mock environments only
  if (
    typeof process !== 'undefined' &&
    ((process.env as any).NODE_ENV === 'test' ||
      (process.env as any).JEST_WORKER_ID ||
      (process.env as any).PLAYWRIGHT_TEST)
  ) {
    return 'pk.test-dummy-token-for-jest';
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
