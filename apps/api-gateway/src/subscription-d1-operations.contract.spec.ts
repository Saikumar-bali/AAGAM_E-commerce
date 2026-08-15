import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname);
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

describe('subscription D-1 operations contracts', () => {
  it('keeps JIT order generation but separates regional planning from live rider assignment', () => {
    const scheduler = read('subscriptions/subscription-scheduler.service.ts');
    const preparation = read('subscriptions/subscription-preparation.service.ts');
    const controller = read('subscriptions/regional-routing.controller.ts');

    expect(scheduler).toContain('generateDue(new Date(), 250, correlationId)');
    expect(scheduler).toContain('planGeneratedDeliveries(1000, { assignRiders: false })');
    expect(controller).toContain('assignRiders: false');
    expect(preparation).toContain("SUBSCRIPTION_MIN_PREPARATION_HOURS || 24");
    expect(preparation).toContain("ROUTE_FINAL_ASSIGNMENT_HOURS_BEFORE || 2");
    expect(preparation).toContain('assignBestEligibleRider(run.id)');
  });

  it('records stock readiness as audit state without reserving forecast inventory', () => {
    const preparation = read('subscriptions/subscription-preparation.service.ts');

    expect(preparation).toContain("const PREPARATION_ACTION_READY = 'STORE_STOCK_READY'");
    expect(preparation).toContain("const PREPARATION_ACTION_SHORTAGE = 'STORE_STOCK_SHORTAGE'");
    expect(preparation).toContain("inventoryReservation: delivery.order ? 'RESERVED_BY_ORDER' : 'FORECAST_ONLY'");
    expect(preparation).not.toContain('tx.inventory.update');
    expect(preparation).not.toContain('quantity: { decrement');
  });

  it('surfaces the immutable delivery phone to Admin when the account phone is empty', () => {
    const reporting = read('subscriptions/subscription-admin-reporting.service.ts');

    expect(reporting).toContain('phone: row.customer.phone || contact.phone');
    expect(reporting).toContain('deliveryContact: contact');
    expect(reporting).toContain('address.phoneE164');
  });

  it('registers D-1 orchestration and sends operational alerts through durable outbox routing', () => {
    const module = read('subscriptions/subscriptions.module.ts');
    const preparation = read('subscriptions/subscription-preparation.service.ts');
    const routeNotifications = read('subscriptions/regional-route-notification.service.ts');
    const riderCapacity = read('subscriptions/subscription-rider-capacity-notification.service.ts');
    const routing = read('notifications/notification-routing.service.ts');

    expect(module).toContain('SubscriptionPreparationService');
    expect(module).toContain('StoreSubscriptionPreparationController');
    expect(module).toContain('AdminSubscriptionPreparationController');
    expect(module).toContain('RegionalRouteNotificationService');
    expect(module).toContain('SubscriptionRiderCapacityNotificationService');
    expect(routeNotifications).toContain('DeliveryRouteEventType.ROUTE_CLUSTER_CREATED');
    expect(routeNotifications).toContain('enqueueOutboxEvent(prisma');
    expect(routeNotifications).not.toContain("key: 'rider'");
    expect(preparation).toContain("audience: 'TARGETED'");
    expect(riderCapacity).toContain("finalAssignmentPending: true");
    expect(riderCapacity).toContain('enqueueOutboxEvent(prisma');
    expect(routing).toContain('payload.targetRecipients');
    expect(routing).toContain("audience: hasTargetRecipients ? 'TARGETED'");
  });

  it('exposes store readiness and configurable admin plan policy endpoints', () => {
    const controller = read('subscriptions/subscription-preparation.controller.ts');
    const dto = read('subscriptions/subscription-preparation.dto.ts');

    expect(controller).toContain("@Controller('store/subscription-preparation')");
    expect(controller).toContain("@Post('deliveries/:deliveryId/readiness')");
    expect(controller).toContain("@Controller('admin/subscriptions/preparation')");
    expect(controller).toContain("@Patch('plans/:planId/policy')");
    expect(dto).toContain('@Max(72)');
  });
});
