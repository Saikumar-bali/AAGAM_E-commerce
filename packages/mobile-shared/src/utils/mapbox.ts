declare const process: any;

export function getMapboxToken(explicitToken?: string | null): string | null {
  const token =
    explicitToken ||
    (typeof process !== 'undefined' && ((process.env as any).EXPO_PUBLIC_MAPBOX_TOKEN || (process.env as any).NEXT_PUBLIC_MAPBOX_TOKEN)) ||
    (typeof globalThis !== 'undefined' && (globalThis as any).EXPO_PUBLIC_MAPBOX_TOKEN) ||
    null;
  if (token && typeof token === 'string' && token.startsWith('pk.')) return token;
  if (typeof process !== 'undefined' && ((process.env as any).NODE_ENV === 'test' || (process.env as any).JEST_WORKER_ID || (process.env as any).PLAYWRIGHT_TEST)) {
    return 'pk.test-dummy-token-for-jest';
  }
  console.warn('[mapbox] EXPO_PUBLIC_MAPBOX_TOKEN / NEXT_PUBLIC_MAPBOX_TOKEN is missing. Map will not render.');
  return null;
}
