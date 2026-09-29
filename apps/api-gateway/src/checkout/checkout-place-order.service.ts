/**
 * Idempotent, serializable order placement.
 *
 * Split out of the former checkout.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CouponRedemptionStatus, OrderSource, PaymentMethod, PaymentStatus, Prisma, Role, prisma } from '@aagam/database';
import { CheckoutPlaceOrderDto } from './dto/checkout.dto';
import { DELIVERY_TIME_ZONE } from './delivery-slots';
import { formatInstantInZone, isOpenAt, nextOpenAt, windowWithinOpenHours } from '../stores/operating-hours';
import { OrderCreationService } from '../orders/order-creation.service';
import { PromotionsService } from '../promotions/promotions.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { CheckoutQuoteService } from './checkout-quote.service';
import { CheckoutServiceBase } from './checkout.service.base';
import { PREORDER_SLOT_CAPACITY, normalizeItems } from './checkout.shared';

const logger = new Logger('CheckoutService');

@Injectable()
export class CheckoutPlaceOrderService extends CheckoutServiceBase {
  constructor(private readonly orderCreation: OrderCreationService, private readonly promotionsService: PromotionsService | undefined, private readonly trackingGateway: TrackingGateway, private readonly quoteService: CheckoutQuoteService) {
    super();
  }

  async placeOrder(userId: string, dto: CheckoutPlaceOrderDto, idempotencyKey?: string) {
    const deliveryWindow = this.validateDeliveryWindow(dto);
    for (const item of dto.items) {
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        throw new BadRequestException(`Invalid quantity for product ${item.productId}: must be a positive integer`);
      }
    }

    const address = await prisma.customerAddress.findFirst({ where: { id: dto.addressId, userId } });
    if (!address) throw new NotFoundException('Address not found');
    if (!address.phoneE164) throw new BadRequestException('Delivery contact number missing for address');

    if (idempotencyKey) {
      const existing = await prisma.order.findFirst({ where: { idempotencyKey } });
      if (existing) {
        if (existing.customerId !== userId) {
          throw new ConflictException('Idempotency-Key already used');
        }
        return existing;
      }
    }

    const normalizedItems = normalizeItems(dto.items);
    const quote = await this.quoteService.quote(userId, {
      items: normalizedItems,
      addressId: dto.addressId,
      couponCode: dto.couponCode,
    });
    if (!quote.serviceable) {
      throw new BadRequestException('Address is not serviceable');
    }

    const computedGrandTotalPaise = quote.invoice.subtotalPaise + quote.invoice.deliveryFeePaise + quote.invoice.taxPaise - quote.invoice.discountPaise;
    if (computedGrandTotalPaise !== quote.invoice.grandTotalPaise) {
      throw new Error('Grand total mismatch in pricing');
    }
    if (quote.invoice.grandTotalPaise < 0) {
      throw new BadRequestException('Grand total cannot be negative');
    }

    for (const item of quote.invoice.items) {
      const expectedLineTotalPaise = item.unitPricePaise * item.quantity;
      if (expectedLineTotalPaise !== item.lineTotalPaise) {
        throw new Error(`Line total mismatch for ${item.name}`);
      }
    }

    const outOfStock = quote.invoice.items.filter((i) => i.inStock === false);
    if (outOfStock.length) {
      throw new BadRequestException(`Out of stock: ${outOfStock.map((i) => i.name).join(', ')}`);
    }

    const storeId = quote.store?.id;
    if (!storeId) throw new NotFoundException('No store available');

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, operatingHours: true, timezone: true },
    });
    if (!store) throw new NotFoundException('Store not available');
    const storeTimezone = store.timezone || DELIVERY_TIME_ZONE;
    const now = new Date();
    if (deliveryWindow) {
      if (!windowWithinOpenHours(store, deliveryWindow.start, deliveryWindow.end)) {
        const nextOpen = nextOpenAt(store, now);
        throw new BadRequestException(
          nextOpen
            ? `The selected window falls outside ${store.name}'s operating hours. The store opens ${formatInstantInZone(nextOpen, storeTimezone)}.`
            : `The selected window falls outside ${store.name}'s operating hours.`,
        );
      }
    } else if (!isOpenAt(store, now)) {
      const nextOpen = nextOpenAt(store, now);
      throw new BadRequestException(
        nextOpen
          ? `${store.name} is closed right now. Pre-order instead for delivery from ${formatInstantInZone(nextOpen, storeTimezone)}.`
          : `${store.name} is closed right now. Please check back later.`,
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new NotFoundException('Customer not found');

    const orderStatus = dto.paymentMethod === PaymentMethod.COD ? 'CONFIRMED' : 'PAYMENT_PENDING';
    const paymentStatus = dto.paymentMethod === PaymentMethod.COD ? PaymentStatus.PENDING_COD : PaymentStatus.CREATED;

    const pricingSnapshot = {
      items: quote.invoice.items.map((it) => ({
        productId: it.productId,
        productName: it.name,
        quantity: it.quantity,
        unitPricePaise: it.unitPricePaise,
        lineTotalPaise: it.lineTotalPaise,
      })),
      subtotalPaise: quote.invoice.subtotalPaise,
      deliveryFeePaise: quote.invoice.deliveryFeePaise,
      discountPaise: quote.invoice.discountPaise,
      taxPaise: quote.invoice.taxPaise,
      grandTotalPaise: quote.invoice.grandTotalPaise,
      currency: 'INR',
      paymentMethod: dto.paymentMethod,
      calculatedAt: new Date().toISOString(),
      etaMinutes: quote.etaMinutes,
      distanceKm: quote.distanceKm,
      deliveryPricing: quote.deliveryPricing,
      coupon: quote.appliedCoupon
        ? {
            ...quote.appliedCoupon,
            ruleSnapshot: null,
          }
        : null,
    };

    try {
      const committedOrder = await prisma.$transaction(async (tx) => {
      const transactionPriorOrder = await tx.order.findFirst({
        where: {
          customerId: userId,
          status: { notIn: ['CANCELLED', 'PAYMENT_FAILED'] as any },
        },
        select: { id: true },
      });
      const transactionFirstOrderEligible = !transactionPriorOrder;
      if (transactionFirstOrderEligible !== Boolean(quote.deliveryPricing?.waivedByFirstOrder)) {
        throw new ConflictException('First-order delivery offer changed. Refresh checkout and try again.');
      }
      if (deliveryWindow) {
        const reserved = await tx.order.count({
          where: {
            storeId,
            status: { notIn: ['CANCELLED', 'PAYMENT_FAILED'] as any },
            deliveryWindowStart: deliveryWindow.start,
            deliveryWindowEnd: deliveryWindow.end,
          },
        });
        if (reserved >= PREORDER_SLOT_CAPACITY) throw new ConflictException('The selected delivery window is full');
      }
      const transactionPromotionPricing = this.promotionsService
        ? await this.promotionsService.calculateDiscount(
            {
              userId,
              couponCode: dto.couponCode,
              storeId,
              subtotalPaise: quote.invoice.subtotalPaise,
              deliveryFeePaise: quote.invoice.deliveryFeePaise,
              lines: quote.invoice.items.map((item) => ({
                productId: item.productId,
                categoryId: item.categoryId,
                lineTotalPaise: item.lineTotalPaise,
              })),
            },
            tx,
          )
        : { coupon: null, discountPaise: 0, eligibleSubtotalPaise: 0, ruleSnapshot: null };
      if (
        transactionPromotionPricing.discountPaise !== quote.invoice.discountPaise ||
        transactionPromotionPricing.coupon?.id !== quote.appliedCoupon?.id
      ) {
        throw new ConflictException('Offer availability changed. Refresh checkout and try again.');
      }
      const transactionPricingSnapshot = transactionPromotionPricing.coupon
        ? {
            ...pricingSnapshot,
            coupon: {
              ...quote.appliedCoupon,
              ruleSnapshot: transactionPromotionPricing.ruleSnapshot,
            },
          }
        : pricingSnapshot;

      const created = await this.orderCreation.createWithinTransaction(tx, {
        customerId: userId,
        storeId,
        actorUserId: userId,
        actorRole: Role.CUSTOMER,
        status: orderStatus as 'CONFIRMED' | 'PAYMENT_PENDING',
        orderSource: OrderSource.CHECKOUT,
        paymentMethod: dto.paymentMethod,
        paymentStatus,
        paymentProvider: dto.paymentMethod === PaymentMethod.COD ? 'COD' : 'SIMULATED',
        paymentAmountPaise: quote.invoice.grandTotalPaise,
        currency: 'INR',
        idempotencyKey: idempotencyKey || `checkout:${userId}:${Date.now()}`,
        customerSnapshot: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        addressSnapshot: {
          id: address.id,
          label: address.label,
          recipientName: address.recipientName,
          phoneE164: address.phoneE164,
          alternatePhoneE164: (address as any).alternatePhoneE164,
          line1: address.line1,
          line2: address.line2,
          landmark: address.landmark,
          city: address.city,
          state: address.state,
          pincode: address.pincode,
          country: address.country,
          latitude: address.latitude,
          longitude: address.longitude,
          instructions: address.instructions,
        },
        pricingSnapshot: transactionPricingSnapshot,
        lines: quote.invoice.items.map((item) => ({
          productId: item.productId,
          categoryId: item.categoryId,
          name: item.name,
          image: item.image,
          quantity: item.quantity,
          unitPricePaise: item.unitPricePaise,
          lineTotalPaise: item.lineTotalPaise,
        })),
        subtotalPaise: quote.invoice.subtotalPaise,
        deliveryFeePaise: quote.invoice.deliveryFeePaise,
        discountPaise: quote.invoice.discountPaise,
        taxPaise: quote.invoice.taxPaise,
        grandTotalPaise: quote.invoice.grandTotalPaise,
        deliveryLat: address.latitude,
        deliveryLng: address.longitude,
        scheduledDeliveryDate: deliveryWindow?.start ?? null,
        deliveryWindowStart: deliveryWindow?.start ?? null,
        deliveryWindowEnd: deliveryWindow?.end ?? null,
        reservationNote: deliveryWindow ? `Scheduled checkout inventory reservation for ${deliveryWindow.start.toISOString()}` : 'Checkout inventory reservation',
        outboxMetadata: deliveryWindow ? {
          fulfillmentType: 'SCHEDULED',
          deliveryWindowStart: deliveryWindow.start.toISOString(),
          deliveryWindowEnd: deliveryWindow.end.toISOString(),
        } : { fulfillmentType: 'IMMEDIATE' },
        storeDelivery: dto.storeDelivery ?? false,
      });

      if (transactionPromotionPricing.coupon) {
        await tx.couponRedemption.create({
          data: {
            couponId: transactionPromotionPricing.coupon.id,
            orderId: created.id,
            customerId: userId,
            codeSnapshot: transactionPromotionPricing.coupon.code,
            status:
              dto.paymentMethod === PaymentMethod.COD
                ? CouponRedemptionStatus.REDEEMED
                : CouponRedemptionStatus.RESERVED,
            discountPaise: transactionPromotionPricing.discountPaise,
            ruleSnapshot: transactionPromotionPricing.ruleSnapshot,
            ...(dto.paymentMethod === PaymentMethod.COD
              ? { redeemedAt: new Date() }
              : {}),
          },
        });
      }

      return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      await this.announceOrderPlaced({
        created: committedOrder,
        storeId,
        user,
        address,
        paymentMethod: dto.paymentMethod,
      });
      return committedOrder;
    } catch (error: any) {
      if (error?.code === 'P2034' || error?.code === 'P2002') {
        throw new ConflictException('Offer or inventory availability changed. Refresh checkout and try again.');
      }
      throw error;
    }
  }

  protected async announceOrderPlaced(input: {
    created: any;
    storeId: string;
    user: { name: string | null; email: string };
    address: {
      latitude: number;
      longitude: number;
      line1: string;
      city: string;
    };
    paymentMethod: PaymentMethod;
  }) {
    const { created, storeId, user, address, paymentMethod } = input;
    try {
      const payload = {
        id: created.id,
        shortId: created.id.substring(0, 8).toUpperCase(),
        status: created.status,
        totalAmount: created.totalAmount,
        grandTotal: created.grandTotal,
        itemCount: created.items?.length ?? 0,
        paymentMethod,
        priority: paymentMethod === PaymentMethod.COD ? 'HIGH' : 'NORMAL',
        createdAt: created.createdAt,
        store: { id: storeId, name: created.store?.name || null },
        customer: { name: user.name, email: user.email },
        delivery: {
          latitude: address.latitude,
          longitude: address.longitude,
          address: address.line1,
          city: address.city,
        },
      };
      this.trackingGateway.server
        ?.to('admin_orders')
        .emit('orderPlaced', payload);
      this.trackingGateway.server
        ?.to('admin_monitor')
        .emit('orderPlaced', payload);
      logger.log(`Order placement announced to operational dashboards order=${created.id}`);
    } catch (error) {
      logger.error(
        `Failed to announce committed order: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
