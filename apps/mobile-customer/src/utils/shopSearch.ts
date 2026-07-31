export const SHOP_SEARCH_DEBOUNCE_MS = 350;

/** Keep the API query stable while a customer is still typing. */
export function normalizeShopSearch(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 100);
}
