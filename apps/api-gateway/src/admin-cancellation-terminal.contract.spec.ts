import fs from 'fs';
import path from 'path';

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

describe('admin cancellation is terminal across operational workspaces', () => {
  const orders = read('orders/order.service.ts');
  const workflow = read('orders/delivery-workflow.service.ts');
  const routing = read('notifications/notification-routing.service.ts');
  const audience = read('notifications/notification-audience.ts');
  const riderPortal = read('riders/rider-portal.service.ts');

  it('cancels accepted assignments as well as pending offers', () => {
    expect(orders).toContain("status: { in: ['CREATED', 'OFFERED', 'ACCEPTED'] }");
    expect(orders).toContain("status: 'CANCELLED'");
    expect(orders).toContain('currentRiderId: null');
  });

  it('prevents stale delivery state from reopening a terminal order', () => {
    expect(workflow).toContain('terminalOrderStatuses.includes(job.order.status as OrderStatus)');
    expect(workflow).toContain('delivery processing is closed');
  });

  it('notifies the assigned Rider and invalidates operational data', () => {
    const cancelledBlock = routing.slice(
      routing.indexOf("case 'DELIVERY_CANCELLED':"),
      routing.indexOf("case 'ROUTE_ASSIGNED':"),
    );
    expect(cancelledBlock).toContain('addRider();');
    expect(audience).toContain('DELIVERY_CANCELLED: [Role.CUSTOMER, Role.STORE_OWNER, Role.RIDER, Role.ADMIN]');
    expect(riderPortal).toContain("order: { status: { notIn: ['CANCELLED', 'PAYMENT_FAILED', 'DELIVERED'] as any } }");
  });
});
