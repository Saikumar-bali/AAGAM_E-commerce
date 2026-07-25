import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { OrderStatus, Role, prisma } from '@aagam/database';
import { OrderService } from './order.service';
import { DeliveryJobService } from './delivery-job.service';

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
          totalAmount: Number(((order.totalAmount || 0) + deltaPaise / 100).toFixed(2)),
          subtotal: Number(((order.subtotal || 0) + deltaPaise / 100).toFixed(2)),
          grandTotal: Number(((order.grandTotal || 0) + deltaPaise / 100).toFixed(2)),
          subtotalPaise: (order.subtotalPaise || 0) + deltaPaise,
          grandTotalPaise: (order.grandTotalPaise || 0) + deltaPaise,
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

    // Nest injects DeliveryJobService in the running API. It is optional so the
    // existing isolated store tests can still construct this service directly.
    if (this.deliveryJobs) {
      await this.deliveryJobs.createForPackedOrder(orderId, { id: ownerId, role: Role.STORE_OWNER });
    }

    return packedOrder;
  }
}
