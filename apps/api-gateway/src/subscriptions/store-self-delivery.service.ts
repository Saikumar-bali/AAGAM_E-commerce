import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma, Role, SubscriptionDeliveryStatus, DeliveryJobStatus, prisma } from '@aagam/database';
import { randomUUID } from 'crypto';

type DbClient = Prisma.TransactionClient | typeof prisma;

export class StoreSelfDeliveryService {
  constructor(private readonly prisma: DbClient) {}

  async getTodayQueue(storeId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const deliveries = await (this.prisma as typeof prisma).subscriptionDelivery.findMany({
      where: {
        storeId,
        serviceDate: { gte: today, lt: tomorrow },
        status: { in: ['ORDER_GENERATED', 'PREPARING', 'PACKED', 'STORE_DELIVERING'] },
        subscription: { storeDelivery: true },
      },
      include: {
        subscription: {
          select: {
            id: true,
            customerId: true,
            deliveryMethod: true,
            deliveryWindowStartMinute: true,
            deliveryWindowEndMinute: true,
            customer: { select: { id: true, name: true, phone: true } },
            address: true,
          },
        },
        order: {
          select: {
            id: true,
            status: true,
            grandTotalPaise: true,
            items: {
              select: {
                product: { select: { name: true } },
                quantity: true,
                lineTotalPaise: true,
              },
            },
          },
        },
        deliveryJob: {
          select: {
            id: true,
            status: true,
          },
        },
      },
      orderBy: { sequenceNumber: 'asc' },
    });

    return deliveries.map((d) => {
      const startHour = Math.floor(d.subscription.deliveryWindowStartMinute / 60);
      const startMin = d.subscription.deliveryWindowStartMinute % 60;
      const endHour = Math.floor(d.subscription.deliveryWindowEndMinute / 60);
      const endMin = d.subscription.deliveryWindowEndMinute % 60;

      return {
        id: d.id,
        sequenceNumber: d.sequenceNumber,
        deliverySlot: d.deliverySlot,
        status: d.status,
        serviceDate: d.serviceDate,
        window: `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')} - ${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`,
        customer: {
          id: d.subscription.customer.id,
          name: d.subscription.customer.name,
          phone: d.subscription.customer.phone,
        },
        address: {
          line1: d.subscription.address.line1,
          line2: d.subscription.address.line2,
          city: d.subscription.address.city,
          pincode: d.subscription.address.pincode,
          latitude: d.subscription.address.latitude,
          longitude: d.subscription.address.longitude,
          landmark: d.subscription.address.landmark,
        },
        order: d.order
          ? {
              id: d.order.id,
              status: d.order.status,
              grandTotalPaise: d.order.grandTotalPaise,
              items: d.order.items.map((i) => ({
                name: i.product.name,
                quantity: i.quantity,
                pricePaise: i.lineTotalPaise,
              })),
            }
          : null,
        deliveryJobId: d.deliveryJob?.id || null,
        deliveryJobStatus: d.deliveryJob?.status || null,
      };
    });
  }

