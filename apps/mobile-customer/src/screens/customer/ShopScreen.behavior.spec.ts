import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, 'ShopScreen.tsx'), 'utf8');

describe('ShopScreen search and category lifecycle', () => {
  test('product search is debounced and uses the debounced value for the API key', () => {
    expect(source).toMatch(/const \[debouncedQuery, setDebouncedQuery\]/);
    expect(source).toMatch(
      /setTimeout\(\(\) => setDebouncedQuery\(normalizeShopSearch\(query\)\), SHOP_SEARCH_DEBOUNCE_MS\)/,
    );
    expect(source).toMatch(/queryKey: \['products', debouncedQuery, categoryId\]/);
    expect(source).toMatch(/search: debouncedQuery \|\| undefined/);
  });

  test('category and All use separate FlatList identities', () => {
    expect(source).toMatch(/<FlatList key="home-categories"/);
    expect(source).toMatch(/<FlatList key="product-grid"[^>]*numColumns=\{2\}/);
  });
});
