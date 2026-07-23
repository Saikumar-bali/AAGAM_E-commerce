from pathlib import Path

screen_path = Path('apps/mobile-partners/src/screens/store/StoreInventoryScreen.tsx')
domain_path = Path('apps/mobile-partners/src/domain/storeInventory.ts')
price_test_path = Path('apps/mobile-partners/src/domain/storeInventoryPrice.spec.ts')
contract_test_path = Path('apps/mobile-partners/src/domain/storeInventoryScreen.contract.spec.ts')

screen = screen_path.read_text()


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match, found {count}')
    return source.replace(old, new, 1)


screen = replace_once(
    screen,
    "  ActivityIndicator,\n  RefreshControl,",
    "  ActivityIndicator,\n  Image,\n  RefreshControl,",
    'React Native Image import',
)
screen = replace_once(
    screen,
    "import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';\n",
    "import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';\nimport { getProductImage } from '@aagam/utils';\n",
    'product image utility import',
)
screen = replace_once(
    screen,
    "  defaultDraft,\n  parseWholeQuantity,",
    "  defaultDraft,\n  effectiveStoreSellingPricePaise,\n  productSellingPricePaise,\n  parseWholeQuantity,",
    'pricing helper imports',
)

screen = replace_once(
    screen,
    "              const draft = editDrafts[item.id] || defaultDraft(item.quantity, item.sellingPricePaise);\n              const quantity = parseWholeQuantity(draft.quantity) ?? item.quantity;",
    "              const draft = editDrafts[item.id] || defaultDraft(item.quantity, item.sellingPricePaise);\n              const quantity = parseWholeQuantity(draft.quantity) ?? item.quantity;\n              const adminPricePaise = productSellingPricePaise(item.product);\n              const sellingPricePaise = effectiveStoreSellingPricePaise(item.product, item.sellingPricePaise);\n              const mrpPaise = Math.max(item.product.mrpPaise || adminPricePaise, sellingPricePaise);",
    'carried product pricing model',
)
screen = replace_once(
    screen,
    "                    <View style={styles.productIcon}><Package size={24} color=\"#0F766E\" /></View>\n                    <View style={styles.productCopy}>\n                      <Text style={styles.category}>{item.product.category?.name || 'Catalogue'}</Text>\n                      <Text style={styles.productName}>{item.product.name}</Text>\n                      <Text style={styles.productMeta}>Admin MRP {formatMoney(item.product.mrpPaise, item.product.price)}</Text>\n                    </View>",
    "                    <View style={styles.productImageWrap}>\n                      <Image\n                        source={{ uri: getProductImage(item.product) }}\n                        style={styles.productImage}\n                        resizeMode=\"cover\"\n                        accessibilityLabel={`${item.product.name} image`}\n                      />\n                    </View>\n                    <View style={styles.productCopy}>\n                      <Text style={styles.category}>{item.product.category?.name || 'Catalogue'}</Text>\n                      <Text style={styles.productName}>{item.product.name}</Text>\n                      <View style={styles.priceRow}>\n                        <Text style={styles.sellingPrice}>{formatMoney(sellingPricePaise)}</Text>\n                        {mrpPaise > sellingPricePaise ? (\n                          <Text style={styles.mrpPrice}>MRP {formatMoney(mrpPaise)}</Text>\n                        ) : null}\n                      </View>\n                      <Text style={styles.priceSource}>\n                        {item.sellingPricePaise == null ? 'Admin selling price' : 'Store selling price'}\n                      </Text>\n                    </View>",
    'carried product visual summary',
)
screen = replace_once(
    screen,
    "                        placeholder={String(item.product.price)}\n                        keyboardType=\"decimal-pad\"",
    "                        placeholder={String(adminPricePaise / 100)}\n                        placeholderTextColor=\"#94A3B8\"\n                        keyboardType=\"decimal-pad\"",
    'carried product selling-price placeholder',
)

screen = replace_once(
    screen,
    "              catalogue.map((product) => {\n                const draft = addDrafts[product.id] || defaultDraft();",
    "              catalogue.map((product) => {\n                const draft = addDrafts[product.id] || defaultDraft();\n                const adminPricePaise = productSellingPricePaise(product);\n                const mrpPaise = Math.max(product.mrpPaise || adminPricePaise, adminPricePaise);",
    'catalogue pricing model',
)
screen = replace_once(
    screen,
    "                      <View style={styles.productIcon}><Package size={24} color=\"#0F766E\" /></View>\n                      <View style={styles.productCopy}>\n                        <Text style={styles.category}>{product.category?.name || 'Catalogue'}</Text>\n                        <Text style={styles.productName}>{product.name}</Text>\n                        <Text style={styles.productMeta}>MRP {formatMoney(product.mrpPaise, product.price)}</Text>\n                      </View>",
    "                      <View style={styles.productImageWrap}>\n                        <Image\n                          source={{ uri: getProductImage(product) }}\n                          style={styles.productImage}\n                          resizeMode=\"cover\"\n                          accessibilityLabel={`${product.name} image`}\n                        />\n                      </View>\n                      <View style={styles.productCopy}>\n                        <Text style={styles.category}>{product.category?.name || 'Catalogue'}</Text>\n                        <Text style={styles.productName}>{product.name}</Text>\n                        <View style={styles.priceRow}>\n                          <Text style={styles.sellingPrice}>{formatMoney(adminPricePaise)}</Text>\n                          {mrpPaise > adminPricePaise ? (\n                            <Text style={styles.mrpPrice}>MRP {formatMoney(mrpPaise)}</Text>\n                          ) : null}\n                        </View>\n                        <Text style={styles.priceSource}>Admin selling price</Text>\n                      </View>",
    'catalogue product visual summary',
)
screen = replace_once(
    screen,
    "                          placeholder={String(product.price)}\n                          keyboardType=\"decimal-pad\"",
    "                          placeholder={String(adminPricePaise / 100)}\n                          placeholderTextColor=\"#94A3B8\"\n                          keyboardType=\"decimal-pad\"",
    'catalogue selling-price placeholder',
)