  async startDelivery(subscriptionDeliveryId: string, storeUserId: string) {
    const subDelivery = await (this.prisma as typeof prisma).subscriptionDelivery.findUnique({
      where: { id: subscriptionDeliveryId },
      include: { subscription: true, deliveryJob: true },
    });

    if (!subDelivery) throw new NotFoundException('Subscription delivery not found');
    if (!subDelivery.subscription.storeDelivery) throw new BadRequestException('This subscription is not configured for store delivery');
    if (!['ORDER_GENERATED', 'PREPARING', 'PACKED'].includes(subDelivery.status)) {
      throw new BadRequestException(`Cannot start delivery in status: ${subDelivery.status}`);
    }

    return (this.prisma as typeof prisma).$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.subscriptionDelivery.update({
        where: { id: subscriptionDeliveryId },
        data: { status: SubscriptionDeliveryStatus.STORE_DELIVERING },
      });

      if (subDelivery.deliveryJobId) {
        await tx.deliveryJob.update({
          where: { id: subDelivery.deliveryJobId },
          data: { status: DeliveryJobStatus.STORE_DELIVERING },
        });
      }

      await tx.subscriptionAuditEntry.create({
        data: {
          subscriptionId: subDelivery.subscriptionId,
          actorUserId: storeUserId,
          actorRole: Role.STORE_OWNER,
          action: 'STORE_DELIVERY_STARTED',
          reason: 'Store staff started delivery',
          metadata: { subscriptionDeliveryId, deliverySlot: subDelivery.deliverySlot },
          idempotencyKey: `store-delivery-start:${subscriptionDeliveryId}:${randomUUID()}`,
        },
      });

      return { success: true, deliveryId: subscriptionDeliveryId, status: 'STORE_DELIVERING' };
    });
  }

  async verifyAndCompleteDelivery(
    subscriptionDeliveryId: string,
    storeUserId: string,
    dto: {
      verifiedCustomerName: string;
      verifiedCustomerPhone: string;
      gpsLat?: number;
      gpsLng?: number;
      notes?: string;
      cashCollectedPaise?: number;
    },
  ) {
    const subDelivery = await (this.prisma as typeof prisma).subscriptionDelivery.findUnique({
      where: { id: subscriptionDeliveryId },
      include: {
        subscription: {
          include: { customer: { select: { name: true, phone: true } } },
        },
        deliveryJob: true,
      },
    });

    if (!subDelivery) throw new NotFoundException('Subscription delivery not found');
    if (subDelivery.status !== 'STORE_DELIVERING') {
      throw new BadRequestException(`Delivery is not in progress. Current status: ${subDelivery.status}`);
    }

    const customerNameMatch = dto.verifiedCustomerName.trim().toLowerCase() === (subDelivery.subscription.customer.name || '').toLowerCase();
    const phoneDigits = dto.verifiedCustomerPhone.replace(/\D/g, '');
    const storedPhone = (subDelivery.subscription.customer.phone || '').replace(/\D/g, '');
    const customerPhoneMatch = phoneDigits.endsWith(storedPhone.slice(-4)) || storedPhone.endsWith(phoneDigits.slice(-4));

    return (this.prisma as typeof prisma).$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.subscriptionDelivery.update({
        where: { id: subscriptionDeliveryId },
        data: {
          status: SubscriptionDeliveryStatus.DELIVERED,
          deliveredAt: new Date(),
          deliveredByStoreUserId: storeUserId,
          cashCollectedPaise: dto.cashCollectedPaise || 0,
          cashCollectedAt: dto.cashCollectedPaise ? new Date() : undefined,
        },
      });

      if (subDelivery.deliveryJobId) {
        await tx.deliveryJob.update({
          where: { id: subDelivery.deliveryJobId },
          data: { status: DeliveryJobStatus.DELIVERED },
        });

        if (subDelivery.deliveryJob?.orderId) {
          await tx.order.update({
            where: { id: subDelivery.deliveryJob.orderId },
            data: { status: 'DELIVERED', deliveredAt: new Date() },
          });
        }

        await tx.storeDeliveryProof.create({
          data: {
            deliveryJobId: subDelivery.deliveryJobId,
            subscriptionDeliveryId,
            storeUserId,
            customerNameVerified: customerNameMatch,
            customerPhoneVerified: customerPhoneMatch,
            verifiedCustomerName: dto.verifiedCustomerName,
            verifiedCustomerPhone: dto.verifiedCustomerPhone,
            gpsLat: dto.gpsLat,
            gpsLng: dto.gpsLng,
            notes: dto.notes,
          },
        });
      }

      await tx.customerSubscription.update({
        where: { id: subDelivery.subscriptionId },
        data: { completedDeliveries: { increment: 1 } },
      });

      await tx.subscriptionAuditEntry.create({
        data: {
          subscriptionId: subDelivery.subscriptionId,
          actorUserId: storeUserId,
          actorRole: Role.STORE_OWNER,
          action: 'STORE_DELIVERY_COMPLETED',
          reason: dto.notes || 'Store delivery completed with customer verification',
          metadata: {
            subscriptionDeliveryId,
            customerNameMatch,
            customerPhoneMatch,
            verifiedName: dto.verifiedCustomerName,
            cashCollected: dto.cashCollectedPaise || 0,
          },
          idempotencyKey: `store-delivery-complete:${subscriptionDeliveryId}:${randomUUID()}`,
        },
      });

      return {
        success: true,
        deliveryId: subscriptionDeliveryId,
        status: 'DELIVERED',
        verification: {
          nameMatch: customerNameMatch,
          phoneMatch: customerPhoneMatch,
        },
      };
    });
  }

  async recordDeliveryFailure(
    subscriptionDeliveryId: string,
    storeUserId: string,
    reason: string,
  ) {
    const subDelivery = await (this.prisma as typeof prisma).subscriptionDelivery.findUnique({
      where: { id: subscriptionDeliveryId },
      include: { subscription: true },
    });

    if (!subDelivery) throw new NotFoundException('Subscription delivery not found');
    if (!['STORE_DELIVERING', 'PREPARING', 'PACKED', 'ORDER_GENERATED'].includes(subDelivery.status)) {
      throw new BadRequestException(`Cannot record failure in status: ${subDelivery.status}`);
    }

    return (this.prisma as typeof prisma).$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.subscriptionDelivery.update({
        where: { id: subscriptionDeliveryId },
        data: {
          status: SubscriptionDeliveryStatus.FAILED,
          failedAt: new Date(),
          failureReason: reason,
        },
      });

      if (subDelivery.deliveryJobId) {
        await tx.deliveryJob.update({
          where: { id: subDelivery.deliveryJobId },
          data: { status: DeliveryJobStatus.DELIVERY_FAILED },
        });
      }

      await tx.customerSubscription.update({
        where: { id: subDelivery.subscriptionId },
        data: { failedDeliveries: { increment: 1 } },
      });

      await tx.subscriptionAuditEntry.create({
        data: {
          subscriptionId: subDelivery.subscriptionId,
          actorUserId: storeUserId,
          actorRole: Role.STORE_OWNER,
          action: 'STORE_DELIVERY_FAILED',
          reason,
          metadata: { subscriptionDeliveryId },
          idempotencyKey: `store-delivery-fail:${subscriptionDeliveryId}:${randomUUID()}`,
        },
      });

      return { success: true, deliveryId: subscriptionDeliveryId, status: 'FAILED', reason };
    });
  }

  async getCustomerInfoForVerification(subscriptionDeliveryId: string) {
    const subDelivery = await (this.prisma as typeof prisma).subscriptionDelivery.findUnique({
      where: { id: subscriptionDeliveryId },
      include: {
        subscription: {
          include: {
            customer: { select: { id: true, name: true, phone: true, avatarUrl: true } },
            address: true,
          },
        },
      },
    });

    if (!subDelivery) throw new NotFoundException('Subscription delivery not found');

    const phone = subDelivery.subscription.customer.phone || '';
    const maskedPhone = phone.length > 4 ? '****' + phone.slice(-4) : phone;

    return {
      customerId: subDelivery.subscription.customer.id,
      customerName: subDelivery.subscription.customer.name,
      maskedPhone,
      address: {
        line1: subDelivery.subscription.address.line1,
        line2: subDelivery.subscription.address.line2,
        landmark: subDelivery.subscription.address.landmark,
        city: subDelivery.subscription.address.city,
        pincode: subDelivery.subscription.address.pincode,
      },
    };
  }
}
