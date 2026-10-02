import { readFileSync } from 'node:fs';

/**
 * The store Subscribers tab must count live contracts only. Cancelled (and
 * renewed/completed) subscriptions are history, not subscribers; when they are
 * listed or counted the tab shows phantom "spammed" rows after every cancel.
 * Creation/renewal must also be idempotent so double-clicks and retries cannot
 * mint duplicate subscriptions that inflate the count.
 */
describe('Store subscriber integrity contract', () => {
  const controller = readFileSync(__dirname + '/subscriptions/subscriptions.controller.ts', 'utf8');
  const reporting = readFileSync(__dirname + '/subscriptions/subscription-admin-reporting.service.ts', 'utf8');
  const storePage = readFileSync(
    __dirname + '/../../admin-dashboard/src/app/(store)/store/subscriptions/page.tsx',
    'utf8',
  );

  it('excludes cancelled and completed contracts from the subscriber list', () => {
    expect(reporting).toContain('const liveStatuses = [');
    expect(reporting).toContain('status: { in: liveStatuses }');
    expect(reporting).toContain('status: CustomerSubscriptionStatus.CANCELLED');
    // The subscriber list must not fall back to "everything except COMPLETED".
    expect(reporting).not.toContain('status: { not: CustomerSubscriptionStatus.COMPLETED }');
  });

  it('returns explicit subscriber counts instead of leaning on array length', () => {
    expect(reporting).toContain('cancelled: cancelledCount');
    expect(reporting).toContain('total: activeCount + pausedCount');
    expect(controller).toContain("@Query('status') status?: 'active' | 'cancelled'");
  });

  it('drives the Subscribers KPI and filter chips from the live count', () => {
    expect(storePage).toContain('subscriberCounts?.total ?? subscribers.length');
    expect(storePage).toContain('countsSummary.active');
    expect(storePage).toContain('countsSummary.cancelled');
  });

  it('guards manual creation and renewal with a lock + idempotency key', () => {
    expect(reporting).toContain('pg_advisory_xact_lock');
    expect(reporting).toContain('subscription-renew:${subscriptionId}:${requestKey}');
    expect(reporting).toContain('manual-subscription:${dto.customerId}:${plan.id}:${requestKey}');
    expect(controller).toContain("@Headers('idempotency-key') key?: string");
    expect(controller).toContain('renewSubscription(id, body, req.user.id, req.user.role, key)');
    expect(controller).toContain('createManualSubscription(body, req.user.id, key)');
  });

  it('sends an idempotency key from the store UI for create and renew', () => {
    expect(storePage).toContain('"Idempotency-Key"');
    expect(storePage).toContain('createIdempotencyKey');
    const milkGrid = readFileSync(
      __dirname + '/../../admin-dashboard/src/components/MilkDeliveryGrid.tsx',
      'utf8',
    );
    expect(milkGrid).toContain('"Idempotency-Key"');
  });
});
