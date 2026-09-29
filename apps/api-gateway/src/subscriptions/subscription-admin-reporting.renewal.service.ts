/**
 * Subscription renewal and cancellation.
 *
 * Split out of the former subscription-admin-reporting.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomerSubscriptionStatus, Prisma, Role, SubscriptionDeliveryStatus, SubscriptionProofMode, prisma } from '@aagam/database';

@Injectable()
export class SubscriptionAdminReportingRenewalService {
  async renewSubscription(
    subscriptionId: string,
    dto: {
      additionalDeliveries?: number;
      additionalAmountPaise?: number;
      totalDeliveries?: number;
      startDate?: string;
      isSamePlan?: boolean;
      newPlanId?: string;
      deliverySlot?: 'MORNING' | 'EVENING' | 'BOTH' | 'AM' | 'PM';
      frequency?: 'DAILY' | 'ALTERNATE_DAYS' | 'WEEKDAYS' | 'SELECTED_WEEKDAYS';
      selectedWeekdays?: number[];
      vacationRange?: {
        fromDate?: string;
        toDate?: string;
        policy?: 'EXTEND_PLAN' | 'DEDUCT_BILL';
      };
      splitItems?: {
        amProductName?: string;
        amQuantity?: string;
        pmProductName?: string;
        pmQuantity?: string;
      };
      initialCashCollectedPaise?: number;
      paymentMode?: 'CASH' | 'PHONE_PE';
      note?: string;
    },
    actorId: string,
    actorRole: Role = Role.ADMIN,
  ) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.customerSubscription.findUnique({
        where: { id: subscriptionId },
        include: {
          plan: {
            include: {
              items: { include: { product: true } },
              versions: { orderBy: { version: 'desc' }, take: 1 },
            },
          },
          planVersion: true,
          customer: true,
          address: true,
          homeStore: true,
          deliveries: { orderBy: { serviceDate: 'desc' }, take: 1 },
        },
      });

      if (!existing) throw new NotFoundException('Subscription not found');

      // Resolve the target plan (same plan by default, or switched product/plan)
      let targetPlan = existing.plan;
      let targetVersion = existing.planVersion;
      if (dto.newPlanId && dto.newPlanId !== existing.planId) {
        const foundPlan = await tx.subscriptionPlan.findUnique({
          where: { id: dto.newPlanId },
          include: {
            items: { include: { product: true } },
            versions: { orderBy: { version: 'desc' }, take: 1 },
          },
        });
        if (!foundPlan) throw new NotFoundException(`Target plan ${dto.newPlanId} not found`);
        targetPlan = foundPlan;
        targetVersion = foundPlan.versions[0] || existing.planVersion;
      }

      // Calculate cycle number in chain
      const prevPriceSnapshot = (existing.priceSnapshot as any) || {};
      const currentCycle = typeof prevPriceSnapshot.cycleNumber === 'number' ? prevPriceSnapshot.cycleNumber : 1;
      const nextCycleNumber = currentCycle + 1;

      // Idempotency: prevent double-clicks or rapid retries from creating duplicate cycles
      const recentDuplicate = await tx.customerSubscription.findFirst({
        where: {
          customerId: existing.customerId,
          source: 'manual',
          createdAt: { gte: new Date(Date.now() - 60_000) },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (recentDuplicate) {
        const ps = (recentDuplicate.priceSnapshot as any) || {};
        if (ps.previousSubscriptionId === existing.id) {
          return recentDuplicate;
        }
      }

      // Calculate start and end dates
      const lastDelivery = existing.deliveries[0];
      const lastDate = lastDelivery?.serviceDate ?? existing.endDate;
      let startDate: Date;
      if (dto.startDate) {
        startDate = new Date(dto.startDate);
        if (isNaN(startDate.getTime())) throw new BadRequestException('Invalid start date');
      } else {
        startDate = new Date(lastDate.getTime() + 86_400_000);
      }
      startDate = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate(), 0, 0, 0, 0));

      const totalDeliveries = dto.totalDeliveries || dto.additionalDeliveries || targetPlan.totalDeliveries || 30;
      const rawSlot = dto.deliverySlot || (existing.deliveryWindowStartMinute >= 900 ? 'PM' : 'AM');
      const isSlotBoth = rawSlot === 'BOTH';
      const durationDays = isSlotBoth ? Math.ceil(totalDeliveries / 2) : totalDeliveries;
      const endDate = new Date(startDate.getTime() + (durationDays - 1) * 86_400_000);

      // Financials for this specific renewal cycle
      let cyclePricePaise = targetPlan.pricePaise;
      if (dto.additionalAmountPaise !== undefined && dto.additionalAmountPaise > 0) {
        cyclePricePaise = dto.additionalAmountPaise;
      }

      const initialCash = dto.initialCashCollectedPaise || 0;
      const cycleDuePaise = Math.max(0, cyclePricePaise - initialCash);
      const initialStatus = initialCash >= cyclePricePaise
        ? CustomerSubscriptionStatus.ACTIVE
        : CustomerSubscriptionStatus.PENDING_CASH_COLLECTION;

      const slotStartMinute = rawSlot === 'EVENING' || rawSlot === 'PM' ? 17 * 60 : 6 * 60;
      const slotEndMinute = rawSlot === 'EVENING' || rawSlot === 'PM' ? 20 * 60 : 9 * 60;

      // Close previous subscription gracefully as completed if active
      if (existing.status === CustomerSubscriptionStatus.ACTIVE || existing.status === CustomerSubscriptionStatus.PENDING_CASH_COLLECTION) {
        await tx.customerSubscription.update({
          where: { id: existing.id },
          data: { status: CustomerSubscriptionStatus.COMPLETED },
        });
      }

      // Create new CustomerSubscription for this renewal cycle (isolated financials)
      const renewalSub = await tx.customerSubscription.create({
        data: {
          customerId: existing.customerId,
          planId: targetPlan.id,
          planVersionId: targetVersion?.id || targetPlan.versions[0]?.id || existing.planVersionId,
          addressId: existing.addressId,
          homeStoreId: existing.homeStoreId,
          deliveryZoneId: existing.deliveryZoneId,
          source: 'manual',
          status: initialStatus,
          startDate,
          endDate,
          nextDeliveryDate: startDate,
          deliveryWindowStartMinute: slotStartMinute,
          deliveryWindowEndMinute: slotEndMinute,
          deliveryMethod: existing.deliveryMethod,
          storeDelivery: existing.storeDelivery,
          priceSnapshot: {
            pricePaise: cyclePricePaise,
            mrpPaise: targetPlan.mrpPaise,
            currency: 'INR',
            cycleNumber: nextCycleNumber,
            previousSubscriptionId: existing.id,
            renewalNote: dto.note || null,
            splitItems: dto.splitItems || null,
            initialPaymentMode: dto.paymentMode || (initialCash > 0 ? 'CASH' : null),
          },
          itemsSnapshot: dto.splitItems
            ? [
                { name: dto.splitItems.amProductName || 'AM Milk', quantity: dto.splitItems.amQuantity || '1L', slot: 'AM' },
                { name: dto.splitItems.pmProductName || 'PM Milk', quantity: dto.splitItems.pmQuantity || '1L', slot: 'PM' },
              ]
            : targetPlan.items.map((i) => ({ productId: i.productId, quantityPerDelivery: i.quantityPerDelivery, name: i.product.name })),
          addressSnapshot: existing.addressSnapshot as any,
          policySnapshot: existing.policySnapshot as any,
          fundedDeliveryCount: totalDeliveries,
          remainingFundedDeliveries: totalDeliveries,
          amountDuePaise: cycleDuePaise,
          amountCollectedPaise: initialCash,
          fundingCycle: targetPlan.fundingCycle,
        },
      });

      // Frequency & Vacation scheduling settings
      const frequency = dto.frequency || 'DAILY';
      const stepDays = frequency === 'ALTERNATE_DAYS' ? 2 : 1;
      const vacationFrom = dto.vacationRange?.fromDate ? new Date(dto.vacationRange.fromDate) : null;
      const vacationTo = dto.vacationRange?.toDate ? new Date(dto.vacationRange.toDate) : null;
      const vacationPolicy = dto.vacationRange?.policy || 'EXTEND_PLAN';

      // Generate delivery rows for this new cycle with automated frequency stepping
      const newDeliveries: Prisma.SubscriptionDeliveryCreateManyInput[] = [];
      let curDate = new Date(startDate);
      let seq = 1;
      let lastGeneratedDate = new Date(startDate);

      while (seq <= totalDeliveries) {
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
          // Skip calendar day to extend plan duration
          curDate = new Date(curDate.getTime() + 86_400_000);
          continue;
        }

        let deliverySlot = 'AM';
        if (isSlotBoth) {
          deliverySlot = seq % 2 === 1 ? 'AM' : 'PM';
        } else {
          deliverySlot = rawSlot === 'EVENING' || rawSlot === 'PM' ? 'PM' : 'AM';
        }

        const dateStr = curDate.toISOString().slice(0, 10);
        let deferredReason: string | null = null;
        if (dto.splitItems) {
          const itemText = deliverySlot === 'AM'
            ? `${dto.splitItems.amQuantity || '1L'} ${dto.splitItems.amProductName || 'Milk'}`
            : `${dto.splitItems.pmQuantity || '1L'} ${dto.splitItems.pmProductName || 'Milk'}`;
          deferredReason = `[SPLIT_ITEM: ${itemText}]`;
        }

        newDeliveries.push({
          subscriptionId: renewalSub.id,
          serviceDate: new Date(curDate),
          sequenceNumber: seq,
          deliverySlot,
          status: isVacation ? SubscriptionDeliveryStatus.SKIPPED : SubscriptionDeliveryStatus.SCHEDULED,
          skipReason: isVacation ? 'Planned Vacation' : null,
          generationKey: `renewal:${renewalSub.id}:${seq}:${dateStr}:${deliverySlot}`,
          cashDuePaise: 0,
          cashCollectedPaise: seq === 1 && initialCash > 0 ? initialCash : 0,
          proofMode: SubscriptionProofMode.PERSONAL_OTP_GPS,
          storeId: renewalSub.homeStoreId,
          deferredReason,
        });

        lastGeneratedDate = new Date(curDate);
        seq++;

        // Step date forward based on frequency
        if (isSlotBoth) {
          if (seq % 2 === 1) {
            curDate = new Date(curDate.getTime() + stepDays * 86_400_000);
          }
        } else {
          curDate = new Date(curDate.getTime() + stepDays * 86_400_000);
        }
      }

      await tx.subscriptionDelivery.createMany({ data: newDeliveries, skipDuplicates: true });

      // Update endDate to match actual last generated delivery date
      await tx.customerSubscription.update({
        where: { id: renewalSub.id },
        data: { endDate: lastGeneratedDate },
      });

      // Record audit entry
      await tx.subscriptionAuditEntry.create({
        data: {
          subscriptionId: renewalSub.id,
          actorUserId: actorId,
          actorRole,
          action: 'SUBSCRIPTION_RENEWED',
          reason: dto.note || `Renewed for cycle #${nextCycleNumber} with ${totalDeliveries} deliveries`,
          metadata: {
            previousSubscriptionId: existing.id,
            cycleNumber: nextCycleNumber,
            totalDeliveries,
            cyclePricePaise,
            initialCashCollectedPaise: initialCash,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            splitItems: dto.splitItems || null,
          },
          idempotencyKey: `renewal:${renewalSub.id}:${Date.now()}`,
        },
      });

      // Cancel any remaining unfulfilled scheduled deliveries of the old subscription so they don't clash
      await tx.subscriptionDelivery.updateMany({
        where: {
          subscriptionId: existing.id,
          status: { in: [SubscriptionDeliveryStatus.SCHEDULED, SubscriptionDeliveryStatus.ORDER_GENERATED] },
        },
        data: {
          status: SubscriptionDeliveryStatus.CANCELLED,
          skipReason: `Cancelled due to plan switch / renewal to ${targetPlan.name} (cycle #${nextCycleNumber})`,
        },
      });

      // Mark the old subscription as COMPLETED so it doesn't appear alongside the new one
      if (existing.status !== CustomerSubscriptionStatus.COMPLETED && existing.status !== CustomerSubscriptionStatus.CANCELLED) {
        await tx.customerSubscription.update({
          where: { id: existing.id },
          data: {
            status: CustomerSubscriptionStatus.COMPLETED,
            cancelledAt: new Date(),
            cancellationReason: `Renewed / Switched to cycle #${nextCycleNumber} (${targetPlan.name}, subscription ${renewalSub.id})`,
          },
        });
      }

      return {
        renewalSubscription: renewalSub,
        cycleNumber: nextCycleNumber,
        previousSubscriptionId: existing.id,
        status: renewalSub.status,
        amountDuePaise: cycleDuePaise,
        amountCollectedPaise: initialCash,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
  }

  async cancelSubscription(
    subscriptionId: string,
    reason: string,
    actorId: string,
    actorRole: Role = Role.ADMIN,
  ) {
    return prisma.$transaction(async (tx) => {
      const sub = await tx.customerSubscription.findUnique({
        where: { id: subscriptionId },
        include: { homeStore: { select: { ownerId: true } }, plan: true, customer: true },
      });
      if (!sub) throw new NotFoundException('Subscription not found');
      if (actorRole !== Role.ADMIN && sub.homeStore?.ownerId !== actorId) {
        throw new ForbiddenException('You do not have access to this subscription');
      }
      if (sub.status === CustomerSubscriptionStatus.CANCELLED) {
        throw new BadRequestException('Subscription is already cancelled');
      }

      // Cancel all future unfulfilled scheduled deliveries
      const cancelledDeliveries = await tx.subscriptionDelivery.updateMany({
        where: {
          subscriptionId,
          status: { in: [SubscriptionDeliveryStatus.SCHEDULED, SubscriptionDeliveryStatus.ORDER_GENERATED] },
        },
        data: {
          status: SubscriptionDeliveryStatus.CANCELLED,
          skipReason: reason?.trim() || 'Cancelled by store owner',
        },
      });

      const updated = await tx.customerSubscription.update({
        where: { id: subscriptionId },
        data: {
          status: CustomerSubscriptionStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: reason?.trim() || 'Cancelled by store owner',
          cancelledById: actorId,
          nextDeliveryDate: null,
          nextCashCollectionDate: null,
        },
      });

      await tx.subscriptionAuditEntry.create({
        data: {
          subscriptionId,
          actorUserId: actorId,
          actorRole,
          action: 'SUBSCRIPTION_CANCELLED',
          reason: reason?.trim() || 'Cancelled by store owner',
          idempotencyKey: `store-cancel:${subscriptionId}:${Date.now()}`,
        },
      });

      return {
        success: true,
        subscription: updated,
        cancelledDeliveriesCount: cancelledDeliveries.count,
        message: `Subscription for ${sub.customer?.name || 'Customer'} has been cancelled. ${cancelledDeliveries.count} scheduled delivery/deliveries cancelled.`,
      };
    });
  }
}
