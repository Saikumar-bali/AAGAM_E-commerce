import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('customer, Partner onboarding and catalog continuation contracts', () => {
  test('web phone login automatically promotes an unknown number into verified Customer signup', () => {
    const login = read('apps/admin-dashboard/src/app/(auth)/login/page.tsx');
    expect(login).toContain("purpose: 'LOGIN'");
    expect(login).toContain("purpose: 'SIGNUP'");
    expect(login).toContain('setNewCustomer(true)');
    expect(login).toContain('Complete your new customer profile');
    expect(login).toContain("newCustomer ? 'SIGNUP' : 'LOGIN'");
  });

  test('Partner review opens as an accessible dialog workspace', () => {
    const admin = read('apps/admin-dashboard/src/app/(admin)/admin/partner-applications/page.tsx');
    expect(admin).toContain('role="dialog"');
    expect(admin).toContain('aria-modal="true"');
    expect(admin).toContain('fixed inset-0 z-50');
  });

  test('Rider onboarding uses runtime permission, reverse geocoding, date picker and Admin zones', () => {
    const rider = read('apps/mobile-partners/src/screens/RiderApplicationScreen.tsx');
    expect(rider).toContain('PermissionsAndroid.request');
    expect(rider).toContain("apiClient.get('/geo/reverse'");
    expect(rider).toContain('DateTimePickerAndroid.open');
    expect(rider).toContain("apiClient.get('/stores/delivery-zones')");
    expect(rider).not.toContain("const ZONES = ['Madhurawada'");
    expect(rider).toContain('Toast.show');
  });

  test('catalog order is persisted and consumed by the customer query', () => {
    const schema = read('packages/database/prisma/schema.prisma');
    const products = read('apps/api-gateway/src/products/product.service.ts');
    const admin = read('apps/admin-dashboard/src/app/(admin)/admin/products/page.tsx');
    expect(schema).toMatch(/model Category[\s\S]*sortOrder Int/);
    expect(schema).toMatch(/model Product[\s\S]*sortOrder\s+Int/);
    expect(products).toContain("{ category: { sortOrder: 'asc' } }");
    expect(products).toContain('reorderProducts');
    expect(products).toContain('reorderCategories');
    expect(admin).toContain('<SortableProducts');
    expect(admin).toContain('<SortableCategories');
  });

  test('category artwork is persisted, returned, uploaded, and rendered dynamically', () => {
    const schema = read('packages/database/prisma/schema.prisma');
    const migration = read('packages/database/prisma/migrations/20260801090000_category_images/migration.sql');
    const controller = read('apps/api-gateway/src/products/product.controller.ts');
    const service = read('apps/api-gateway/src/products/product.service.ts');
    const admin = read('apps/admin-dashboard/src/app/(admin)/admin/products/page.tsx');
    const sortable = read('apps/admin-dashboard/src/components/SortableCategories.tsx');
    const mobile = read('apps/mobile-customer/src/screens/customer/ShopScreen.tsx');
    expect(schema).toMatch(/model Category[\s\S]*imageUrl\s+String\?/);
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "imageUrl" TEXT');
    expect(controller).toContain('data?.imageUrl');
    expect(service).toContain('cleanCategoryImageUrl');
    expect(service).toContain('imageUrl: cleanImageUrl');
    expect(admin).toContain('handleCategoryImageUpload');
    expect(admin).toContain("/upload/image");
    expect(admin).toContain('imageUrl: categoryImageUrl.trim() || null');
    expect(sortable).toContain('category.imageUrl');
    expect(mobile).toContain("'/products/categories'");
    expect(mobile).toContain(')?.imageUrl');
    expect(mobile).toContain('ALL_CATEGORY_IMAGE');
  });

  test('customer catalog and address controls do not advertise inert or stale states', () => {
    const shop = read('apps/mobile-customer/src/screens/customer/ShopScreen.tsx');
    const detail = read('apps/mobile-customer/src/screens/customer/ProductDetailScreen.tsx');
    const profile = read('apps/mobile-customer/src/screens/customer/CustomerProfileScreen.tsx');
    const cart = read('apps/mobile-customer/src/screens/customer/CartScreen.tsx');
    const customerService = read('apps/api-gateway/src/customer/customer.service.ts');
    const addressDto = read('apps/api-gateway/src/customer/dto/update-address.dto.ts');
    const savedAddresses = read('apps/mobile-customer/src/screens/customer/SavedAddressesScreen.tsx');
    const addresses = read('apps/mobile-customer/src/screens/customer/SavedAddressesScreen.tsx');
    const promotions = read('apps/admin-dashboard/src/app/(admin)/admin/promotions/page.tsx');
    expect(shop).toContain('addressId: defaultAddressId || undefined');
    expect(detail).toContain("queryKey: ['product', productId, defaultAddressId]");
    expect(detail).toContain('includeAvailability: Boolean(defaultAddressId)');
    expect(detail).toContain('addressId: defaultAddressId || undefined');
    expect(detail).toContain('addressQueryReady && !addressesQuery.isError');
    expect(shop).toContain('productsQuery.error && products.length === 0');
    expect(shop).toContain('lastSuccessfulCatalog');
    expect(shop).toContain('catalogReady');
    expect(shop).toContain('availableProductCount');
    expect(detail).toContain('{productQuantity}</Text>');
    expect(profile).toContain('alternatePhoneE164: draft.alternatePhoneE164.trim() || null');
    expect(profile).toContain("basePayload.locationSource = 'LIVE_GPS'");
    expect(profile).toContain("basePayload.locationSource = 'MAP_PIN'");
    expect(profile).toContain("basePayload.locationSource = 'GEOCODED'");
    expect(addressDto).toContain('alternatePhoneE164?: string | null');
    expect(customerService).toContain('dto.alternatePhoneE164 === null');
    expect(cart).toContain('subtotalBeforeSavings');
    expect(cart).toContain('Availability checked at checkout');
    expect(savedAddresses).toContain('isError && addresses.length === 0');
    expect(addresses).toContain('accessibilityRole="image"');
    expect(addresses).not.toContain('accessibilityLabel={`More options');
    expect(promotions).toContain('Hero campaign draft saved.');
  });

  test('mobile checkout creates and selects a pinned address inline', () => {
    const checkout = read('apps/mobile-customer/src/screens/customer/CheckoutScreen.tsx');
    expect(checkout).toContain('Add delivery address');
    expect(checkout).toContain('<LeafletMap');
    expect(checkout).toContain('PermissionsAndroid.request');
    expect(checkout).toContain("apiClient.post('/customer/addresses'");
    expect(checkout).toContain('setSelectedAddressId(saved.id)');
    expect(checkout).not.toContain('Open the Profile tab to add your delivery address first.');
  });
});
