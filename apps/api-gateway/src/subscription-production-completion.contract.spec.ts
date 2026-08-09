import * as fs from 'fs';
import * as path from 'path';

const root = path.resolve(__dirname, '../../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('subscription production completion contracts', () => {
  const schema = read('packages/database/prisma/schema.prisma');
  const migration = read('packages/database/prisma/migrations/20260807130000_subscription_production_completion/migration.sql');
  const customer = read('apps/api-gateway/src/subscriptions/customer-subscription.service.ts');
  const generator = read('apps/api-gateway/src/subscriptions/subscription-order-generator.service.ts');
  const serviceability = read('apps/api-gateway/src/subscriptions/subscription-serviceability.service.ts');
  const scheduler = read('apps/api-gateway/src/subscriptions/subscription-scheduler.service.ts');
  const planner = read('apps/api-gateway/src/subscriptions/regional-route-planning.service.ts');
  const operations = read('apps/api-gateway/src/subscriptions/regional-route-operations.service.ts');
  const trustedDrop = read('apps/api-gateway/src/subscriptions/trusted-drop.service.ts');
  const runOperations = read('apps/api-gateway/src/subscriptions/delivery-run-operations.service.ts');
  const deliveryOperations = read('apps/api-gateway/src/orders/delivery-operations.service.ts');
  const upload = read('apps/api-gateway/src/upload/upload.service.ts');
  const notificationRouting = read('apps/api-gateway/src/notifications/notification-routing.service.ts');
  const riderOfflineQueue = read('apps/mobile-partners/src/services/RiderRunOfflineQueue.ts');
  const customerReview = read('apps/mobile-customer/src/screens/customer/SubscriptionReviewScreen.tsx');
  const admin = read('apps/admin-dashboard/src/components/subscriptions/AdminSubscriptionsPage.tsx');

  it('uses one shared resolver for quote, create, and occurrence generation', () => {
    expect(customer.match(/this\.serviceability\.resolve\(/g)?.length).toBeGreaterThanOrEqual(3);
    expect(generator).toContain('this.serviceability.resolve({');
    for (const reason of ['ZONE_UNSERVICEABLE','PLAN_NOT_AVAILABLE_IN_ZONE','STORE_UNAVAILABLE','STORE_OUT_OF_RADIUS','INVENTORY_UNAVAILABLE','CAPACITY_EXHAUSTED','WINDOW_UNAVAILABLE']) {
      expect(serviceability).toContain(reason);
    }
  });

  it('persists timezone and immutable weight snapshots and enforces buffered route weight', () => {
    expect(schema).toContain('timezone');
    expect(schema).toContain('weightGrams');
    expect(schema).toContain('expectedWeightGrams');
    expect(migration).toContain('"timezone" TEXT NOT NULL DEFAULT \'Asia/Kolkata\'');
    expect(planner).toContain('maximumWeightGrams');
    expect(planner).toContain('slotEndBufferMinutes');
    expect(operations).toContain('maximumWeightGrams');
    expect(operations).toContain('slotEndBufferMinutes');
  });

  it('defaults to split cash/funded routes unless explicitly enabled', () => {
    expect(planner).toMatch(/ALLOW_MIXED_CASH_RUNS\s*(?:\|\||\?\?)\s*'false'/);
    expect(planner).toContain("allowMixedCashRuns ? 'MIXED_PAYMENT_ALLOWED' : row.paymentRequirement");
  });

  it('runs production scheduling on a durable BullMQ repeatable queue without local intervals', () => {
    expect(scheduler).toContain("from 'bullmq'");
    expect(scheduler).toContain('repeat: { every: intervalMs }');
    expect(scheduler).toContain('subscriptionWorkerFailure');
    expect(scheduler).toContain('readiness()');
    expect(scheduler).not.toContain('setInterval(');
  });

  it('rechecks requested riders inside the route mutation transaction', () => {
    expect(planner).toContain('validateRiderForRunWithinTransaction');
    expect(planner).toContain('assignRiderWithinTransaction');
    expect(operations).toMatch(/assignRiderWithinTransaction\(\s*tx/);
    const splitStart = operations.indexOf('async split(');
    const mergeStart = operations.indexOf('async merge(');
    const splitSection = operations.slice(splitStart, mergeStart);
    expect(splitSection).toContain('Prisma.TransactionIsolationLevel.Serializable');
    expect(splitSection).toMatch(/assignRiderWithinTransaction\(\s*tx/);
  });

  it('uses server-issued one-time signed trusted-drop challenges with no plaintext persistence', () => {
    expect(trustedDrop).toContain('randomBytes(32)');
    expect(trustedDrop).toContain("createHmac('sha256'");
    expect(trustedDrop).toContain("createHash('sha256')");
    expect(trustedDrop).toContain('usedAt');
    expect(trustedDrop).toContain('credentialVersion');
    expect(trustedDrop).toContain('rotate');
    expect(trustedDrop).toContain('revoke');
    const challengeModel = schema.match(/model TrustedDropChallenge\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(challengeModel).toContain('tokenHash');
    expect(challengeModel).not.toMatch(/\btoken\s+String/);
  });

  it('requires real private evidence and separate arrival/completion geofence proof', () => {
    expect(upload).toContain('validateEvidenceMagic');
    expect(trustedDrop).toContain("scope: 'subscription-trusted-drop'");
    expect(schema).toContain('model RunStopGeofenceProof');
    expect(runOperations).toContain('GeofencePhase.ARRIVAL');
    expect(runOperations).toContain('GeofencePhase.COMPLETION');
    expect(deliveryOperations).toContain('trusted-drop-evidence:');
    expect(deliveryOperations).not.toContain('proofReference: input.proofReference');
  });

  it('does not persist sensitive trusted-drop QR material in the rider offline queue', () => {
    expect(riderOfflineQueue).toContain('TRUSTED_DROP_RESCAN_REQUIRED');
    expect(riderOfflineQueue).not.toContain('trustedDropToken:');
    expect(riderOfflineQueue).not.toContain('dropToken:');
  });

  it('routes durable assignment/removal and worker failure notifications', () => {
    expect(notificationRouting).toContain('ROUTE_ASSIGNED');
    expect(notificationRouting).toContain('ROUTE_REMOVED');
    expect(notificationRouting).toContain('SUBSCRIPTION_WORKER_FAILED');
    expect(planner).toContain('enqueueOutboxEvent');
  });

  it('surfaces authoritative local windows and operational exceptions in customer/admin UX', () => {
    expect(customerReview).toContain('localDeliveryWindow');
    expect(customerReview).toContain('serviceability.timezone');
    expect(admin).toContain('Upload plan image');
    expect(admin).toContain('workerFailures');
    expect(admin).toContain('deferredReason');
    expect(admin).toContain('SIGNED_QR_CHALLENGE');
  });
});
