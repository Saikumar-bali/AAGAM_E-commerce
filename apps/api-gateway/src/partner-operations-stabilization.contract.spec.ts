import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('Partner and operations stabilization contracts', () => {
  it('requires explicit Partner OTP verification and rejects non-Partner numbers', () => {
    const login = read('apps/mobile-partners/src/screens/LoginScreen.tsx');
    const auth = read('apps/api-gateway/src/auth/auth.service.ts');
    expect(login).toContain("'/auth/partner/phone/request'");
    expect(login).toContain("'/auth/mobile/partner/phone/verify'");
    expect(login).not.toMatch(/code\.length === 6[\s\S]{0,80}verify/);
    expect(auth).toContain('not registered as an approved Partner');
  });

  it('registers delivery operations and role-aware global search', () => {
    const orders = read('apps/api-gateway/src/orders/order.module.ts');
    const app = read('apps/api-gateway/src/app.module.ts');
    expect(orders).toContain('DeliveryOperationsController');
    expect(app).toContain('GlobalSearchModule');
  });

  it('keeps root navigation exact and permits sorting filtered products', () => {
    const sidebar = read('apps/admin-dashboard/src/components/Sidebar.tsx');
    const products = read('apps/admin-dashboard/src/app/(admin)/admin/products/page.tsx');
    expect(sidebar).toContain('rootRoutes.has(href)');
    expect(products).toContain('const orderingMode = true');
  });

  it('ships independent Customer and Partner update metadata', () => {
    const workflow = read('.github/workflows/android-apk-release.yml');
    const updater = read('packages/mobile-shared/src/utils/appUpdates.ts');
    expect(workflow).toContain('APP_VARIANT=CUSTOMER');
    expect(workflow).toContain('APP_VARIANT=PARTNERS');
    expect(updater).toContain("'/app-releases/latest'");
  });
});
