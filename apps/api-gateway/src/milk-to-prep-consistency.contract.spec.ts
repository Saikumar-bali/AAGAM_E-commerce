import { readFileSync } from 'fs';
import path from 'path';

/**
 * The store's daily "milk to prep" is read by three independent surfaces:
 * the dispatch summary (the source of truth for the day), the rider
 * assignment board, and the prep-demand report. They must agree, otherwise
 * the same day shows a different stop count on each screen.
 */
describe('Milk-to-prep consistency across store surfaces', () => {
  const api = (file: string) => readFileSync(path.join(__dirname, file), 'utf8');

  it('excludes completed contracts from the rider assignment board', () => {
    const service = api('subscriptions/store-milk-grid.service.ts');
    // getRiderAssignments must mirror getDispatchSummary: a COMPLETED contract
    // keeps stale SCHEDULED/ORDER_GENERATED rows that are not milk to prep.
    const start = service.indexOf('async getRiderAssignments(');
    expect(start).toBeGreaterThan(-1);
    const body = service.slice(start, service.indexOf('async dispatchToRider(', start));
    expect(body).toContain("status: { not: 'COMPLETED' }");
    expect(body).toContain(
      'status: { notIn: [SubscriptionDeliveryStatus.SKIPPED, SubscriptionDeliveryStatus.CANCELLED] }',
    );
  });

  it('excludes completed contracts and deactivated customers from prep demand', () => {
    const service = api('subscriptions/delivery-run-planning.service.ts');
    const start = service.indexOf('async storeDemand(');
    expect(start).toBeGreaterThan(-1);
    const body = service.slice(start, start + 2000);
    expect(body).toContain("status: { not: 'COMPLETED' }");
    expect(body).toContain('customer: { isActive: true }');
  });
});
