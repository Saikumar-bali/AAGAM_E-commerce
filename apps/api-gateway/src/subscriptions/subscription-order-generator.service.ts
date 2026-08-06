import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  CustomerSubscriptionStatus,
  OrderSource,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Role,
  SubscriptionDeliveryStatus,
  prisma,
} from '@aagam/database';
import { calculateDistance } from '@aagam/utils';
import { DeliveryJobService } from '../orders/delivery-job.service';
import { OrderCreationService } from '../orders/order-creation.service';
import { serviceWindow, SubscriptionCalendarService } from './subscription-calendar.service';

const logger = new Logger('SubscriptionOrderGenerator');

type SubscriptionItemSnapshot = {
  productId: string;
  name: string;
  image: string | null;
  quantity: number;
  weightPaise: number;
};

function jsonRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function optionalCoordinate(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function allocateAmount(totalPaise: number, weights: number[]) {
  if (!weights.length) return [];
  const normalized = weights.map((weight) => Math.max(1, Math.trunc(weight || 0)));
  const weightTotal = normalized.reduce((sum, weight) => sum + weight, 0);
  const allocated = normalized.map((weight) => Math.floor((totalPaise * weight) / weightTotal));
  let remainder = totalPaise - allocated.reduce((sum, value) => sum + value, 0);
  for (let index = 0; remainder > 0; index = (index + 1) % allocated.length) {
    allocated[index] += 1;
    remainder -= 1;
  }
  return allocated;
}

@Injectable()
export class SubscriptionOrderGenerator {
  constructor(
    private readonly orderCreation: OrderCreationService,
    private readonly deliveryJobs: DeliveryJobService,
    private readonly calendar: SubscriptionCalendarService,
  ) {}

  private items(version: { itemsSnapshot: Prisma.JsonValue }): SubscriptionItemSnapshot[] {
    const value = version.itemsSnapshot;
    if (!Array.isArray(value) || value.length === 0) {
      throw new BadRequestException('Subscription plan version has no item snapshot');
    }
    return value.map((rawItem) => {
      const item = jsonRecord(rawItem);
      const quantity = Number(item.quantityPerDelivery ?? item.quantity ?? 0);
      return {
        productId: String(item.productId ?? ''),
        name: String(item.productName ?? item.name ?? 'Subscription item'),
        image: item.image ? String(item.image) : null,
        quantity,
        weightPaise: Number(item.unitPricePaise ?? item.mrpPaise ?? 1) * Math.max(1, quantity),
      };
    });
  }

  private async resolveStore(
    tx: Prisma.TransactionClient,
    addressSnapshot: Prisma.JsonValue,
    applicabilitySnapshot: Prisma.JsonValue,
    homeStoreId: string | null,
    items: Array<{ productId: string; quantity: number }>,
  ) {
    const address = jsonRecord(addressSnapshot);
    const applicability = jsonRecord(applicabilitySnapshot);
    const allowedStoreIds = Array.isArray(applicability.storeIds) ? applicability.storeIds.map(String) : [];
    const preferredIds = [homeStoreId, ...allowedStoreIds].filter((value): value is string => Boolean(value));
    const stores = await tx.store.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(allowedStoreIds.length ? { id: { in: allowedStoreIds } } : {}),
      },
      select: { id: true, name: true, latitude: true, longitude: true },
    });
    if (!stores.length) throw new BadRequestException('No applicable active store is available');
    const inventory = await tx.inventory.findMany({
      where: { storeId: { in: stores.map((store) => store.id) }, productId: { in: items.map((item) => item.productId) } },
      select: { storeId: true, productId: true, quantity: true, isListed: true },
    });
    const available = new Map<string, Map<string, number>>();
    for (const row of inventory) {
      if (!available.has(row.storeId)) available.set(row.storeId, new Map());
      available.get(row.storeId)!.set(row.productId, row.isListed ? row.quantity : 0);
    }
    const capable = stores.filter((store) => items.every((item) => (available.get(store.id)?.get(item.productId) ?? 0) >= item.quantity));
    if (!capable.length) throw new ConflictException('Subscription inventory is not yet available for this occurrence');
    capable.sort((a, b) => {
      const preferredA = preferredIds.indexOf(a.id);
      const preferredB = preferredIds.indexOf(b.id);
      if (preferredA >= 0 || preferredB >= 0) {
        if (preferredA < 0) return 1;
        if (preferredB < 0) return -1;
        return preferredA - preferredB;
      }
      const lat = Number(address.latitude);
      const lng = Number(address.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return a.name.localeCompare(b.name);
      return calculateDistance(lat, lng, a.latitude, a.longitude) - calculateDistance(lat, lng, b.latitude, b.longitude);
    });
    return capable[0];
  }

  async generateOne(subscriptionDeliveryId: string) {
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`subscription-order:${subscriptionDeliveryId}`}))`);
        const delivery = await tx.subscriptionDelivery.findUnique({
          where: { id: subscriptionDeliveryId },
          include: {
            subscription: {
              include: {
                customer: { select: { id: true, name: true, email: true } },
                plan: true,
                planVersion: true,
              },
            },
            order: true,
          },
        });
        if (!delivery) throw new BadRequestException('Subscription delivery not found');
        if (delivery.order) return delivery;
        if (delivery.status !== SubscriptionDeliveryStatus.SCHEDULED) {
          throw new ConflictException(`Subscription delivery cannot be generated from ${delivery.status}`);
        }
        const subscription = delivery.subscription;
        if ([CustomerSubscriptionStatus.CANCELLED, CustomerSubscriptionStatus.COMPLETED].includes(subscription.status)) {
          throw new ConflictException(`Subscription is ${subscription.status.toLowerCase()}`);
        }
        if (
          subscription.status === CustomerSubscriptionStatus.PAUSED &&
          (!subscription.pauseEffectiveFrom || delivery.serviceDate >= subscription.pauseEffectiveFrom)
        ) {
          throw new ConflictException('Subscription is paused for this service date');
        }
        if (delivery.cashDuePaise === 0 && subscription.remainingFundedDeliveries < 1) {
          throw new ConflictException('Subscription occurrence is not funded yet');
        }
        await tx.subscriptionDelivery.update({
          where: { id: delivery.id },
          data: { status: SubscriptionDeliveryStatus.GENERATING, failureReason: null },
        });
        const itemSnapshots = this.items(subscription.planVersion);
        if (itemSnapshots.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1)) {
          throw new BadRequestException('Subscription item quantities are invalid');
        }
        const store = await this.resolveStore(
          tx,
          subscription.addressSnapshot,
          subscription.planVersion.applicabilitySnapshot,
          subscription.homeStoreId,
          itemSnapshots,
        );
        const accountingSequence = Math.min(delivery.sequenceNumber, subscription.planVersion.totalDeliveries);
        const occurrenceAmountPaise = this.calendar.occurrenceAmount(
          subscription.planVersion.pricePaise,
          subscription.planVersion.totalDeliveries,
          accountingSequence,
        );
        const allocations = allocateAmount(occurrenceAmountPaise, itemSnapshots.map((item) => item.weightPaise));
        const correctLines = itemSnapshots.map((item, index) => ({
          productId: item.productId,
          name: item.name,
          image: item.image,
          quantity: item.quantity,
          unitPricePaise: Math.max(0, Math.floor(allocations[index] / item.quantity)),
          lineTotalPaise: allocations[index],
        }));
        const lineSubtotal = correctLines.reduce((sum, line) => sum + line.lineTotalPaise, 0);
        const accountingAdjustment = occurrenceAmountPaise - lineSubtotal;
        if (accountingAdjustment !== 0) {
          throw new ConflictException('Subscription occurrence allocation did not balance');
        }
        const grandTotalPaise = occurrenceAmountPaise;
        const window = serviceWindow(
          delivery.serviceDate,
          subscription.deliveryWindowStartMinute,
          subscription.deliveryWindowEndMinute,
        );
        const isCashCollection = delivery.cashDuePaise > 0;
        const order = await this.orderCreation.createWithinTransaction(tx, {
          customerId: subscription.customerId,
          storeId: store.id,
          actorUserId: subscription.customerId,
          actorRole: Role.CUSTOMER,
          status: 'CONFIRMED',
          orderSource: OrderSource.SUBSCRIPTION,
          paymentMethod: isCashCollection ? PaymentMethod.COD : PaymentMethod.SUBSCRIPTION_CASH_CREDIT,
          paymentStatus: isCashCollection ? PaymentStatus.PENDING_COD : PaymentStatus.SUBSCRIPTION_FUNDED,
          paymentProvider: isCashCollection ? 'COD' : 'SUBSCRIPTION_ENTITLEMENT',
          paymentAmountPaise: isCashCollection ? delivery.cashDuePaise : 0,
          currency: subscription.planVersion.currency,
          idempotencyKey: delivery.generationKey,
          customerSnapshot: {
            id: subscription.customer.id,
            name: subscription.customer.name,
            email: subscription.customer.email,
            subscriptionId: subscription.id,
          },
          addressSnapshot: jsonRecord(subscription.addressSnapshot),
          pricingSnapshot: {
            source: 'SUBSCRIPTION',
            subscriptionId: subscription.id,
            subscriptionDeliveryId: delivery.id,
            planVersionId: subscription.planVersionId,
            sequenceNumber: delivery.sequenceNumber,
            occurrenceValuePaise: occurrenceAmountPaise,
            accountingAdjustmentPaise: accountingAdjustment,
            customerAmountDuePaise: isCashCollection ? delivery.cashDuePaise : 0,
            funded: !isCashCollection,
            message: isCashCollection ? 'Cash funding collection required' : 'Subscription already funded — do not collect cash',
          },
          lines: correctLines,
          subtotalPaise: lineSubtotal,
          deliveryFeePaise: 0,
          grandTotalPaise,
          deliveryLat: optionalCoordinate(jsonRecord(subscription.addressSnapshot).latitude),
          deliveryLng: optionalCoordinate(jsonRecord(subscription.addressSnapshot).longitude),
          subscriptionId: subscription.id,
          subscriptionDeliveryId: delivery.id,
          scheduledDeliveryDate: delivery.serviceDate,
          deliveryWindowStart: window.start,
          deliveryWindowEnd: window.end,
          subscriptionSequence: delivery.sequenceNumber,
          reservationNote: `Subscription occurrence ${delivery.sequenceNumber} inventory reservation`,
          outboxMetadata: {
            subscriptionId: subscription.id,
            subscriptionDeliveryId: delivery.id,
            serviceDate: delivery.serviceDate.toISOString(),
          },
        });
        const job = await this.deliveryJobs.ensureForSubscriptionOrder(
          order.id,
          { id: subscription.customerId, role: Role.CUSTOMER },
          tx,
        );
        const updated = await tx.subscriptionDelivery.update({
          where: { id: delivery.id },
          data: {
            status: SubscriptionDeliveryStatus.ORDER_GENERATED,
            deliveryJobId: job?.id,
            storeId: store.id,
            generatedAt: new Date(),
          },
          include: { order: { include: { payment: true } }, deliveryJob: true },
        });
        if (!subscription.homeStoreId) {
          await tx.customerSubscription.update({ where: { id: subscription.id }, data: { homeStoreId: store.id } });
        }
        return updated;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error: unknown) {
      await prisma.subscriptionDelivery.updateMany({
        where: { id: subscriptionDeliveryId, status: SubscriptionDeliveryStatus.SCHEDULED },
        data: { failureReason: errorMessage(error).slice(0, 500) },
      }).catch(() => undefined);
      throw error;
    }
  }

  async generateDue(now = new Date(), limit = 100) {
    const candidates = await prisma.subscriptionDelivery.findMany({
      where: {
        status: SubscriptionDeliveryStatus.SCHEDULED,
        serviceDate: { lte: new Date(now.getTime() + 72 * 3_600_000) },
        subscription: {
          status: { notIn: [
            CustomerSubscriptionStatus.CANCELLED,
            CustomerSubscriptionStatus.COMPLETED,
          ] },
        },
      },
      include: { subscription: { include: { plan: true } } },
      orderBy: [{ serviceDate: 'asc' }, { createdAt: 'asc' }],
      take: Math.max(1, Math.min(500, limit)),
    });
    const generated: unknown[] = [];
    const failures: Array<{ id: string; error: string }> = [];
    for (const candidate of candidates) {
      const window = serviceWindow(
        candidate.serviceDate,
        candidate.subscription.deliveryWindowStartMinute,
        candidate.subscription.deliveryWindowEndMinute,
      );
      const generationAt = new Date(window.start.getTime() - candidate.subscription.plan.orderGenerationHoursBefore * 3_600_000);
      if (now < generationAt) continue;
      if (
        candidate.subscription.status === CustomerSubscriptionStatus.PAUSED &&
        (!candidate.subscription.pauseEffectiveFrom || candidate.serviceDate >= candidate.subscription.pauseEffectiveFrom)
      ) continue;
      if (candidate.cashDuePaise === 0 && candidate.subscription.remainingFundedDeliveries < 1) continue;
      try {
        generated.push(await this.generateOne(candidate.id));
      } catch (error: unknown) {
        const message = errorMessage(error);
        failures.push({ id: candidate.id, error: message });
        logger.warn(`Subscription order generation deferred delivery=${candidate.id}: ${message}`);
      }
    }
    return { generated, failures };
  }
}
