import { normalizeShopSearch, SHOP_SEARCH_DEBOUNCE_MS } from './shopSearch';

describe('shopSearch', () => {
  test('normalizes the eventual product search', () => {
    expect(normalizeShopSearch('  fresh   milk  ')).toBe('fresh milk');
    expect(normalizeShopSearch('')).toBe('');
  });

  test('uses a short debounce window for mobile product search', () => {
    expect(SHOP_SEARCH_DEBOUNCE_MS).toBe(350);
  });
});
