import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DeliveryJobStatus, OrderStatus, PaymentStatus, Role, prisma } from '@aagam/database';
import { randomUUID } from 'crypto';
import { OrderService } from './order.service';
import { DeliveryJobService } from './delivery-job.service';
import { AutoDispatchService } from './auto-dispatch.service';

type FulfillmentIssue = {
  itemId: string;
  productId: string;
  productName?: string | null;
  status: 'UNAVAILABLE' | 'RESOLVED';
  reason?: string;
  substituteProductId?: string;
  substituteProductName?: string;
  createdAt: string;
  resolvedAt?: string | null;
};

@Injectable()
export class StoreFulfillmentService {
  constructor(
    private readonly orderService: OrderService,
    @Optional() private readonly deliveryJobs?: DeliveryJobService,
    @Optional() private readonly autoDispatch?: AutoDispatchService,
  ) {}

  private editableStatuses = [OrderStatus.PENDING, OrderStatus.PAYMENT_PENDING, OrderStatus.CONFIRMED, OrderStatus.PICKING];

  private snapshot(order: any) {
    const value = order.itemsSnapshot;
    return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
  }

  private issues(snapshot: any): FulfillmentIssue[] {
    return Array.isArray(snapshot.fulfillmentIssues) ? [...snapshot.fulfillmentIssues] : [];
  }

  private async ownedOrder(orderId: string, ownerId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { store: true, items: { include: { product: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.store.ownerId !== ownerId) throw new ForbiddenException('Not allowed to update orders for this store');
    return order;
  }

  private assertEditable(status: OrderStatus) {
    if (!(this.editableStatuses as OrderStatus[]).includes(status)) {
      throw new BadRequestException(`Cannot edit item issues when order is ${status}`);
    }
  }

  async markItemUnavailable(orderId: string, itemId: string, ownerId: string, reason?: string) {
    const order = await this.ownedOrder(orderId, ownerId);
    this.assertEditable(order.status as OrderStatus);
    const item = order.items.find((entry) => entry.id === itemId);
    if (!item) throw new NotFoundException('Order item not found');

    const snapshot = this.snapshot(order);
    const issues = this.issues(snapshot).filter((issue) => !(issue.itemId === itemId && issue.status === 'UNAVAILABLE'));
    const issue: FulfillmentIssue = {
      itemId,
      productId: item.productId,
      productName: item.product?.name,
      status: 'UNAVAILABLE',
      reason: reason || 'Marked unavailable by store',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    };
    issues.push(issue);

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { itemsSnapshot: { ...snapshot, fulfillmentIssues: issues } },
      include: { items: { include: { product: true } }, statusHistory: { orderBy: { createdAt: 'asc' } } },
    });

    await this.orderService.recordStatusHistory({
      orderId,
      fromStatus: order.status as OrderStatus,
      toStatus: order.status as OrderStatus,
      actor: { id: ownerId, role: Role.STORE_OWNER },
      note: 'Store marked an item unavailable.',
      metadata: { fulfillmentIssue: issue },
    });

    return updated;
  }

  async listSubstitutes(orderId: string, itemId: string, ownerId: string) {
    const order = await this.ownedOrder(orderId, ownerId);
    const item = order.items.find((entry) => entry.id === itemId);
    if (!item) throw new NotFoundException('Order item not found');

    const products = await prisma.product.findMany({
      where: {
        id: { not: item.productId },
        categoryId: item.product.categoryId,
        isActive: true,
        deletedAt: null,
        inventory: { some: { storeId: order.storeId, quantity: { gte: item.quantity } } },
      },
      include: { category: true, inventory: { where: { storeId: order.storeId }, select: { storeId: true, quantity: true } } },
      orderBy: { name: 'asc' },
      take: 8,
    });

    return products.map(({ inventory, ...product }) => ({
      ...product,
      availability: {
        storeId: order.storeId,
        availableQty: inventory[0]?.quantity || 0,
        inStock: (inventory[0]?.quantity || 0) >= item.quantity,
      },
    }));
  }

