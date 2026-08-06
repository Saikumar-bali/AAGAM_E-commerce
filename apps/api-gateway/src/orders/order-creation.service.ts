import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  InventoryAdjustmentReason,
  OrderSource,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Role,
  prisma,
} from '@aagam/database';
import { enqueueOutboxEvent } from '../notifications/outbox.service';
import { requiredJson } from '../common/prisma-json';

type DbClient = Prisma.TransactionClient;

export type AuthoritativeOrderLine = {
  productId: string;
  name: string;
  image?: string | null;
  categoryId?: string | null;
  quantity: number;
  unitPricePaise: number;
  lineTotalPaise: number;
};

export type CreateAuthoritativeOrderInput = {
  customerId: string;
  storeId: string;
  actorUserId: string;
  actorRole: Role;
  status: 'CONFIRMED' | 'PAYMENT_PENDING';
  orderSource: OrderSource;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentProvider: string;
  paymentAmountPaise: number;
  currency?: string;
  idempotencyKey: string;
  customerSnapshot: unknown;
  addressSnapshot: unknown;
  pricingSnapshot: unknown;
  lines: AuthoritativeOrderLine[];
  subtotalPaise: number;
  deliveryFeePaise?: number;
  discountPaise?: number;
  taxPaise?: number;
  grandTotalPaise: number;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  subscriptionId?: string | null;
  subscriptionDeliveryId?: string | null;
  scheduledDeliveryDate?: Date | null;
  deliveryWindowStart?: Date | null;
  deliveryWindowEnd?: Date | null;
  subscriptionSequence?: number | null;
  reservationReason?: InventoryAdjustmentReason;
  reservationNote?: string;
  outboxMetadata?: Record<string, unknown>;
};

function assertMoney(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BadRequestException(`${field} must be a non-negative integer amount in paise`);
  }
}

