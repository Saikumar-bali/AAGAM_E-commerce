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
