/**
 * Manual and custom manual subscription authoring.
 *
 * Split out of the former subscription-admin-reporting.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomerSubscriptionStatus, Prisma, Role, SubscriptionDeliveryStatus, SubscriptionProofMode, prisma } from '@aagam/database';
import { randomUUID } from 'crypto';
import { SubscriptionPlanService } from './subscription-plan.service';

@Injectable()
export class SubscriptionAdminReportingManualSubscriptionService {
  async createManualSubscription(dto: {
    storeId: string;
    planId: string;
    customerId: string;
    addressId: string;
    startDate: string;
    totalDeliveries: number;
    deliverySlot?: 'MORNING' | 'EVENING' | 'BOTH';
    initialCashCollectedPaise?: number;
    storeDelivery?: boolean;
    note?: string;
    frequency?: 'DAILY' | 'ALTERNATE_DAYS' | 'WEEKDAYS' | 'SELECTED_WEEKDAYS';
    selectedWeekdays?: number[];
    vacationRange?: { fromDate?: string; toDate?: string; policy?: 'EXTEND_PLAN' | 'DEDUCT_BILL' };
    splitItems?: { amProductName?: string; amQuantity?: string; pmProductName?: string; pmQuantity?: string };
  }, actorId: string) {
    const store = await prisma.store.findUnique({ where: { id: dto.storeId } });
    if (!store) throw new NotFoundException('Store not found');

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: dto.planId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 }, items: { include: { product: true } } },
    });
    if (!plan) throw new NotFoundException('Subscription plan not found');

    // Auto-publish draft plans to create a version
    let version = plan.versions[0];
    if (!version) {
      if (plan.status !== 'DRAFT') {
        throw new BadRequestException('Cannot create subscription from a plan without versions that is not in DRAFT status');
      }
      const planService = new SubscriptionPlanService();
      await planService.publish(plan.id, actorId);
      const updatedPlan = await prisma.subscriptionPlan.findUnique({
        where: { id: plan.id },
        include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      });
      if (!updatedPlan?.versions[0]) throw new NotFoundException('Failed to create plan version');
      version = updatedPlan.versions[0];
    }

    // A store-delivery/other manual subscription must never be attached to a
    // store that the plan's applicability snapshot excludes: the generator
    // resolves store-delivery serviceability against the home store, so a
    // mismatched store/plan pair would defer the subscription forever.
    const applicabilityRecord = (version.applicabilitySnapshot ?? {}) as Record<string, unknown>;
    const allowedStoreIds = Array.isArray(applicabilityRecord.storeIds) ? applicabilityRecord.storeIds.map(String) : [];
    if (allowedStoreIds.length > 0 && !allowedStoreIds.includes(store.id)) {
      throw new BadRequestException(
        `The selected store is not allowed by this plan (allowed stores: ${allowedStoreIds.join(', ')})`,
      );
    }

    const address = await prisma.customerAddress.findUnique({ where: { id: dto.addressId } });
    if (!address) throw new NotFoundException('Delivery address not found');

    const start = new Date(dto.startDate);
    if (isNaN(start.getTime())) throw new BadRequestException('Invalid start date');

    const frequency = dto.frequency || 'DAILY';
    const stepDays = frequency === 'ALTERNATE_DAYS' ? 2 : 1;
    const isSlotBoth = dto.deliverySlot === 'BOTH';
    const rawSlot = dto.deliverySlot || 'MORNING';

    const vacationFrom = dto.vacationRange?.fromDate ? new Date(dto.vacationRange.fromDate) : null;
    const vacationTo = dto.vacationRange?.toDate ? new Date(dto.vacationRange.toDate) : null;
    const vacationPolicy = dto.vacationRange?.policy || 'EXTEND_PLAN';

    const durationDays = Math.ceil(dto.totalDeliveries / (isSlotBoth ? 2 : 1)) * stepDays;
    const end = new Date(start.getTime() + durationDays * 86_400_000);

    const pricePaise = plan.pricePaise;
    const initialCash = dto.initialCashCollectedPaise || 0;
    const amountDuePaise = Math.max(0, pricePaise - initialCash);
    const initialStatus = initialCash >= pricePaise ? CustomerSubscriptionStatus.ACTIVE : CustomerSubscriptionStatus.PENDING_CASH_COLLECTION;

    const slotStartMinute = rawSlot === 'EVENING' ? 17 * 60 : 6 * 60;
    const slotEndMinute = rawSlot === 'EVENING' ? 20 * 60 : 9 * 60;

    return prisma.$transaction(async (tx) => {
      const subscription = await tx.customerSubscription.create({
        data: {
          customerId: dto.customerId,
          planId: plan.id,
          planVersionId: version.id,
          addressId: address.id,
          homeStoreId: store.id,
          status: initialStatus,
          startDate: start,
          endDate: end,
          nextDeliveryDate: start,
          deliveryWindowStartMinute: slotStartMinute,
          deliveryWindowEndMinute: slotEndMinute,
          deliveryMethod: 'PERSONAL_HANDOVER',
          storeDelivery: dto.storeDelivery ?? false,
          priceSnapshot: {
            pricePaise,
            mrpPaise: plan.mrpPaise,
            currency: 'INR',
            cycleNumber: 1,
            frequency,
            splitItems: dto.splitItems || null,
            manualNote: dto.note,
          },
          itemsSnapshot: dto.splitItems
            ? [
                { name: dto.splitItems.amProductName || 'AM Milk', quantity: dto.splitItems.amQuantity || '1L', slot: 'AM' },
                { name: dto.splitItems.pmProductName || 'PM Milk', quantity: dto.splitItems.pmQuantity || '1L', slot: 'PM' },
              ]
            : plan.items.map((i) => ({ productId: i.productId, quantityPerDelivery: i.quantityPerDelivery, name: i.product.name })),
          addressSnapshot: {
            recipientName: address.recipientName,
            phoneE164: address.phoneE164,
            line1: address.line1,
            line2: address.line2,
            landmark: address.landmark,
            city: address.city,
            state: address.state,
            pincode: address.pincode,
            latitude: address.latitude,
            longitude: address.longitude,
          },
          policySnapshot: { allowPause: plan.allowPause, allowSkip: plan.allowSkip },
          fundedDeliveryCount: dto.totalDeliveries,
          remainingFundedDeliveries: dto.totalDeliveries,
          amountDuePaise,
          amountCollectedPaise: initialCash,
          fundingCycle: plan.fundingCycle,
        },
      });

      // Generate delivery calendar rows with automated frequency stepping and vacation skips
      const deliveriesData: Prisma.SubscriptionDeliveryCreateManyInput[] = [];
      let curDate = new Date(start);
      let seq = 1;
      let lastGeneratedDate = new Date(start);

      while (seq <= dto.totalDeliveries) {
        const dayOfWeek = curDate.getUTCDay();

        // Skip weekends if WEEKDAYS
        if (frequency === 'WEEKDAYS' && (dayOfWeek === 0 || dayOfWeek === 6)) {
          curDate = new Date(curDate.getTime() + 86_400_000);
          continue;
        }

        // Skip non-selected weekdays
        if (frequency === 'SELECTED_WEEKDAYS' && dto.selectedWeekdays?.length && !dto.selectedWeekdays.includes(dayOfWeek)) {
          curDate = new Date(curDate.getTime() + 86_400_000);
          continue;
        }

        // Check if falls in planned vacation
        const isVacation = Boolean(vacationFrom && vacationTo && curDate >= vacationFrom && curDate <= vacationTo);
        if (isVacation && vacationPolicy === 'EXTEND_PLAN') {
          curDate = new Date(curDate.getTime() + 86_400_000);
          continue;
        }

        let deliverySlot = 'AM';
        if (isSlotBoth) {
          deliverySlot = seq % 2 === 1 ? 'AM' : 'PM';
        } else {
          deliverySlot = rawSlot === 'EVENING' ? 'PM' : 'AM';
        }

        const dateStr = curDate.toISOString().slice(0, 10);
        let deferredReason: string | null = null;
        if (dto.splitItems) {
          const itemText = deliverySlot === 'AM'
            ? `${dto.splitItems.amQuantity || '1L'} ${dto.splitItems.amProductName || 'Milk'}`
            : `${dto.splitItems.pmQuantity || '1L'} ${dto.splitItems.pmProductName || 'Milk'}`;
          deferredReason = `[SPLIT_ITEM: ${itemText}]`;
        }

        deliveriesData.push({
          subscriptionId: subscription.id,
          serviceDate: new Date(curDate),
          sequenceNumber: seq,
          deliverySlot,
          status: isVacation ? SubscriptionDeliveryStatus.SKIPPED : SubscriptionDeliveryStatus.SCHEDULED,
          skipReason: isVacation ? 'Planned Vacation' : null,
          generationKey: `manual:${subscription.id}:${seq}:${dateStr}:${deliverySlot}`,
          storeId: store.id,
          cashDuePaise: seq === 1 ? amountDuePaise : 0,
          proofMode: SubscriptionProofMode.PERSONAL_OTP_GPS,
          deferredReason,
        });

        lastGeneratedDate = new Date(curDate);
        seq++;

        if (isSlotBoth) {
          if (seq % 2 === 1) {
            curDate = new Date(curDate.getTime() + stepDays * 86_400_000);
          }
        } else {
          curDate = new Date(curDate.getTime() + stepDays * 86_400_000);
        }
      }
      await tx.subscriptionDelivery.createMany({ data: deliveriesData, skipDuplicates: true });

      // Update endDate to match actual last generated delivery date
      await tx.customerSubscription.update({
        where: { id: subscription.id },
        data: { endDate: lastGeneratedDate },
      });

      await tx.subscriptionAuditEntry.create({
        data: {
          subscriptionId: subscription.id,
          actorUserId: actorId,
          actorRole: Role.ADMIN,
          action: 'ADMIN_MANUAL_SUBSCRIPTION_CREATED',
          reason: dto.note || 'Created manual subscription for store customer',
          metadata: { storeId: store.id, planId: plan.id, totalDeliveries: dto.totalDeliveries, deliverySlot: dto.deliverySlot },
          idempotencyKey: `manual-subscription:${subscription.id}:${randomUUID()}`,
        },
      });

      return subscription;
    });
  }

  async updateManualSubscription(id: string, dto: { startDate?: string; totalDeliveries?: number; deliverySlot?: 'MORNING' | 'EVENING' | 'BOTH'; amountDuePaise?: number; amountCollectedPaise?: number; note?: string }, actorId: string) {
    const subscription = await prisma.customerSubscription.findUnique({ where: { id } });
    if (!subscription) throw new NotFoundException('Subscription not found');

    const updateData: any = {};
    if (dto.startDate) {
      const start = new Date(dto.startDate);
      if (!isNaN(start.getTime())) updateData.startDate = start;
    }
    if (typeof dto.totalDeliveries === 'number' && dto.totalDeliveries > 0) {
      updateData.fundedDeliveryCount = dto.totalDeliveries;
      updateData.remainingFundedDeliveries = Math.max(0, dto.totalDeliveries - subscription.completedDeliveries);
    }
    if (typeof dto.amountDuePaise === 'number') updateData.amountDuePaise = dto.amountDuePaise;
    if (typeof dto.amountCollectedPaise === 'number') updateData.amountCollectedPaise = dto.amountCollectedPaise;
    if (dto.deliverySlot) {
      updateData.deliveryWindowStartMinute = dto.deliverySlot === 'EVENING' ? 17 * 60 : 6 * 60;
      updateData.deliveryWindowEndMinute = dto.deliverySlot === 'EVENING' ? 20 * 60 : 9 * 60;
    }

    const updated = await prisma.customerSubscription.update({
      where: { id },
      data: updateData,
    });

    await prisma.subscriptionAuditEntry.create({
      data: {
        subscriptionId: id,
        actorUserId: actorId,
        actorRole: Role.ADMIN,
        action: 'ADMIN_MANUAL_SUBSCRIPTION_UPDATED',
        reason: dto.note || 'Admin updated manual subscription parameters',
        metadata: { changes: updateData },
        idempotencyKey: `manual-subscription-update:${id}:${randomUUID()}`,
      },
    });

    return updated;
  }

  async createCustomManualSubscription(dto: {
    storeId: string;
    customerId: string;
    addressId: string;
    totalPricePaise: number;
    initialCashCollectedPaise?: number;
    storeDelivery?: boolean;
    note?: string;
    deliveries: Array<{
      date: string;
      slot: 'AM' | 'PM' | 'BOTH';
      items: Array<{ productId: string; quantity: number; pricePaise: number }>;
    }>;
  }, actorId: string) {
    const store = await prisma.store.findUnique({ where: { id: dto.storeId } });
    if (!store) throw new NotFoundException('Store not found');

    const customer = await prisma.user.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw new NotFoundException('Customer not found');

    const address = await prisma.customerAddress.findUnique({ where: { id: dto.addressId, userId: dto.customerId } });
    if (!address) throw new NotFoundException('Delivery address not found or does not belong to this customer');

    if (!dto.deliveries || dto.deliveries.length === 0) {
      throw new BadRequestException('At least one delivery is required');
    }

    const sortedDeliveries = [...dto.deliveries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const startDate = new Date(sortedDeliveries[0].date);
    const endDate = new Date(sortedDeliveries[sortedDeliveries.length - 1].date);
    endDate.setHours(23, 59, 59, 999);

    const totalDeliveries = dto.deliveries.reduce((sum, d) => {
      return sum + (d.slot === 'BOTH' ? 2 : 1);
    }, 0);

    const initialCash = dto.initialCashCollectedPaise || 0;
    const amountDuePaise = Math.max(0, dto.totalPricePaise - initialCash);
    const initialStatus = initialCash >= dto.totalPricePaise ? CustomerSubscriptionStatus.ACTIVE : CustomerSubscriptionStatus.PENDING_CASH_COLLECTION;

    const firstSlot = sortedDeliveries[0].slot;
    const slotStartMinute = firstSlot === 'PM' ? 17 * 60 : 6 * 60;
    const slotEndMinute = firstSlot === 'PM' ? 20 * 60 : 9 * 60;

    const allItems = dto.deliveries.flatMap((d) => d.items);
    if (!allItems.length) {
      throw new BadRequestException('At least one product is required for custom deliveries');
    }
    const productMap = new Map<string, { name: string; totalQuantity: number; weightGrams: number | null }>();
    for (const item of allItems) {
      const existing = productMap.get(item.productId);
      if (existing) {
        existing.totalQuantity += item.quantity;
      } else {
        const product = await prisma.product.findUnique({
          where: { id: item.productId, isActive: true, deletedAt: null },
          select: { name: true, weightGrams: true },
        });
        if (!product) {
          throw new BadRequestException('One or more subscription products are unavailable or deleted');
        }
        if (!Number.isInteger(product.weightGrams) || Number(product.weightGrams) <= 0) {
          throw new BadRequestException(`Product "${product.name}" requires a positive unit weight`);
        }
        productMap.set(item.productId, { name: product.name, totalQuantity: item.quantity, weightGrams: product.weightGrams });
      }
    }

    const syntheticPlanCode = `CUSTOM-${Date.now()}`;
    const syntheticPlan = await prisma.subscriptionPlan.create({
      data: {
        code: syntheticPlanCode,
        internalName: `Custom Plan for ${customer.name || customer.phone}`,
        name: `Custom Plan - ${dto.deliveries.length} days`,
        status: 'ACTIVE',
        fundingCycle: 'FULL_PLAN',
        durationDays: Math.ceil((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1,
        totalDeliveries,
        deliveryFrequency: 'CUSTOM',
        customSchedule: { type: 'custom', deliveryCount: dto.deliveries.length },
        pricePaise: dto.totalPricePaise,
        mrpPaise: dto.totalPricePaise,
        defaultWindowStartMinute: slotStartMinute,
        defaultWindowEndMinute: slotEndMinute,
        allowPause: false,
        allowSkip: false,
        allowTrustedDrop: false,
        allowPersonalHandover: true,
        allowSecurityHandover: false,
        proofPolicy: { personalHandover: ['OTP', 'GPS'] },
        createdById: actorId,
        updatedById: actorId,
      },
    });

    const itemsSnapshot = Array.from(productMap.entries()).map(([productId, data]) => ({
      productId,
      quantityPerDelivery: data.totalQuantity,
      name: data.name,
      weightGrams: data.weightGrams,
    }));

    const version = await prisma.subscriptionPlanVersion.create({
      data: {
        planId: syntheticPlan.id,
        version: 1,
        pricePaise: dto.totalPricePaise,
        mrpPaise: dto.totalPricePaise,
        currency: 'INR',
        totalDeliveries,
        durationDays: Math.ceil((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1,
        fundingCycle: 'FULL_PLAN',
        deliveryFrequency: 'CUSTOM',
        selectedWeekdays: [],
        itemsSnapshot,
        deliveryRulesSnapshot: { windowStart: slotStartMinute, windowEnd: slotEndMinute },
        proofPolicySnapshot: { personalHandover: ['OTP', 'GPS'] },
        applicabilitySnapshot: { storeIds: [dto.storeId] },
        fullSnapshot: { items: itemsSnapshot, customDeliveries: dto.deliveries.length },
        createdById: actorId,
      },
    });

    return prisma.$transaction(async (tx) => {
      const subscription = await tx.customerSubscription.create({
        data: {
          customerId: dto.customerId,
          planId: syntheticPlan.id,
          planVersionId: version.id,
          addressId: dto.addressId,
          homeStoreId: store.id,
          source: 'custom_manual',
          status: initialStatus,
          startDate,
          endDate,
          nextDeliveryDate: startDate,
          deliveryWindowStartMinute: slotStartMinute,
          deliveryWindowEndMinute: slotEndMinute,
          deliveryMethod: 'PERSONAL_HANDOVER',
          isCustom: true,
          storeDelivery: dto.storeDelivery || false,
          priceSnapshot: { pricePaise: dto.totalPricePaise, mrpPaise: dto.totalPricePaise, currency: 'INR', manualNote: dto.note, isCustom: true },
          itemsSnapshot,
          addressSnapshot: {
            recipientName: address.recipientName,
            phoneE164: address.phoneE164,
            line1: address.line1,
            line2: address.line2,
            landmark: address.landmark,
            city: address.city,
            state: address.state,
            pincode: address.pincode,
            latitude: address.latitude,
            longitude: address.longitude,
          },
          policySnapshot: { allowPause: false, allowSkip: false, isCustom: true },
          fundedDeliveryCount: totalDeliveries,
          remainingFundedDeliveries: totalDeliveries,
          amountDuePaise,
          amountCollectedPaise: initialCash,
          fundingCycle: 'FULL_PLAN',
        },
      });

      const deliveriesData: Prisma.SubscriptionDeliveryCreateManyInput[] = [];
      let seq = 1;
      let remainingDue = amountDuePaise;

      for (const delivery of sortedDeliveries) {
        const deliveryDate = new Date(delivery.date);
        const slotPricePaise = delivery.items.reduce((sum, i) => sum + i.pricePaise * i.quantity, 0);

        let amDue = delivery.slot === 'BOTH' ? Math.ceil(slotPricePaise / 2) : slotPricePaise;
        let pmDue = delivery.slot === 'BOTH' ? Math.floor(slotPricePaise / 2) : 0;

        if (seq === 1) {
          const firstTotal = amDue + pmDue;
          const deduction = Math.min(initialCash, firstTotal);
          if (delivery.slot === 'BOTH') {
            amDue = Math.max(0, amDue - deduction);
          } else {
            amDue = Math.max(0, amDue - deduction);
          }
        }

        amDue = Math.min(amDue, remainingDue);
        remainingDue -= amDue;

        deliveriesData.push({
          subscriptionId: subscription.id,
          serviceDate: deliveryDate,
          sequenceNumber: seq,
          deliverySlot: delivery.slot === 'BOTH' ? 'AM' : delivery.slot,
          status: SubscriptionDeliveryStatus.SCHEDULED,
          generationKey: `custom:${subscription.id}:${seq}:${delivery.date}:AM`,
          storeId: store.id,
          cashDuePaise: amDue,
          proofMode: SubscriptionProofMode.PERSONAL_OTP_GPS,
        });
        seq++;

        if (delivery.slot === 'BOTH') {
          pmDue = Math.min(pmDue, remainingDue);
          remainingDue -= pmDue;
          deliveriesData.push({
            subscriptionId: subscription.id,
            serviceDate: deliveryDate,
            sequenceNumber: seq,
            deliverySlot: 'PM',
            status: SubscriptionDeliveryStatus.SCHEDULED,
            generationKey: `custom:${subscription.id}:${seq}:${delivery.date}:PM`,
            storeId: store.id,
            cashDuePaise: pmDue,
            proofMode: SubscriptionProofMode.PERSONAL_OTP_GPS,
          });
          seq++;
        }
      }

      await tx.subscriptionDelivery.createMany({ data: deliveriesData, skipDuplicates: true });

      await tx.subscriptionAuditEntry.create({
        data: {
          subscriptionId: subscription.id,
          actorUserId: actorId,
          actorRole: Role.ADMIN,
          action: 'ADMIN_CUSTOM_SUBSCRIPTION_CREATED',
          reason: dto.note || 'Created custom manual subscription for offline customer',
          metadata: {
            storeId: store.id,
            customerId: dto.customerId,
            totalDeliveries,
            totalDays: sortedDeliveries.length,
            storeDelivery: dto.storeDelivery || false,
            isCustom: true,
          },
          idempotencyKey: `custom-subscription:${subscription.id}:${randomUUID()}`,
        },
      });

      return subscription;
    });
  }
}