@Injectable()
export class OrderCreationService {
  async createWithinTransaction(tx: DbClient, input: CreateAuthoritativeOrderInput) {
    const existing = await tx.order.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { items: true, payment: true, store: { select: { name: true } } },
    });
    if (existing) {
      if (existing.customerId !== input.customerId) {
        throw new ConflictException('Idempotency-Key already belongs to another customer');
      }
      return existing;
    }

    if (!input.lines.length) throw new BadRequestException('An order requires at least one item');
    for (const [field, value] of Object.entries({
      subtotalPaise: input.subtotalPaise,
      deliveryFeePaise: input.deliveryFeePaise ?? 0,
      discountPaise: input.discountPaise ?? 0,
      taxPaise: input.taxPaise ?? 0,
      grandTotalPaise: input.grandTotalPaise,
      paymentAmountPaise: input.paymentAmountPaise,
    })) assertMoney(value, field);

    const calculatedSubtotal = input.lines.reduce((sum, line) => {
      if (!Number.isInteger(line.quantity) || line.quantity < 1) {
        throw new BadRequestException(`Invalid quantity for ${line.productId}`);
      }
      assertMoney(line.unitPricePaise, `unit price for ${line.productId}`);
      assertMoney(line.lineTotalPaise, `line total for ${line.productId}`);
      return sum + line.lineTotalPaise;
    }, 0);
    if (calculatedSubtotal !== input.subtotalPaise) {
      throw new BadRequestException('Order subtotal does not match item totals');
    }
    const calculatedGrandTotal =
      input.subtotalPaise +
      (input.deliveryFeePaise ?? 0) +
      (input.taxPaise ?? 0) -
      (input.discountPaise ?? 0);
    if (calculatedGrandTotal !== input.grandTotalPaise) {
      throw new BadRequestException('Order grand total is inconsistent');
    }

    const created = await tx.order.create({
      data: {
        customerId: input.customerId,
        storeId: input.storeId,
        status: input.status,
        ...(input.status === 'CONFIRMED' ? { confirmedAt: new Date() } : {}),
        orderSource: input.orderSource,
        subscriptionId: input.subscriptionId ?? null,
        subscriptionDeliveryId: input.subscriptionDeliveryId ?? null,
        scheduledDeliveryDate: input.scheduledDeliveryDate ?? null,
        deliveryWindowStart: input.deliveryWindowStart ?? null,
        deliveryWindowEnd: input.deliveryWindowEnd ?? null,
        subscriptionSequence: input.subscriptionSequence ?? null,
        totalAmount: input.grandTotalPaise / 100,
        currency: input.currency ?? 'INR',
        subtotal: input.subtotalPaise / 100,
        deliveryFee: (input.deliveryFeePaise ?? 0) / 100,
        discountAmount: (input.discountPaise ?? 0) / 100,
        taxAmount: (input.taxPaise ?? 0) / 100,
        grandTotal: input.grandTotalPaise / 100,
        subtotalPaise: input.subtotalPaise,
        deliveryFeePaise: input.deliveryFeePaise ?? 0,
        discountPaise: input.discountPaise ?? 0,
        taxPaise: input.taxPaise ?? 0,
        grandTotalPaise: input.grandTotalPaise,
        deliveryLat: input.deliveryLat ?? null,
        deliveryLng: input.deliveryLng ?? null,
        idempotencyKey: input.idempotencyKey,
        customerSnapshot: requiredJson(input.customerSnapshot, 'customerSnapshot'),
        addressSnapshot: requiredJson(input.addressSnapshot, 'addressSnapshot'),
        itemsSnapshot: input.lines.map((line) => ({
          productId: line.productId,
          name: line.name,
          image: line.image ?? null,
          quantity: line.quantity,
          unitPrice: line.unitPricePaise / 100,
          lineTotal: line.lineTotalPaise / 100,
          unitPricePaise: line.unitPricePaise,
          lineTotalPaise: line.lineTotalPaise,
        })),
        pricingSnapshot: requiredJson(input.pricingSnapshot, 'pricingSnapshot'),
        items: {
          create: input.lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            price: line.unitPricePaise / 100,
            unitPricePaise: line.unitPricePaise,
            lineTotalPaise: line.lineTotalPaise,
          })),
        },
        payment: {
          create: {
            method: input.paymentMethod,
            status: input.paymentStatus,
            provider: input.paymentProvider,
            amount: input.paymentAmountPaise / 100,
            amountPaise: input.paymentAmountPaise,
            currency: input.currency ?? 'INR',
            idempotencyKey: `payment:${input.idempotencyKey}`,
          },
        },
        statusHistory: {
          create: {
            fromStatus: null,
            toStatus: input.status,
            actorUserId: input.actorUserId,
            actorRole: input.actorRole,
            note:
              input.orderSource === OrderSource.SUBSCRIPTION
                ? 'Subscription occurrence order generated'
                : input.paymentMethod === PaymentMethod.COD
                  ? 'Order placed and confirmed'
                  : 'Order placed, awaiting payment',
          },
        },
      },
      include: { items: true, payment: true, store: { select: { name: true } } },
    });

    for (const line of input.lines) {
      const current = await tx.inventory.findUnique({
        where: { storeId_productId: { storeId: input.storeId, productId: line.productId } },
        select: { quantity: true, isListed: true },
      });
      if (!current?.isListed || current.quantity < line.quantity) {
        throw new BadRequestException(
          `Insufficient inventory for ${line.name}: only ${current?.quantity ?? 0} available`,
        );
      }
      const reserved = await tx.inventory.updateMany({
        where: {
          storeId: input.storeId,
          productId: line.productId,
          isListed: true,
          quantity: { gte: line.quantity },
        },
        data: { quantity: { decrement: line.quantity } },
      });
      if (reserved.count !== 1) throw new ConflictException(`Inventory changed for ${line.name}`);
      await tx.inventoryLedger.create({
        data: {
          storeId: input.storeId,
          productId: line.productId,
          orderId: created.id,
          reason: input.reservationReason ?? InventoryAdjustmentReason.CHECKOUT_RESERVATION,
          quantityDelta: -line.quantity,
          previousQuantity: current.quantity,
          newQuantity: current.quantity - line.quantity,
          actorUserId: input.actorUserId,
          note: input.reservationNote ?? `Inventory reservation for ${line.name}`,
        },
      });
    }

    await enqueueOutboxEvent(tx, {
      eventType: 'ORDER_PLACED',
      aggregateType: 'ORDER',
      aggregateId: created.id,
      idempotencyKey: `order-created:${input.idempotencyKey}`,
      payload: {
        orderId: created.id,
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        metadata: {
          storeId: input.storeId,
          paymentMethod: input.paymentMethod,
          orderSource: input.orderSource,
          itemCount: input.lines.length,
          grandTotalPaise: input.grandTotalPaise,
          amountDuePaise: input.paymentAmountPaise,
          ...(input.outboxMetadata ?? {}),
        },
      },
    });

    return created;
  }

  async create(input: CreateAuthoritativeOrderInput) {
    return prisma.$transaction(
      (tx) => this.createWithinTransaction(tx, input),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
