from pathlib import Path
from textwrap import dedent

SERVICE_PATH = Path("apps/api-gateway/src/orders/order.service.ts")
TEST_PATH = Path("apps/api-gateway/src/order-cancellation-delivery-job.spec.ts")

source = SERVICE_PATH.read_text()

helper = dedent(
    """
      private async cancelAssociatedDeliveryJob(orderId: string, tx: any) {
        const deliveryJob = await tx.deliveryJob.findUnique({
          where: { orderId },
        });

        if (!deliveryJob || ['DELIVERED', 'RETURNED_TO_STORE', 'CANCELLED'].includes(deliveryJob.status)) {
          return;
        }

        const respondedAt = new Date();

        await tx.deliveryJob.update({
          where: { id: deliveryJob.id },
          data: {
            status: 'CANCELLED',
            currentRiderId: null,
          },
        });

        await tx.dispatchAssignment.updateMany({
          where: {
            deliveryJobId: deliveryJob.id,
            status: { in: ['CREATED', 'OFFERED'] },
          },
          data: { status: 'CANCELLED', respondedAt },
        });
      }

    """
)

if "private async cancelAssociatedDeliveryJob" not in source:
    marker = "  private statusNote(nextStatus: OrderStatus, actorRole?: Role) {"
    count = source.count(marker)
    if count != 1:
        raise SystemExit(f"Expected one statusNote marker, found {count}")
    source = source.replace(marker, helper + marker, 1)

customer_old = dedent(
    """
          const updated = await tx.order.update({
            where: { id: order.id },
            data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
          });

          await this.recordStatusHistory(
    """
)
customer_new = dedent(
    """
          const updated = await tx.order.update({
            where: { id: order.id },
            data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
          });

          await this.cancelAssociatedDeliveryJob(order.id, tx);

          await this.recordStatusHistory(
    """
)
if "await this.cancelAssociatedDeliveryJob(order.id, tx);" not in source:
    count = source.count(customer_old)
    if count != 1:
        raise SystemExit(f"Expected one customer cancellation update block, found {count}")
    source = source.replace(customer_old, customer_new, 1)

admin_old = dedent(
    """
          const updated = await tx.order.update({
            where: { id: orderId },
            data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
          });

          await this.recordStatusHistory({
    """
)
admin_new = dedent(
    """
          const updated = await tx.order.update({
            where: { id: orderId },
            data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
          });

          await this.cancelAssociatedDeliveryJob(orderId, tx);

          await this.recordStatusHistory({
    """
)
if "await this.cancelAssociatedDeliveryJob(orderId, tx);" not in source:
    count = source.count(admin_old)
    if count != 1:
        raise SystemExit(f"Expected one admin cancellation update block, found {count}")
    source = source.replace(admin_old, admin_new, 1)

SERVICE_PATH.write_text(source)

