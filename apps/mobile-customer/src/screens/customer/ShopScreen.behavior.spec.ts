import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, 'ShopScreen.tsx'), 'utf8');

describe('ShopScreen search and category lifecycle', () => {
  test('product search is debounced and uses the debounced value for the API key', () => {
    expect(source).toMatch(/const \[debouncedQuery, setDebouncedQuery\]/);
    expect(source).toMatch(
      /setTimeout\(\(\) => setDebouncedQuery\(normalizeShopSearch\(query\)\), SHOP_SEARCH_DEBOUNCE_MS\)/,
    );
    expect(source).toMatch(/queryKey: \['products', debouncedQuery, categoryId, sort, defaultAddressId\]/);
    expect(source).toMatch(/search: debouncedQuery \|\| undefined/);
    expect(source).toMatch(/addressId: defaultAddressId \|\| undefined/);
    expect(source).toMatch(/const availableProductCount = defaultAddressId/);
    expect(source).toMatch(/product\.availability\?\.inStock === true/);
    expect(source).toMatch(/sort/);
  });

  test('category and All remount safely while search and scrolling header stay intact', () => {
    expect(source).toMatch(/<FlatList key="home-categories"/);
    expect(source).toMatch(/<FlatList key="product-grid"[^>]*numColumns=\{2\}/);
    expect(source).toMatch(/<View style=\{styles\.searchContent\}>\{searchInput\}<\/View>/);
    expect(source).toMatch(/ListHeaderComponent=\{header\}/);
    expect(source).toMatch(/placeholderData: \(previousData\) => previousData/);
    expect(source).toMatch(/const \[lastSuccessfulProducts, setLastSuccessfulProducts\]/);
    expect(source).toMatch(/Array\.isArray\(productsQuery\.data\) \? productsQuery\.data : lastSuccessfulProducts/);
    expect(source).toMatch(/onPress=\{cycleSort\}/);
  });
});