  async substituteItem(orderId: string, itemId: string, substituteProductId: string, ownerId: string) {
    const order = await this.ownedOrder(orderId, ownerId);
    this.assertEditable(order.status as OrderStatus);
    const item = order.items.find((entry) => entry.id === itemId);
    if (!item) throw new NotFoundException('Order item not found');

    const substitute = await prisma.product.findFirst({
      where: {
        id: substituteProductId,
        categoryId: item.product.categoryId,
        isActive: true,
        deletedAt: null,
      },
      include: { inventory: { where: { storeId: order.storeId } } },
    });
    if (!substitute) throw new NotFoundException('Substitute product not found');
    const available = substitute.inventory[0]?.quantity || 0;
    if (available < item.quantity) throw new BadRequestException('Substitute does not have enough stock');

    const oldLinePaise = item.lineTotalPaise || Math.round(item.price * 100) * item.quantity;
    const newUnitPaise = substitute.pricePaise || Math.round(substitute.price * 100);
    const newLinePaise = newUnitPaise * item.quantity;
    const deltaPaise = newLinePaise - oldLinePaise;
    const snapshot = this.snapshot(order);
    const pricingSnapshot = order.pricingSnapshot && typeof order.pricingSnapshot === 'object' && !Array.isArray(order.pricingSnapshot)
      ? order.pricingSnapshot as Record<string, unknown>
      : {};
    const currentSubtotalPaise = order.items.reduce(
      (sum, entry) => sum + (entry.lineTotalPaise || Math.round(entry.price * 100) * entry.quantity),
      0,
    );
    const nextSubtotalPaise = Math.max(0, currentSubtotalPaise + deltaPaise);
    const currentDeliveryFeePaise = order.deliveryFeePaise || Math.round((order.deliveryFee || 0) * 100);
    const currentDiscountPaise = order.discountPaise || Math.round((order.discountAmount || 0) * 100);
    const currentTaxPaise = order.taxPaise || Math.round((order.taxAmount || 0) * 100);
    const deliveryFeePaise = currentDeliveryFeePaise || Number(pricingSnapshot.deliveryFeePaise || 0);
    const discountPaise = currentDiscountPaise || Number(pricingSnapshot.discountPaise || 0);
    const taxPaise = currentTaxPaise || Number(pricingSnapshot.taxPaise || 0);
    const nextGrandTotalPaise = Math.max(0, nextSubtotalPaise + deliveryFeePaise + taxPaise - discountPaise);
    const issues = this.issues(snapshot).map((issue) =>
      issue.itemId === itemId && issue.status === 'UNAVAILABLE'
        ? { ...issue, status: 'RESOLVED' as const, substituteProductId: substitute.id, substituteProductName: substitute.name, resolvedAt: new Date().toISOString() }
        : issue,
    );
    const substitutions = Array.isArray(snapshot.substitutions) ? [...snapshot.substitutions] : [];
    substitutions.push({ itemId, fromProductId: item.productId, fromProductName: item.product.name, toProductId: substitute.id, toProductName: substitute.name, quantity: item.quantity, deltaPaise, createdAt: new Date().toISOString() });

    const updated = await prisma.$transaction(async (tx) => {
      await tx.orderItem.update({
        where: { id: itemId },
        data: { productId: substitute.id, price: substitute.price, unitPricePaise: newUnitPaise, lineTotalPaise: newLinePaise },
      });
      const orderUpdate = await tx.order.update({
        where: { id: orderId },
        data: {
          totalAmount: Number((nextGrandTotalPaise / 100).toFixed(2)),
          subtotal: Number((nextSubtotalPaise / 100).toFixed(2)),
          grandTotal: Number((nextGrandTotalPaise / 100).toFixed(2)),
          subtotalPaise: nextSubtotalPaise,
          grandTotalPaise: nextGrandTotalPaise,
          itemsSnapshot: { ...snapshot, fulfillmentIssues: issues, substitutions },
        },
        include: { items: { include: { product: true } }, statusHistory: { orderBy: { createdAt: 'asc' } } },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status as OrderStatus,
          toStatus: order.status as OrderStatus,
          actorUserId: ownerId,
          actorRole: Role.STORE_OWNER,
          note: 'Store substituted an unavailable item.',
          metadata: { itemId, substituteProductId: substitute.id, deltaPaise },
        },
      });
      return orderUpdate;
    });