screen = replace_once(
    screen,
    "  productIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: '#F0FDFA', alignItems: 'center', justifyContent: 'center' },\n  productCopy: { flex: 1, minWidth: 0 },\n  category: { color: '#0F766E', fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },\n  productName: { marginTop: 3, color: '#0F172A', fontSize: 16, fontWeight: '900' },\n  productMeta: { marginTop: 4, color: '#94A3B8', fontSize: 11, fontWeight: '700' },",
    "  productImageWrap: { width: 72, height: 72, borderRadius: 17, overflow: 'hidden', backgroundColor: '#F0FDFA', borderWidth: 1, borderColor: '#CCFBF1' },\n  productImage: { width: '100%', height: '100%', backgroundColor: '#F1F5F9' },\n  productCopy: { flex: 1, minWidth: 0 },\n  category: { color: '#0F766E', fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },\n  productName: { marginTop: 3, color: '#0F172A', fontSize: 16, fontWeight: '900' },\n  priceRow: { marginTop: 7, flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 7 },\n  sellingPrice: { color: '#0F172A', fontSize: 17, fontWeight: '900' },\n  mrpPrice: { color: '#94A3B8', fontSize: 10, fontWeight: '700', textDecorationLine: 'line-through' },\n  priceSource: { marginTop: 2, color: '#0F766E', fontSize: 10, fontWeight: '800' },",
    'product image and price styles',
)

screen_path.write_text(screen)

domain = domain_path.read_text()
helper_block = """

export type StoreInventoryPricedProduct = {
  price: number;
  pricePaise?: number | null;
  mrpPaise?: number | null;
};

export const productSellingPricePaise = (product: StoreInventoryPricedProduct): number => {
  const explicitPaise = Number(product.pricePaise);
  if (Number.isSafeInteger(explicitPaise) && explicitPaise >= 0) return explicitPaise;
  const legacyPrice = Number(product.price);
  return Number.isFinite(legacyPrice) && legacyPrice >= 0 ? Math.round(legacyPrice * 100) : 0;
};

export const effectiveStoreSellingPricePaise = (
  product: StoreInventoryPricedProduct,
  storeSellingPricePaise?: number | null,
): number => {
  const storePrice = Number(storeSellingPricePaise);
  return Number.isSafeInteger(storePrice) && storePrice >= 0
    ? storePrice
    : productSellingPricePaise(product);
};
"""
if 'export const effectiveStoreSellingPricePaise' not in domain:
    domain_path.write_text(domain.rstrip() + helper_block)
else:
    raise RuntimeError('pricing helpers already exist')

price_test_path.write_text("""import {
  effectiveStoreSellingPricePaise,
  productSellingPricePaise,
} from './storeInventory';

describe('store inventory selling-price presentation', () => {
  it('uses the Store Owner override instead of MRP', () => {
    const product = { price: 95, pricePaise: 9500, mrpPaise: 10000 };
    expect(effectiveStoreSellingPricePaise(product, 9200)).toBe(9200);
  });

  it('inherits the Admin selling price when no store override exists', () => {
    const product = { price: 95, pricePaise: 9500, mrpPaise: 10000 };
    expect(effectiveStoreSellingPricePaise(product, null)).toBe(9500);
  });

  it('supports legacy products that only contain a rupee price', () => {
    expect(productSellingPricePaise({ price: 87.5 })).toBe(8750);
  });
});
""")

contract_test_path.write_text("""import fs from 'fs';
import path from 'path';

describe('Store inventory card contract', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../screens/store/StoreInventoryScreen.tsx'),
    'utf8',
  );

  it('renders real product images in both inventory sections', () => {
    expect(source).toContain('getProductImage(item.product)');
    expect(source).toContain('getProductImage(product)');
    expect(source).toContain('<Image');
  });

  it('shows selling price prominently and keeps MRP secondary', () => {
    expect(source).toContain('effectiveStoreSellingPricePaise');
    expect(source).toContain('styles.sellingPrice');
    expect(source).toContain('styles.mrpPrice');
    expect(source).toContain('Store selling price');
  });
});
""")

print('Partners inventory product images and selling-price presentation applied.')
