import fs from 'fs';
import path from 'path';

describe('checkout order notification routing contract', () => {
  const checkoutSource = fs.readFileSync(path.join(__dirname, 'checkout/checkout.service.ts'), 'utf8');
  const routingSource = fs.readFileSync(path.join(__dirname, 'notifications/notification-routing.service.ts'), 'utf8');

  it('enqueues ORDER_PLACED atomically inside the checkout transaction', () => {
    expect(checkoutSource).toContain('await enqueueOutboxEvent(tx, {');
    expect(checkoutSource).toContain("eventType: 'ORDER_PLACED'");
    expect(checkoutSource).toContain("idempotencyKey: `checkout:order-placed:${created.id}`");
    expect(checkoutSource).toContain('metadata: {\n            storeId,');
  });

  it('does not broadcast an unassigned customer order to every rider token', () => {
    expect(checkoutSource).not.toContain('Rider push fanout count');
    expect(checkoutSource).not.toContain('sendNewOrderAlert(');
    expect(checkoutSource).not.toContain('where: { role: "RIDER", fcmToken: { not: null } }');
  });

  it('routes order placement to the owning store and assignments to the selected rider', () => {
    const orderPlacedBlock = routingSource.slice(
      routingSource.indexOf("case 'ORDER_PLACED':"),
      routingSource.indexOf("case 'STORE_ACCEPTED_ORDER':"),
    );
    expect(orderPlacedBlock).toContain('addStore();');
    expect(orderPlacedBlock).toContain('addAdmins();');
    expect(orderPlacedBlock).not.toContain('addRider();');

    const offeredBlock = routingSource.slice(
      routingSource.indexOf("case 'ASSIGNMENT_OFFERED':"),
      routingSource.indexOf("case 'ASSIGNMENT_ACCEPTED':"),
    );
    expect(offeredBlock).toContain('payload.riderUserId');
    expect(offeredBlock).toContain('add(rider);');
  });
});
