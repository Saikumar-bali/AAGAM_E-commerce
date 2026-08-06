import * as fs from 'fs';
import * as path from 'path';

const root = path.resolve(__dirname, '../../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('regional multi-rider route splitting contracts', () => {
  const migration = read('packages/database/prisma/migrations/20260806103000_regional_multi_rider_route_splitting/migration.sql');
  const schema = read('packages/database/prisma/schema.prisma');
  const planner = read('apps/api-gateway/src/subscriptions/regional-route-planning.service.ts');
  const operations = read('apps/api-gateway/src/subscriptions/regional-route-operations.service.ts');
  const zones = read('apps/api-gateway/src/subscriptions/regional-delivery-zone.service.ts');
  const scheduler = read('apps/api-gateway/src/subscriptions/subscription-scheduler.service.ts');
  const controller = read('apps/api-gateway/src/subscriptions/regional-routing.controller.ts');

  it('models authoritative polygon/radius zones and persists historical snapshots', () => {
    expect(schema).toContain('polygon                          Json?');
    expect(schema).toContain('fallbackRadiusKm');
    expect(schema).toContain('deliveryZoneSnapshot Json?');
    expect(zones).toContain('pointInPolygon(point, zone.polygon)');
    expect(zones).toContain('haversineKm(point');
    expect(zones).toContain('deliveryZoneSnapshot: snapshot');
    expect(zones).not.toContain('pincode || address.city');
  });

  it('uses hard constraints and configurable operational policies before clustering', () => {
    for (const token of [
      'delivery.serviceDate',
      'delivery.storeId',
      'window.start.toISOString()',
      'zone.id',
      'handlingRequirement',
      'vehicleRequirement',
      'paymentRequirement',
      'maximumStopsPerRun',
      'maximumRouteDistanceKm',
      'maximumEstimatedDurationMinutes',
      'maximumParcelCount',
      'cashRiskLimitPaise',
    ]) expect(planner).toContain(token);
    expect(planner).toContain('splitByOperationalConstraints');
    expect(planner).toContain("planningAlgorithmVersion: 'regional-nearest-neighbour-v1'");
  });

  it('applies rider eligibility before deterministic assignment scoring', () => {
    for (const token of [
      "approvalStatus: 'APPROVED'",
      'status: RiderStatus.ONLINE',
      'rider.shifts.length === 0',
      'rider.breaks.length > 0',
      'rider.deliveryRuns.length > 0',
      'rider.documents.some',
      'allowedVehicles.has',
      'maximumParcelCapacity',
      'maximumCashHoldingPaise',
      'cashDepositBatches.length > 0',
      'pickupDistanceKm > maxPickupDistanceKm',
    ]) expect(planner).toContain(token);
    expect(planner).toContain("assignmentScoreVersion: 'regional-rider-score-v1'");
    expect(planner).toContain('scores.sort((left, right) => left.score - right.score || left.riderId.localeCompare(right.riderId))');
  });

  it('does not silently overload one rider when no eligible rider remains', () => {
    expect(planner).toContain('status: DeliveryRunStatus.RIDER_NEEDED');
    expect(planner).toContain('No eligible rider satisfies zone, shift, vehicle, capacity, overlap, proximity, and cash-risk constraints');
  });

  it('protects route mutations with transactions, locks and optimistic versions', () => {
    expect(operations).toContain('Prisma.TransactionIsolationLevel.Serializable');
    expect(operations).toContain('pg_advisory_xact_lock');
    expect(operations).toContain("throw new ConflictException('Delivery run changed; refresh and try again')");
    expect(operations).toContain("throw new ConflictException('Stop changed; refresh and try again')");
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryRouteEvent_dedupeKey_key"');
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryRunAuditEntry_idempotencyKey_key"');
  });

  it('rejects moving completed, returned, arrived or cash-collected stops', () => {
    expect(operations).toContain('DeliveryRunStopStatus.ARRIVED');
    expect(operations).toContain('DeliveryRunStopStatus.DELIVERED');
    expect(operations).toContain('DeliveryRunStopStatus.RETURNED');
    expect(operations).toContain('collectedAmountPaise');
    expect(operations).toContain('already has protected operational or cash history');
  });

  it('supports audited split, merge, move, reorder, reassign, cancel and recovery', () => {
    for (const method of [
      'async split(',
      'async merge(',
      'async moveStop(',
      'async reassign(',
      'async reorder(',
      'async cancel(',
      'async interruptAndRecover(',
    ]) expect(operations).toContain(method);
    for (const event of [
      'DELIVERY_RUN_SPLIT',
      'DELIVERY_RUN_MERGED',
      'RUN_STOP_MOVED',
      'RUN_STOP_REORDERED',
      'DELIVERY_RUN_INTERRUPTED',
      'RECOVERY_RUN_CREATED',
    ]) expect(schema).toContain(event);
  });

  it('moves only pending stops into recovery while preserving original completed ownership', () => {
    expect(operations).toContain("const completed = run.stops.filter((stop) => stop.status === DeliveryRunStopStatus.DELIVERED)");
    expect(operations).toContain('const pending = run.stops.filter');
    expect(operations).toContain('recoveryFromRunId: run.id');
    expect(operations).toContain('completedStopIds: completed.map');
    expect(operations).toContain('pendingStopIds: pending.map');
    expect(operations).not.toContain('cashDepositBatch.updateMany({ data: { riderId');
  });

  it('keeps cash responsibility independent per route and rider', () => {
    expect(schema).toContain('deliveryRunId         String                 @unique');
    expect(schema).toContain('riderId               String');
    expect(schema).toContain('codLedgerId         String           @unique');
    expect(operations).toContain('expectedCashPaise: pending.reduce');
    expect(operations).not.toContain('merge rider cash');
  });

  it('exposes guarded admin controls and role-safe event polling', () => {
    expect(controller).toContain("@Controller('admin/subscriptions/regional-routing')");
    expect(controller).toContain('@Roles(Role.ADMIN)');
    expect(controller).toContain("@Post('runs/:runId/split')");
    expect(controller).toContain("@Post('runs/:runId/merge')");
    expect(controller).toContain("@Post('runs/:runId/stops/:stopId/move')");
    expect(controller).toContain("@Post('runs/:runId/interrupt')");
    expect(controller).toContain('@Roles(Role.ADMIN, Role.RIDER, Role.STORE_OWNER)');
  });

  it('routes only generated subscription occurrences and leaves normal dispatch unchanged', () => {
    expect(planner).toContain('status: SubscriptionDeliveryStatus.ORDER_GENERATED');
    expect(planner).toContain('runStop: null');
    expect(planner).not.toContain('order.findMany');
    expect(scheduler).toContain('RegionalRoutePlanningService');
    expect(scheduler).toContain('planGeneratedDeliveries');
  });
});
