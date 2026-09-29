import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

describe('stale failed delivery rider release contracts', () => {
  it('keeps the staleness window configurable with a production default', () => {
    const source = read('apps/api-gateway/src/riders/rider-operational-status.ts');
    expect(source).toContain('FAILURE_RIDER_RELEASE_AFTER_MS');
    expect(source).toContain('2 * 60 * 60 * 1000');
  });

  it('releases a Rider pinned by a DELIVERY_FAILED job once the unactioned decision goes stale', () => {
    const source = read('apps/api-gateway/src/riders/rider-operational-status.ts');
    expect(source).toContain('isOccupyingDeliveryJob');
    expect(source).toContain("candidate.status !== DeliveryJobStatus.DELIVERY_FAILED");
    expect(source).toContain('decision.createdAt.getTime() + failureRiderReleaseAfterMs()');
    expect(source).toContain('now.getTime() <= staleAt');
    expect(source).toContain('failureDecisions: {');
    expect(source).toContain("orderBy: { createdAt: 'desc' }");
    expect(source).toContain('take: 1');
  });

  it('still keeps the Rider BUSY while a fresh or actively-processed decision exists', () => {
    const source = read('apps/api-gateway/src/riders/rider-operational-status.ts');
    expect(source).toContain("decision.status !== 'DECIDED'");
    expect(source).toContain('if (decision.appliedAt) return false');
  });

  it('reconciles Rider status when a delivery fails, not only on terminal transitions', () => {
    const source = read('apps/api-gateway/src/orders/delivery-workflow.service.ts');
    const list = source.slice(source.indexOf('nextStatus === DeliveryJobStatus.DELIVERY_FAILED'));
    expect(list).toContain('DELIVERY_FAILED');
    expect(list).toContain('DELIVERED');
    expect(list).toContain('CANCELLED');
  });

  it('runs a periodic recovery sweep that releases stuck BUSY Riders automatically', () => {
    const source = read('apps/api-gateway/src/notifications/notification-worker.service.ts');
    expect(source).toContain('reconcileBusyRiderStatuses');
    expect(source).toContain('failureRiderReleaseAfterMs()');
    expect(source).toContain('currentRider: { status: \'BUSY\' }');
    expect(source).toContain("status: 'DECIDED', appliedAt: null, createdAt: { lt: cutoff }");
    expect(source).toContain('reconcileRiderOperationalStatus(prisma, currentRiderId)');
    expect(source).toContain('releasedBusyRiders');
  });

  it('lets a Rider go ONLINE and OFFLINE when a stale failure is the only job', () => {
    const source = read('apps/api-gateway/src/riders/rider.service.ts');
    expect(source).toContain('isOccupyingDeliveryJob');
    expect(source).toContain('notIn: [');
    expect(source).toContain('failureDecisions: {');
  });
});