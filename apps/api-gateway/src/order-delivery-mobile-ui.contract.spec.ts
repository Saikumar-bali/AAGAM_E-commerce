import fs from 'fs';
import path from 'path';
import { Role } from '@aagam/database';
import { canViewPickupReadiness } from './orders/pickup-readiness.controller';

const root = path.resolve(__dirname, '../../..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative: string) => fs.existsSync(path.join(root, relative));

describe('order-to-delivery mobile UI contract', () => {
  it('exposes customer delivery context without leaking another customer order', () => {
    const source = read('apps/api-gateway/src/orders/customer-delivery-context.controller.ts');
    expect(source).toContain("@Controller('orders/my')");
    expect(source).toContain('@Roles(Role.CUSTOMER)');
    expect(source).toContain('customerId: req.user.id');
    expect(source).toContain("@Get(':orderId/delivery-context')");
    expect(source).toContain('deliveryJobId: order.deliveryJob?.id || null');
  });

  it('requires ownership for every non-admin readiness caller, including secondary-role store owners', () => {
    expect(canViewPickupReadiness(
      { id: 'store-owner', role: Role.CUSTOMER, roles: [Role.CUSTOMER, Role.STORE_OWNER] },
      'store-owner',
    )).toBe(true);
    expect(canViewPickupReadiness(
      { id: 'other-owner', role: Role.CUSTOMER, roles: [Role.CUSTOMER, Role.STORE_OWNER] },
      'store-owner',
    )).toBe(false);
    expect(canViewPickupReadiness(
      { id: 'admin', role: Role.CUSTOMER, roles: [Role.CUSTOMER, Role.ADMIN] },
      'store-owner',
    )).toBe(true);
  });

  it('exposes owning-store pickup readiness and preserves role isolation', () => {
    const source = read('apps/api-gateway/src/orders/pickup-readiness.controller.ts');
    expect(source).toContain('@Roles(Role.ADMIN, Role.STORE_OWNER)');
    expect(source).toContain('canViewPickupReadiness(req.user, job.order.store.ownerId)');
    expect(source).toContain("ready: task?.status === 'VERIFIED'");
  });

  it('registers both UI support controllers in the order module', () => {
    const source = read('apps/api-gateway/src/orders/order.module.ts');
    expect(source).toContain('CustomerDeliveryContextController');
    expect(source).toContain('PickupReadinessController');
  });

  it('keeps the backend pickup and delivery proof gates authoritative', () => {
    const delivery = read('apps/api-gateway/src/orders/delivery-operations.service.ts');
    const riderPortal = read('apps/api-gateway/src/riders/rider-portal.service.ts');
    expect(delivery).toContain('The Rider item and parcel checklist must be verified before handoff');
    expect(delivery).toContain('Customer delivery OTP/PIN is required');
    expect(delivery).toContain('Collect the full COD amount into the independent COD ledger before completing delivery');
    expect(riderPortal).toContain('Every item quantity must match the order before pickup verification');
  });

  it('invalidates current and future pending pickup challenges after a parcel problem', () => {
    const migration = read(
      'packages/database/prisma/migrations/20260729184500_invalidate_pickup_challenges_on_problem/migration.sql',
    );
    expect(migration).toContain('FROM "RiderPickupTask" AS task');
    expect(migration).toContain('task."status" = \'PROBLEM_REPORTED\'::"RiderPickupStatus"');
    expect(migration).toContain('PERFORM pg_advisory_xact_lock');
    expect(migration).toContain("hashtext('pickup-proof:' || NEW.\"deliveryJobId\")");
    expect(migration).toContain('BEFORE INSERT OR UPDATE OF "status" ON "RiderPickupTask"');
    expect(migration).toContain('NEW."status" = \'PROBLEM_REPORTED\'::"RiderPickupStatus"');
    expect(migration).toContain('UPDATE "PickupChallenge"');
    expect(migration).toContain('"status" = \'SUPERSEDED\'::"PickupChallengeStatus"');
    expect(migration).toContain('AND "status" = \'PENDING\'::"PickupChallengeStatus"');
  });

  it('uses the same advisory-lock namespace as challenge issuance', () => {
    const migration = read(
      'packages/database/prisma/migrations/20260729184500_invalidate_pickup_challenges_on_problem/migration.sql',
    );
    const operations = read('apps/api-gateway/src/orders/delivery-operations.service.ts');
    expect(operations).toContain('await this.lock(tx, `pickup-proof:${deliveryJobId}`)');
    expect(migration).toContain("hashtext('pickup-proof:' || NEW.\"deliveryJobId\")");
  });

  it('runs focused contracts for migration-only changes', () => {
    const workflow = read('.github/workflows/order-delivery-mobile-ui.yml');
    expect(workflow).toContain('packages/database/prisma/migrations/**');
  });

  it('wires the customer code and partner pickup UI to the role-scoped endpoints', () => {
    const customer = read('apps/mobile-customer/src/components/orders/DeliveryCodeCard.tsx');
    const rider = read('apps/mobile-partners/src/screens/rider/RiderPickupOperationsScreen.tsx');
    const store = read('apps/mobile-partners/src/screens/store/StorePickupVerificationScreen.tsx');
    expect(customer).toContain('/delivery-context');
    expect(customer).toContain('/otp/customer');
    expect(rider).toContain('Verify complete checklist');
    expect(rider).toContain('Verify store handoff');
    expect(rider).not.toContain('QR_CODE');
    expect(store).toContain('Rider checklist pending');
    expect(store).toContain('Confirm physical handoff');
    expect(store).not.toContain('QR_CODE');
  });

  it('keeps all Customer Jest contracts in the standard workspace test command', () => {
    const customerPackage = JSON.parse(read('apps/mobile-customer/package.json'));
    expect(customerPackage.scripts.test).toBe('jest --runInBand');
    expect(exists('apps/mobile-customer/src/domain/deliveryCode.spec.ts')).toBe(true);
    expect(exists('apps/mobile-customer/src/screens/customer/CheckoutScreen.contract.spec.ts')).toBe(true);
    expect(exists('apps/mobile-customer/scripts/test-delivery-code.js')).toBe(false);
  });
});