    return updated;
  }

  async readyForPickup(orderId: string, ownerId: string) {
    const order = await this.ownedOrder(orderId, ownerId);
    const unresolved = this.issues(this.snapshot(order)).filter((issue) => issue.status !== 'RESOLVED');
    if (unresolved.length > 0) {
      throw new BadRequestException('Resolve unavailable items before marking ready for pickup');
    }

    const packedOrder = await this.orderService.updateStatus(
      orderId,
      OrderStatus.PACKED,
      { id: ownerId, role: Role.STORE_OWNER },
    );

    // Store-delivery orders skip rider dispatch — the store fulfills directly.
    if (order.storeDelivery) {
      return packedOrder;
    }

    // Nest injects DeliveryJobService in the running API. It is optional so the
    // existing isolated store tests can still construct this service directly.
    if (this.deliveryJobs) {
      const job = await this.deliveryJobs.createForPackedOrder(orderId, { id: ownerId, role: Role.STORE_OWNER });
      if (job && this.autoDispatch) {
        await this.autoDispatch.dispatchNearestRider(job.id).catch((err) => {
          console.error('[AutoDispatch] Failed to dispatch nearest rider:', err?.message || err);
        });
      }
    }

    return packedOrder;
  }

  async startStoreDelivery(orderId: string, ownerId: string) {
    const order = await this.ownedOrder(orderId, ownerId);
    const eligibleStatuses: OrderStatus[] = [OrderStatus.PACKED, OrderStatus.CONFIRMED, OrderStatus.PICKING];
    if (!eligibleStatuses.includes(order.status as OrderStatus)) {
      throw new BadRequestException(`Cannot start store delivery in status: ${order.status}`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.STORE_DELIVERING,
          storeDelivery: true,
          outForDeliveryAt: new Date(),
        },
      });

      // Update DeliveryJob if exists and detach rider
      await tx.deliveryJob.updateMany({
        where: { orderId },
        data: {
          status: DeliveryJobStatus.STORE_DELIVERING,
          currentRiderId: null,
        },
      });

      // Cancel any active rider dispatch assignment
      await tx.dispatchAssignment.updateMany({
        where: {
          deliveryJob: { orderId },
          status: { in: ['CREATED', 'OFFERED'] },
        },
        data: {
          status: 'CANCELLED',
          rejectionReason: 'Store opted for self-delivery',
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status as OrderStatus,
          toStatus: OrderStatus.STORE_DELIVERING,
          actorUserId: ownerId,
          actorRole: Role.STORE_OWNER,
          note: 'Store started direct delivery',
          metadata: { orderId, selfDelivery: true, idempotencyKey: `store-delivery-start:${orderId}:${randomUUID()}` },
        },
      });

      return updatedOrder;
    });

    await this.orderService.emitTrackingUpdate(orderId).catch(() => {});
    return updated;
  }

  async completeStoreDelivery(orderId: string, ownerId: string) {
    const order = await this.ownedOrder(orderId, ownerId);
    if (order.status !== OrderStatus.STORE_DELIVERING) {
      throw new BadRequestException(`Cannot complete store delivery in status: ${order.status}`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.STORE_DELIVERED,
          deliveredAt: new Date(),
        },
      });

      // Update DeliveryJob if exists
      await tx.deliveryJob.updateMany({
        where: { orderId },
        data: { status: DeliveryJobStatus.DELIVERED },
      });

      // If COD and payment was pending, mark as CAPTURED
      await tx.payment.updateMany({
        where: {
          orderId,
          method: 'COD',
          status: { in: [PaymentStatus.PENDING_COD, PaymentStatus.CREATED] },
        },
        data: {
          status: PaymentStatus.CAPTURED,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: OrderStatus.STORE_DELIVERING,
          toStatus: OrderStatus.STORE_DELIVERED,
          actorUserId: ownerId,
          actorRole: Role.STORE_OWNER,
          note: 'Store delivered the order',
          metadata: { orderId, completedByStore: true, idempotencyKey: `store-delivery-complete:${orderId}:${randomUUID()}` },
        },
      });

      return updatedOrder;
    });

    await this.orderService.emitTrackingUpdate(orderId).catch(() => {});
    return updated;
  }
}