TEST_PATH.write_text(
    dedent(
        """\
        import { OrderStatus, Role, prisma } from '@aagam/database';
        import { DeliveryJobStatus, DispatchAssignmentStatus } from '@aagam/types';
        import { OrderService } from './orders/order.service';
        import { RefundsService } from './payments/refunds.service';
        import { DeliveryEventService } from './orders/delivery-event.service';
        import { DeliveryJobService } from './orders/delivery-job.service';
        import { DeliveryWorkflowService } from './orders/delivery-workflow.service';
        import { DispatchAssignmentService } from './orders/dispatch-assignment.service';

        const PREFIX = '_test_order_cancel_delivery_job_';

        function createTrackingGatewayMock() {
          return {
            server: { to: jest.fn().mockReturnThis(), emit: jest.fn() },
            emitOrderStatusUpdated: jest.fn(),
            emitOrderTimelineUpdated: jest.fn(),
            emitRiderAssigned: jest.fn(),
            emitRiderLocationUpdated: jest.fn(),
            emitTrackingStopped: jest.fn(),
          };
        }

        function orderService() {
          return new OrderService(createTrackingGatewayMock() as any, new RefundsService());
        }

        function deliveryServices() {
          const events = new DeliveryEventService();
          const jobs = new DeliveryJobService(events);
          const workflow = new DeliveryWorkflowService(events);
          const assignments = new DispatchAssignmentService(jobs, workflow, events);
          return { jobs, assignments };
        }

        async function cleanup() {
          const users = await prisma.user.findMany({
            where: { email: { contains: PREFIX } },
            select: { id: true },
          });
          const userIds = users.map((user) => user.id);
          const stores = await prisma.store.findMany({
            where: { name: { contains: PREFIX } },
            select: { id: true },
          });
          const storeIds = stores.map((store) => store.id);
          const orders = await prisma.order.findMany({
            where: { OR: [{ storeId: { in: storeIds } }, { customerId: { in: userIds } }] },
            select: { id: true },
          });
          const orderIds = orders.map((order) => order.id);

          await prisma.refund.deleteMany({ where: { orderId: { in: orderIds } } });
          await prisma.inventoryLedger.deleteMany({
            where: { OR: [{ storeId: { in: storeIds } }, { orderId: { in: orderIds } }] },
          });
          await prisma.riderLocationPing.deleteMany({ where: { orderId: { in: orderIds } } });
          await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
          await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
          await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
          await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
          await prisma.inventory.deleteMany({ where: { storeId: { in: storeIds } } });
          await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
          await prisma.product.deleteMany({ where: { name: { contains: PREFIX } } });
          await prisma.category.deleteMany({ where: { name: { contains: PREFIX } } });
          await prisma.riderProfile.deleteMany({ where: { userId: { in: userIds } } });
          await prisma.user.deleteMany({ where: { id: { in: userIds } } });
        }

        async function seed() {
          const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
          const owner = await prisma.user.create({
            data: { email: `${PREFIX}owner_${suffix}@test.com`, role: Role.STORE_OWNER, name: 'Owner' },
          });
          const admin = await prisma.user.create({
            data: { email: `${PREFIX}admin_${suffix}@test.com`, role: Role.ADMIN, name: 'Admin' },
          });
          const customer = await prisma.user.create({
            data: { email: `${PREFIX}customer_${suffix}@test.com`, role: Role.CUSTOMER, name: 'Customer' },
          });
          const riderUser = await prisma.user.create({
            data: { email: `${PREFIX}rider_${suffix}@test.com`, role: Role.RIDER, name: 'Rider' },
          });
          const rider = await prisma.riderProfile.create({
            data: { userId: riderUser.id, status: 'ONLINE', latitude: 17.7, longitude: 83.3 },
          });
          const category = await prisma.category.create({
            data: { name: `${PREFIX}category_${suffix}` },
          });
          const product = await prisma.product.create({
            data: {
              name: `${PREFIX}product_${suffix}`,
              price: 100,
              pricePaise: 10000,
              categoryId: category.id,
            },
          });
          const store = await prisma.store.create({
            data: {
              name: `${PREFIX}store_${suffix}`,
              address: 'Cancellation cleanup test store',
              latitude: 17.7,
              longitude: 83.3,
              ownerId: owner.id,
            },
          });
          await prisma.inventory.create({
            data: { storeId: store.id, productId: product.id, quantity: 20 },
          });
          const order = await prisma.order.create({
            data: {
              customerId: customer.id,
              storeId: store.id,
              status: OrderStatus.PACKED,
              totalAmount: 100,
              subtotal: 100,
              grandTotal: 100,
              subtotalPaise: 10000,
              grandTotalPaise: 10000,
              packedAt: new Date(),
              deliveryLat: 17.72,
              deliveryLng: 83.32,
              items: {
                create: [{
                  productId: product.id,
                  quantity: 1,
                  price: 100,
                  unitPricePaise: 10000,
                  lineTotalPaise: 10000,
                }],
              },
            },
          });

          return { owner, admin, customer, riderUser, rider, store, product, order };
        }

        describe('Order cancellation delivery-job cleanup', () => {
          beforeEach(async () => cleanup());

          afterAll(async () => {
            await cleanup();
            await prisma.$disconnect();
          });

          it('customer cancellation cancels the delivery job and open dispatch offers', async () => {
            const data = await seed();
            const delivery = deliveryServices();
            const job = await delivery.jobs.createForPackedOrder(data.order.id, {
              id: data.admin.id,
              role: Role.ADMIN,
            });
            const offer = await delivery.assignments.offer(job.id, data.riderUser.id, {
              id: data.admin.id,
              role: Role.ADMIN,
            });

            await prisma.order.update({
              where: { id: data.order.id },
              data: { status: OrderStatus.CONFIRMED },
            });

            const cancelled = await orderService().cancelMyOrder(data.customer.id, data.order.id);
            expect(cancelled.status).toBe(OrderStatus.CANCELLED);

            const storedJob = await prisma.deliveryJob.findUnique({ where: { id: job.id } });
            expect(storedJob?.status).toBe(DeliveryJobStatus.CANCELLED);
            expect(storedJob?.currentRiderId).toBeNull();

            const storedOffer = await prisma.dispatchAssignment.findUnique({ where: { id: offer.id } });
            expect(storedOffer?.status).toBe(DispatchAssignmentStatus.CANCELLED);
            expect(storedOffer?.respondedAt).not.toBeNull();
          });

          it('admin force cancellation clears the active rider lock from a failed delivery job', async () => {
            const data = await seed();
            const delivery = deliveryServices();
            const job = await delivery.jobs.createForPackedOrder(data.order.id, {
              id: data.admin.id,
              role: Role.ADMIN,
            });
            const offer = await delivery.assignments.offer(job.id, data.riderUser.id, {
              id: data.admin.id,
              role: Role.ADMIN,
            });
            await delivery.assignments.accept(offer.id, data.riderUser.id);
            await prisma.deliveryJob.update({
              where: { id: job.id },
              data: { status: DeliveryJobStatus.DELIVERY_FAILED },
            });

            const cancelled = await orderService().forceCancel(
              data.order.id,
              { id: data.admin.id, role: Role.ADMIN },
              'Delivery failed and admin cancelled',
            );
            expect(cancelled.status).toBe(OrderStatus.CANCELLED);

            const storedJob = await prisma.deliveryJob.findUnique({ where: { id: job.id } });
            expect(storedJob?.status).toBe(DeliveryJobStatus.CANCELLED);
            expect(storedJob?.currentRiderId).toBeNull();

            const storedAssignment = await prisma.dispatchAssignment.findUnique({ where: { id: offer.id } });
            expect(storedAssignment?.status).toBe(DispatchAssignmentStatus.ACCEPTED);

            const secondOrder = await prisma.order.create({
              data: {
                customerId: data.customer.id,
                storeId: data.store.id,
                status: OrderStatus.PACKED,
                totalAmount: 100,
                subtotal: 100,
                grandTotal: 100,
                subtotalPaise: 10000,
                grandTotalPaise: 10000,
                packedAt: new Date(),
                items: {
                  create: [{
                    productId: data.product.id,
                    quantity: 1,
                    price: 100,
                    unitPricePaise: 10000,
                    lineTotalPaise: 10000,
                  }],
                },
              },
            });
            const nextJob = await prisma.deliveryJob.create({
              data: {
                orderId: secondOrder.id,
                status: DeliveryJobStatus.RIDER_ASSIGNED,
                currentRiderId: data.rider.id,
              },
            });
            expect(nextJob.currentRiderId).toBe(data.rider.id);
          });
        });
        """
    )
)
