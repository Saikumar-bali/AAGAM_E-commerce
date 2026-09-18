import { readFileSync } from 'node:fs';

/**
 * The offline-customer lifecycle (move to recycle bin, restore, permanent
 * purge) is owned by the store that owns the customer. The admin portal keeps a
 * read-only view, and the store's own listing surfaces (subscribers, milk grid,
 * dispatch) must not show customers that are sitting in the recycle bin.
 */
describe('Store-owned offline customer lifecycle contract', () => {
  const controllerSource = readFileSync(__dirname + '/subscriptions/subscriptions.controller.ts', 'utf8');
  const serviceSource = readFileSync(__dirname + '/subscriptions/offline-customer.service.ts', 'utf8');
  const reportingSource = readFileSync(__dirname + '/subscriptions/subscription-admin-reporting.service.ts', 'utf8');
  const gridSource = readFileSync(__dirname + '/subscriptions/store-milk-grid.service.ts', 'utf8');

  test('store routes expose the full lifecycle', () => {
    expect(controllerSource).toContain("@Delete('offline-customers/:customerId')");
    expect(controllerSource).toContain("@Post('offline-customers/:customerId/restore')");
    expect(controllerSource).toContain("@Delete('offline-customers/:customerId/permanent')");
  });

  test('lifecycle mutations are restricted to the store owner role', () => {
    const lifecycleBlock = controllerSource.slice(controllerSource.indexOf("@Delete('offline-customers/:customerId')"));
    const mutations = lifecycleBlock.slice(0, lifecycleBlock.indexOf('permanentDeleteOfflineCustomer('));
    // Three route decorators, each guarded by an explicit @Roles(STORE_OWNER).
    expect((mutations.match(/@Roles\(Role\.STORE_OWNER\)/g) || []).length).toBe(3);
    expect(mutations).not.toContain('@Roles(Role.ADMIN');
  });

  test('admin controller no longer exposes destructive offline customer routes', () => {
    const adminBlock = controllerSource.slice(controllerSource.indexOf("@Controller('admin/subscriptions')"));
    expect(adminBlock).not.toContain("@Delete('offline-customers/:customerId')");
    expect(adminBlock).not.toContain("@Post('offline-customers/:customerId/restore')");
    expect(adminBlock).not.toContain("@Delete('offline-customers/:customerId/permanent')");
  });

  test('lifecycle mutations are ownership-scoped and require a store owner', () => {
    expect(serviceSource).toContain('mutationOwnershipFilter');
    expect(serviceSource).toContain('homeStore: { ownerId: actor.id }');
    expect(serviceSource).toContain('Only the store that owns the customer can delete or restore it');
  });

  test('restore lifts only the pause applied by the recycle bin', () => {
    expect(serviceSource).toContain('OFFLINE_CUSTOMER_IN_RECYCLE_BIN');
    expect(serviceSource).toContain('pauseReason: OfflineCustomerService.RECYCLE_BIN_PAUSE_REASON');
  });

  test('recycled customers disappear from store listing surfaces', () => {
    expect(reportingSource).toContain('customer: { isActive: true }');
    expect(reportingSource).toContain('...storeFilter');
    expect(gridSource).toContain('customer: { isActive: true }');
    expect(gridSource).toContain('subscription: { ...storeFilter, customer: { isActive: true }');
  });

  test('offline customers created through the store are pinned to that store', () => {
    expect(reportingSource).toContain('offlineStoreId: storeId ?? null');
    expect(controllerSource).toContain('const ownedStore = body.storeId');
  });
});
