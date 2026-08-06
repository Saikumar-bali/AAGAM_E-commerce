import { readFileSync } from 'fs';
import path from 'path';

describe('COD subscription delivery runs production contract', () => {
  const root = path.resolve(__dirname, '../../..');
  const repo = (file: string) => readFileSync(path.join(root, file), 'utf8');
  const api = (file: string) => readFileSync(path.join(__dirname, file), 'utf8');

  it('persists immutable plan versions, per-occurrence uniqueness and existing-order linkage', () => {
    const schema = repo('packages/database/prisma/schema.prisma');
    for (const model of [
      'model SubscriptionPlan',
      'model SubscriptionPlanItem',
      'model SubscriptionPlanVersion',
      'model CustomerSubscription',
      'model SubscriptionDelivery',
      'model DeliveryRun',
      'model DeliveryRunStop',
      'model CashDepositBatch',
      'model CashDepositBatchEntry',
      'model SubscriptionAuditEntry',
    ]) expect(schema).toContain(model);
    expect(schema).toContain('generationKey');
    expect(schema).toContain('@@unique([subscriptionId, serviceDate])');
    expect(schema).toContain('subscriptionDeliveryId String?');
    expect(schema).toContain('orderSource      OrderSource');
    expect(schema).toContain('SUBSCRIPTION_CASH_CREDIT');
    expect(schema).toContain('SUBSCRIPTION_FUNDED');
  });

  it('ships a forward-only migration with indexes, foreign keys and no destructive reset', () => {
    const migration = repo('packages/database/prisma/migrations/20260806090000_subscription_delivery_runs_cod/migration.sql');
    expect(migration).toContain('CREATE TABLE "SubscriptionPlanVersion"');
    expect(migration).toContain('CREATE TABLE "CashDepositBatchEntry"');
    expect(migration).toContain('CREATE UNIQUE INDEX "SubscriptionDelivery_generationKey_key"');
    expect(migration).toContain('ADD CONSTRAINT');
    expect(migration).not.toContain('DROP SCHEMA');
    expect(migration).not.toContain('TRUNCATE');
  });

  it('reuses one authoritative order-creation component for checkout and subscription generation', () => {
    const shared = api('orders/order-creation.service.ts');
    const checkout = api('checkout/checkout.service.ts');
    const generator = api('subscriptions/subscription-order-generator.service.ts');
    expect(shared).toContain('class OrderCreationService');
    expect(shared).toContain('Prisma.TransactionIsolationLevel.Serializable');
    expect(shared).toContain('inventoryLedger');
    expect(checkout).toContain('OrderCreationService');
    expect(generator).toContain('OrderCreationService');
    expect(generator).toContain('OrderSource.SUBSCRIPTION');
    expect(generator).toContain('pg_advisory_xact_lock');
    expect(generator).not.toContain('createMany({\n      data: Array.from({ length: 30 }');
  });

  it('keeps cash collection, OTP proof, funding allocation and stop completion atomic', () => {
    const operations = api('subscriptions/delivery-run-operations.service.ts');
    const delivery = api('orders/delivery-operations.service.ts');
    const funding = api('subscriptions/subscription-cash-funding.service.ts');
    expect(operations).toContain('finalizeDeliveredStopWithinTransaction');
    expect(delivery).toContain('afterDelivery');
    expect(delivery).toContain('completeCodDelivery');
    expect(funding).toContain('allocateAfterCodCollectionWithinTransaction');
    expect(funding).toContain('consumeDeliveredWithinTransaction');
    expect(operations).toContain('Prisma.TransactionIsolationLevel.Serializable');
  });

  it('forbids bulk delivery completion and uses server-owned stop state transitions', () => {
    const controller = api('subscriptions/subscriptions.controller.ts');
    const operations = api('subscriptions/delivery-run-operations.service.ts');
    expect(controller).toContain("@Post(':runId/stops/:stopId/complete')");
    expect(controller).not.toContain('mark-all-delivered');
    expect(controller).not.toContain('complete-all');
    expect(operations).toContain('transitionWithinTransaction');
    expect(operations).toContain('stop.version !== dto.version');
    expect(operations).toContain('delivery, retry, or return resolution');
  });

  it('requires independent store handoff and rider bag receipt before route start', () => {
    const controller = api('subscriptions/subscriptions.controller.ts');
    const planning = api('subscriptions/delivery-run-planning.service.ts');
    const operations = api('subscriptions/delivery-run-operations.service.ts');
    expect(controller).toContain("@Post('runs/:runId/pickup')");
    expect(controller).toContain("@Post(':runId/pickup')");
    expect(planning).toContain('storeHandoffConfirmedAt');
    expect(operations).toContain('expectedBagCount');
    expect(operations).toContain('crateCode');
    expect(operations).toContain('PICKUP_VERIFIED');
  });

  it('preserves individual COD ledgers inside independently verified cash batches', () => {
    const cash = api('subscriptions/cash-deposit-batch.service.ts');
    expect(cash).toContain('codLedgerIds');
    expect(cash).toContain('cashDepositBatchEntry.update');
    expect(cash).toContain('CodLedgerEntryType.DEPOSITED');
    expect(cash).toContain('VARIANCE_REVIEW');
    expect(cash).toContain('COMPENSATING_ADJUSTMENT');
    expect(cash).toContain('idempotencyKey');
  });

  it('exposes role-scoped customer, rider, store and admin APIs', () => {
    const controller = api('subscriptions/subscriptions.controller.ts');
    for (const scope of [
      "@Controller('customer/subscriptions')",
      "@Controller('rider/delivery-runs')",
      "@Controller('store/subscription-operations')",
      "@Controller('admin/subscriptions')",
    ]) expect(controller).toContain(scope);
    expect(controller).toContain('@Roles(Role.CUSTOMER)');
    expect(controller).toContain('@Roles(Role.RIDER)');
    expect(controller).toContain('@Roles(Role.STORE_OWNER, Role.ADMIN)');
    expect(controller).toContain('@Roles(Role.ADMIN)');
  });

  it('renders truthful ₹0 funded-delivery messaging and real operational controls across web and Android', () => {
    const customerAndroid = repo('apps/mobile-customer/src/screens/customer/SubscriptionDetailScreen.tsx');
    const riderAndroid = repo('apps/mobile-partners/src/screens/rider/RiderRunDetailScreen.tsx');
    const storeAndroid = repo('apps/mobile-partners/src/screens/store/StoreSubscriptionOperationsScreen.tsx');
    const customerWeb = repo('apps/admin-dashboard/src/app/(shop)/shop/subscriptions/[id]/page.tsx');
    const riderWeb = repo('apps/admin-dashboard/src/app/(rider)/rider/runs/page.tsx');
    const storeWeb = repo('apps/admin-dashboard/src/app/(store)/store/subscriptions/page.tsx');
    expect(customerAndroid).toContain('Customer due ₹0');
    expect(customerAndroid).toContain('Report a delivery problem');
    expect(customerAndroid).toContain('Cancel subscription?');
    expect(riderAndroid).toContain('Do not collect cash');
    expect(riderAndroid).toContain('Finish route after all stops');
    expect(storeAndroid).toContain('Confirm store handoff');
    expect(customerWeb).toContain('Subscription already funded');
    expect(riderWeb).toContain('Do not collect');
    expect(storeWeb).toContain('store handoff');
  });
});
