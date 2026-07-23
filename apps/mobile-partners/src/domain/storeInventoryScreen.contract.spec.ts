import * as fs from 'fs';
import * as path from 'path';

describe('Store inventory screen contract', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../screens/store/StoreInventoryScreen.tsx'),
    'utf8',
  );

  it('renders product images using the shared fallback pipeline', () => {
    expect(source).toContain('getProductImage(product)');
    expect(source).toContain('DEFAULT_PRODUCT_IMAGE');
    expect(source).toContain('<Image');
  });

  it('prominently renders effective selling price rather than only MRP', () => {
    expect(source).toContain('effectiveStoreSellingPricePaise');
    expect(source).toContain('styles.sellingPrice');
    expect(source).toContain('styles.mrpPrice');
    expect(source).toContain('Store selling price');
    expect(source).toContain('Admin selling price');
  });
});
