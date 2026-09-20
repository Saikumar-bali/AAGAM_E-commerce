import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { prisma, Role, SubscriptionDeliveryStatus, PaymentMethod, PaymentStatus } from '@aagam/database';
import { parseAddOns, parseVolumeLiters, sumAddOnLiters } from './delivery-add-on';

export interface GridCell {
  deliveryId: string;
  sequenceNumber: number;
  status: string;
  deliverySlot: string;
  baseQuantity: string;
  extraMilk: string | null;
  cashCollectedPaise: number;
  cashDuePaise: number;
  paymentMode: 'CASH' | 'PHONE_PE' | 'DUE' | null;
  note: string | null;
  /** Plan label when this delivery's plan differs from the row's primary plan. */
  planLabel: string | null;
  assignedRider?: {
    id: string;
    name: string;
    phone: string;
  } | null;
  photoProof?: {
    storageKey: string;
    capturedAt: string;
    gpsLat: number | null;
    gpsLng: number | null;
    accuracyMetres: number | null;
    riderName?: string;
  } | null;
}

export interface PlanInfo {
  name: string;
  dailyQuantity: string;
  dayRange: string;
}

export interface GridRow {
  subscriptionId: string;
  customer: {
    id: string;
    name: string;
    phone: string;
    address: string;
    customerType: 'online' | 'offline';
  };
  plan: {
    id: string;
    name: string;
    code: string;
    dailyQuantity: string;
  };
  slot: string;
  defaultRider?: {
    id: string;
    name: string;
    phone?: string;
  } | null;
  temporaryRider?: {
    id: string;
    name: string;
    phone?: string;
    startDate?: string | null;
    endDate?: string | null;
  } | null;
  /** All distinct plans this customer had deliveries for in this month. */
  allPlans: PlanInfo[];
  days: Record<number, GridCell | null>;
  totalDeliveredDays: number;
  totalExtraLiters: number;
  totalLiters: number;
  totalCollectedPaise: number;
  totalDuePaise: number;
}

@Injectable()
export class StoreMilkGridService {
  /**
   * Generates a 2D Matrix of all store subscribers across days 1-31 of the requested month.
   */
  async getGrid(actor: { id: string; role: Role; email?: string }, year?: number, month?: number) {
    const now = new Date();
    const targetYear = year ?? now.getUTCFullYear();
    const targetMonth = month !== undefined ? month : now.getUTCMonth(); // 0-indexed

    const startOfMonth = new Date(Date.UTC(targetYear, targetMonth, 1, 0, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0, 23, 59, 59, 999));
    const daysInMonth = endOfMonth.getUTCDate();

    const isMaster = actor.role === Role.ADMIN || (actor.email && (actor.email.includes('aagaam') || actor.email.includes('aagam') || actor.email.includes('store@')));
    const storeFilter = isMaster ? {} : { homeStore: { ownerId: actor.id } };

    const subscriptions = await prisma.customerSubscription.findMany({
      where: {
        ...storeFilter,
        // Recycle-binned and purged offline customers are deactivated; their
        // grid rows and day cells must vanish until they are restored.
        customer: { isActive: true },
        OR: [
          { status: { in: ['ACTIVE', 'PENDING_CASH_COLLECTION', 'PAUSED'] } },
          {
            // Include COMPLETED subscriptions that still had deliveries in
            // the target month (plan switched / renewed mid-month).
            status: 'COMPLETED',
            deliveries: { some: { serviceDate: { gte: startOfMonth, lte: endOfMonth } } },
          },
        ],
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        plan: { select: { id: true, name: true, code: true } },
        homeStore: { select: { id: true, name: true } },
        defaultRider: {
          select: {
            id: true,
            user: { select: { name: true, phone: true } },
          },
        },
        temporaryRider: {
          select: {
            id: true,
            user: { select: { name: true, phone: true } },
          },
        },
        deliveries: {
          where: {
            serviceDate: {
              gte: startOfMonth,
              lte: endOfMonth,
            },
          },
          include: {
            riderPhotoProof: {
              include: {
                riderProfile: {
                  include: { user: { select: { name: true, phone: true } } },
                },
              },
            },
            runStop: {
              include: {
                deliveryRun: {
                  include: {
                    rider: {
                      include: { user: { select: { name: true, phone: true } } },
                    },
                  },
                },
              },
            },
          },
          orderBy: { serviceDate: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group subscriptions by customer so we can merge old (COMPLETED) and new
    // subscriptions into a single row per customer.
    const customerSubsMap = new Map<string, typeof subscriptions>();
    for (const sub of subscriptions) {
      const list = customerSubsMap.get(sub.customer.id) || [];
      list.push(sub);
      customerSubsMap.set(sub.customer.id, list);
    }

    const rows: GridRow[] = [];
    const dailyTotals: Record<number, { deliveredCount: number; scheduledCount: number; totalLiters: number; cashCollectedPaise: number }> = {};
    for (let day = 1; day <= daysInMonth; day++) {
      dailyTotals[day] = { deliveredCount: 0, scheduledCount: 0, totalLiters: 0, cashCollectedPaise: 0 };
    }

    for (const [_customerId, custSubs] of customerSubsMap) {
      // Pick the primary subscription: prefer ACTIVE, then most recent.
      const activeSub = custSubs.find((s) => s.status !== 'COMPLETED') || custSubs[custSubs.length - 1];
      const address = (activeSub.addressSnapshot as any)?.line1 || (activeSub.addressSnapshot as any)?.street || 'Local Area';
      const planName = activeSub.plan.name || 'Milk Plan';
      const isBuffalo = planName.toLowerCase().includes('buffalo') || planName.toLowerCase().includes('bm');
      const splitItems = (activeSub.priceSnapshot as any)?.splitItems;
      const cycleNumber = (activeSub.priceSnapshot as any)?.cycleNumber || 1;

      // Build per-subscription plan info for allPlans tracking
      const planDayMap = new Map<string, { name: string; dailyQuantity: string; days: Set<number> }>();

      const daysMap: Record<number, GridCell | null> = {};
      let totalDeliveredDays = 0;
      let totalExtraLiters = 0;
      let calculatedDeliveredLiters = 0;

      for (const sub of custSubs) {
        const subPlanName = sub.plan.name || 'Milk Plan';
        const subIsBuffalo = subPlanName.toLowerCase().includes('buffalo') || subPlanName.toLowerCase().includes('bm');
        const subItemsSnap = (sub as any).itemsSnapshot || (sub.priceSnapshot as any)?.itemsSnapshot || [];
        const subFirstItem = Array.isArray(subItemsSnap) && subItemsSnap.length > 0 ? subItemsSnap[0] : null;
        const subWeightGrams: number | undefined = subFirstItem?.weightGrams ?? StoreMilkGridService.extractWeightGramsFromName(subFirstItem?.name);
        let subBaseQty: string;
        let subDefaultBaseMultiplier: number;
        if (subWeightGrams && subWeightGrams <= 300) {
          subBaseQty = '0.25L';
          subDefaultBaseMultiplier = 0.25;
        } else if (subWeightGrams && subWeightGrams <= 600) {
          subBaseQty = '0.5L';
          subDefaultBaseMultiplier = 0.5;
        } else if (subPlanName.toLowerCase().includes('0.25') || subPlanName.toLowerCase().includes('250') || subPlanName.toLowerCase().includes('1/4')) {
          subBaseQty = '0.25L';
          subDefaultBaseMultiplier = 0.25;
        } else if (subPlanName.toLowerCase().includes('0.5') || subPlanName.toLowerCase().includes('500') || subPlanName.toLowerCase().includes('1/2')) {
          subBaseQty = '0.5L';
          subDefaultBaseMultiplier = 0.5;
        } else {
          subBaseQty = '1L';
          subDefaultBaseMultiplier = 1.0;
        }

        const subSplitItems = (sub.priceSnapshot as any)?.splitItems;
        let subDailyQuantityLabel = `${subBaseQty} ${subIsBuffalo ? 'BM' : 'CM'}`;
        if (subSplitItems) {
          subDailyQuantityLabel = `AM: ${subSplitItems.amQuantity || '0.5L'} ${subSplitItems.amProductName || 'CM'} | PM: ${subSplitItems.pmQuantity || '1L'} ${subSplitItems.pmProductName || 'BM'}`;
        }

        for (const d of sub.deliveries) {
          const dDate = new Date(d.serviceDate);
          const dayNum = dDate.getUTCDate();

          let cellBaseQty = subBaseQty;
          let deliveryBaseMultiplier = subDefaultBaseMultiplier;
          if (subSplitItems) {
            cellBaseQty = d.deliverySlot === 'AM'
              ? (subSplitItems.amQuantity || '0.5L')
              : (subSplitItems.pmQuantity || '1L');
            deliveryBaseMultiplier = this.resolveBaseLiters(subPlanName, sub.priceSnapshot, d.deliverySlot, (sub as any).itemsSnapshot);
          }

          let extraMilk: string | null = null;
          const cellAddOns = parseAddOns(d.deferredReason, d.failureReason);
          const extraLiters = sumAddOnLiters(d.deferredReason, d.failureReason);
          if (cellAddOns.length > 0) {
            extraMilk = cellAddOns.map((a) => a.qty).join(', ');
          }

          let paymentMode: 'CASH' | 'PHONE_PE' | 'DUE' | null = null;
          if (d.failureReason?.includes('[PHONE_PE]')) paymentMode = 'PHONE_PE';
          else if (d.cashCollectedPaise > 0 || d.failureReason?.includes('[CASH]')) paymentMode = 'CASH';
          else if (d.cashDuePaise > 0) paymentMode = 'DUE';

          // Determine if this delivery's plan differs from the primary plan.
          const isDifferentPlan = sub.id !== activeSub.id;
          const planLabel = isDifferentPlan ? subDailyQuantityLabel : null;

          const cell: GridCell = {
            deliveryId: d.id,
            sequenceNumber: d.sequenceNumber,
            status: d.status,
            deliverySlot: d.deliverySlot,
            baseQuantity: cellBaseQty,
            extraMilk,
            cashCollectedPaise: d.cashCollectedPaise || 0,
            cashDuePaise: d.cashDuePaise || 0,
            paymentMode,
            note: d.skipReason || d.failureReason || null,
            planLabel,
            assignedRider: (d as any).runStop?.deliveryRun?.rider?.user
              ? {
                  id: (d as any).runStop.deliveryRun.riderId,
                  name: (d as any).runStop.deliveryRun.rider.user.name || 'Assigned Rider',
                  phone: (d as any).runStop.deliveryRun.rider.user.phone || '',
                }
              : null,
            photoProof: (d as any).riderPhotoProof
              ? {
                  storageKey: (d as any).riderPhotoProof.storageKey,
                  capturedAt: (d as any).riderPhotoProof.capturedAt.toISOString(),
                  gpsLat: (d as any).riderPhotoProof.gpsLat,
                  gpsLng: (d as any).riderPhotoProof.gpsLng,
                  accuracyMetres: (d as any).riderPhotoProof.accuracyMetres,
                  riderName: (d as any).riderPhotoProof.riderProfile?.user?.name,
                }
              : null,
          };

          daysMap[dayNum] = cell;

          // Track plan day ranges
          const planKey = sub.plan.id;
          if (!planDayMap.has(planKey)) {
            planDayMap.set(planKey, { name: subPlanName, dailyQuantity: subDailyQuantityLabel, days: new Set() });
          }
          planDayMap.get(planKey)!.days.add(dayNum);

          if (d.status === 'DELIVERED') {
            totalDeliveredDays++;
            totalExtraLiters += extraLiters;
            calculatedDeliveredLiters += deliveryBaseMultiplier + extraLiters;
            if (dailyTotals[dayNum]) {
              dailyTotals[dayNum].deliveredCount++;
              dailyTotals[dayNum].totalLiters += deliveryBaseMultiplier + extraLiters;
              dailyTotals[dayNum].cashCollectedPaise += d.cashCollectedPaise || 0;
            }
          } else if (d.status === 'SCHEDULED') {
            if (dailyTotals[dayNum]) {
              dailyTotals[dayNum].scheduledCount++;
            }
          }
        }
      }

      const totalLiters = calculatedDeliveredLiters;

      // Build allPlans array sorted by earliest day
      const allPlans: PlanInfo[] = Array.from(planDayMap.values())
        .map((p) => ({
          name: p.name,
          dailyQuantity: p.dailyQuantity,
          dayRange: Array.from(p.days).sort((a, b) => a - b).reduce((range, d) => {
            const parts = range.split('–');
            const last = parseInt(parts[parts.length - 1]);
            if (d === last + 1) {
              parts[parts.length - 1] = String(d);
            } else {
              parts.push(String(d));
            }
            return parts.join('–');
          }, ''),
        }))
        .sort((a, b) => {
          const aMin = Math.min(...a.dayRange.split('–').map(Number));
          const bMin = Math.min(...b.dayRange.split('–').map(Number));
          return aMin - bMin;
        });

      rows.push({
        subscriptionId: activeSub.id,
        customer: {
          id: activeSub.customer.id,
          name: activeSub.customer.name || 'Valued Customer',
          phone: activeSub.customer.phone
            || (activeSub.addressSnapshot as any)?.phoneE164
            || '—',
          address,
          customerType: activeSub.source === 'manual' || activeSub.source === 'custom_manual' ? 'offline' : 'online',
        },
        plan: {
          id: activeSub.plan.id,
          name: activeSub.plan.name,
          code: activeSub.plan.code,
          dailyQuantity: allPlans[0]?.dailyQuantity || `${allPlans[0]?.name || 'Milk Plan'}`,
        },
        slot: splitItems ? 'AM+PM' : (activeSub.deliveryWindowStartMinute >= 900 ? 'PM' : 'AM'),
        defaultRider: (activeSub as any).defaultRider?.user
          ? {
              id: (activeSub as any).defaultRider.id,
              name: (activeSub as any).defaultRider.user.name || 'Assigned Rider',
              phone: (activeSub as any).defaultRider.user.phone || '',
            }
          : null,
        temporaryRider: (activeSub as any).temporaryRider?.user
          ? {
              id: (activeSub as any).temporaryRider.id,
              name: (activeSub as any).temporaryRider.user.name || 'Temporary Rider',
              phone: (activeSub as any).temporaryRider.user.phone || '',
              startDate: (activeSub as any).temporaryRiderStartDate?.toISOString() || null,
              endDate: (activeSub as any).temporaryRiderEndDate?.toISOString() || null,
            }
          : null,
        allPlans,
        days: daysMap,
        totalDeliveredDays,
        totalExtraLiters,
        totalLiters,
        totalCollectedPaise: activeSub.amountCollectedPaise || 0,
        totalDuePaise: activeSub.amountDuePaise || 0,
      });
    }

    return {
      year: targetYear,
      month: targetMonth,
      daysInMonth,
      totalSubscribers: rows.length,
      rows,
      dailyTotals,
    };
  }

  /**
   * Cell Quick-Action: Instant 1-click delivery toggle, ad-hoc extra milk, shift switch, or skip.
   */
  async executeQuickAction(
    actor: { id: string; role: Role; email?: string },
    deliveryId: string,
    action: {
      type: 'TOGGLE_DELIVERED' | 'SKIP' | 'EXTRA_MILK' | 'TOGGLE_SLOT' | 'RECORD_PAYMENT' | 'ATTACH_EVENING_MILK';
      extraQuantity?: string;
      extraPaise?: number;
      paymentMode?: 'CASH' | 'PHONE_PE';
      amountPaise?: number;
      note?: string;
      consecutiveDays?: number;
      targetSlot?: 'AM' | 'PM';
    },
  ) {
    const delivery = await prisma.subscriptionDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        subscription: {
          include: {
            homeStore: { select: { ownerId: true } },
          },
        },
      },
    });

    if (!delivery) throw new NotFoundException('Delivery not found');

    const isMaster = actor.role === Role.ADMIN || (actor.email && (actor.email.includes('aagaam') || actor.email.includes('aagam') || actor.email.includes('store@')));
    if (!isMaster && delivery.subscription.homeStore?.ownerId !== actor.id) {
      throw new ForbiddenException('You can only update deliveries for your assigned store');
    }

    const sub = delivery.subscription;

    if (action.type === 'TOGGLE_DELIVERED') {
      const isCurrentlyDelivered = delivery.status === 'DELIVERED';
      const wasSkipped = delivery.status === 'SKIPPED';
      const newStatus = isCurrentlyDelivered ? SubscriptionDeliveryStatus.SCHEDULED : SubscriptionDeliveryStatus.DELIVERED;
      const countDelta = isCurrentlyDelivered ? -1 : 1;
      const newCompleted = Math.max(0, (sub.completedDeliveries || 0) + countDelta);
      const newSkipped = wasSkipped ? Math.max(0, (sub.skippedDeliveries || 0) - 1) : (sub.skippedDeliveries || 0);

      // If completing, optionally collect positive cash. If untoggling, rollback this delivery's collected cash.
      let cashDelta = 0;
      let updatedCashCollected = delivery.cashCollectedPaise || 0;
      if (!isCurrentlyDelivered) {
        if (action.amountPaise && action.amountPaise > 0) {
          cashDelta = action.amountPaise;
          updatedCashCollected = (delivery.cashCollectedPaise || 0) + cashDelta;
        }
      } else {
        if (delivery.cashCollectedPaise && delivery.cashCollectedPaise > 0) {
          cashDelta = -delivery.cashCollectedPaise;
          updatedCashCollected = 0;
        }
      }

      const updated = await prisma.$transaction([
        prisma.subscriptionDelivery.update({
          where: { id: deliveryId },
          data: {
            status: newStatus,
            deliveredAt: isCurrentlyDelivered ? null : new Date(),
            deliveredByStoreUserId: isCurrentlyDelivered ? null : actor.id,
            cashCollectedPaise: updatedCashCollected,
            cashCollectedAt: cashDelta > 0 ? new Date() : (isCurrentlyDelivered ? null : delivery.cashCollectedAt),
          },
        }),
        prisma.customerSubscription.update({
          where: { id: sub.id },
          data: {
            completedDeliveries: newCompleted,
            skippedDeliveries: newSkipped,
            amountCollectedPaise: Math.max(0, (sub.amountCollectedPaise || 0) + cashDelta),
            amountDuePaise: Math.max(0, (sub.amountDuePaise || 0) - cashDelta),
          },
        }),
      ]);

      return { success: true, delivery: updated[0], subscription: updated[1] };
    }

    if (action.type === 'SKIP') {
      const wasDelivered = delivery.status === 'DELIVERED';
      const wasSkipped = delivery.status === 'SKIPPED';
      if (wasSkipped) {
        return { success: true, delivery, subscription: sub }; // already skipped
      }
      const newCompleted = wasDelivered ? Math.max(0, (sub.completedDeliveries || 0) - 1) : (sub.completedDeliveries || 0);
      const newSkipped = (sub.skippedDeliveries || 0) + 1;

      let cashDelta = 0;
      let updatedCashCollected = delivery.cashCollectedPaise || 0;
      if (wasDelivered && delivery.cashCollectedPaise && delivery.cashCollectedPaise > 0) {
        cashDelta = -delivery.cashCollectedPaise;
        updatedCashCollected = 0;
      }

      const updated = await prisma.$transaction([
        prisma.subscriptionDelivery.update({
          where: { id: deliveryId },
          data: {
            status: SubscriptionDeliveryStatus.SKIPPED,
            skippedAt: new Date(),
            skipReason: action.note?.trim() || 'Not taken / Skipped by customer',
            deliveredAt: null,
            deliveredByStoreUserId: null,
            cashCollectedPaise: updatedCashCollected,
          },
        }),
        prisma.customerSubscription.update({
          where: { id: sub.id },
          data: {
            completedDeliveries: newCompleted,
            skippedDeliveries: newSkipped,
            amountCollectedPaise: Math.max(0, (sub.amountCollectedPaise || 0) + cashDelta),
            amountDuePaise: Math.max(0, (sub.amountDuePaise || 0) - cashDelta),
          },
        }),
      ]);

      return { success: true, delivery: updated[0], subscription: updated[1] };
    }

    if (action.type === 'ATTACH_EVENING_MILK') {
      const extraQty = action.extraQuantity?.trim() || '+1L BM';
      const count = Math.max(1, Math.min(30, action.consecutiveDays || 4));
      // The slot arrives from a request body, so TypeScript's `string` type
      // gives no runtime guarantee. Reject anything but AM/PM rather than
      // persisting a value the grid would later read as PM.
      const targetSlot = action.targetSlot === 'AM' || action.targetSlot === 'PM' ? action.targetSlot : 'PM';
      const extraPaise = this.resolveExtraPaise(action.extraPaise) ?? this.defaultExtraPricePaise(extraQty);
      const note = `[ADD-ON: ${extraQty}|${extraPaise}|${targetSlot}] ${action.note || ''}`.trim();

      const targetDeliveries = await prisma.subscriptionDelivery.findMany({
        where: {
          subscriptionId: sub.id,
          sequenceNumber: {
            gte: delivery.sequenceNumber,
            lt: delivery.sequenceNumber + count,
          },
        },
        orderBy: { sequenceNumber: 'asc' },
      });

      const totalExtraPaise = extraPaise * targetDeliveries.length;
      await prisma.$transaction([
        prisma.subscriptionDelivery.updateMany({
          where: { id: { in: targetDeliveries.map((d) => d.id) } },
          data: {
            // The base delivery keeps its own slot. Overwriting it here
            // rerouted the customer's existing delivery to the add-on slot
            // instead of merely attaching an add-on to it.
            deferredReason: note,
            cashDuePaise: { increment: extraPaise },
          },
        }),
        prisma.customerSubscription.update({
          where: { id: sub.id },
          data: {
            amountDuePaise: (sub.amountDuePaise || 0) + totalExtraPaise,
          },
        }),
      ]);

      return { success: true, count: targetDeliveries.length, message: `Attached ${extraQty} (${targetSlot}) for ${targetDeliveries.length} day${targetDeliveries.length > 1 ? 's' : ''}!` };
    }

    if (action.type === 'EXTRA_MILK') {
      const extraQty = action.extraQuantity?.trim() || '+1L';
      const count = Math.max(1, Math.min(30, action.consecutiveDays || 1));
      const extraPaise = this.resolveExtraPaise(action.extraPaise, action.amountPaise)
        ?? this.defaultExtraPricePaise(extraQty);
      const notePrefix = `[EXTRA: ${extraQty}|${extraPaise}]`;
      const fullNote = `${notePrefix} ${action.note?.trim() || 'Extra milk requested'}`.trim();

      const targetDeliveries = count > 1
        ? await prisma.subscriptionDelivery.findMany({
            where: {
              subscriptionId: sub.id,
              sequenceNumber: {
                gte: delivery.sequenceNumber,
                lt: delivery.sequenceNumber + count,
              },
            },
          })
        : [delivery];

      const totalExtraPaise = extraPaise * targetDeliveries.length;
      const updated = await prisma.$transaction([
        prisma.subscriptionDelivery.updateMany({
          where: { id: { in: targetDeliveries.map((d) => d.id) } },
          data: {
            deferredReason: fullNote,
            cashDuePaise: { increment: extraPaise },
          },
        }),
        prisma.customerSubscription.update({
          where: { id: sub.id },
          data: {
            amountDuePaise: (sub.amountDuePaise || 0) + totalExtraPaise,
          },
        }),
      ]);

      return { success: true, count: targetDeliveries.length, subscription: updated[1] };
    }

    if (action.type === 'TOGGLE_SLOT') {
      const count = Math.max(1, Math.min(30, action.consecutiveDays || 1));
      const newSlot = action.targetSlot || (delivery.deliverySlot === 'AM' ? 'PM' : 'AM');

      const targetDeliveries = count > 1
        ? await prisma.subscriptionDelivery.findMany({
            where: {
              subscriptionId: sub.id,
              sequenceNumber: {
                gte: delivery.sequenceNumber,
                lt: delivery.sequenceNumber + count,
              },
            },
          })
        : [delivery];

      await prisma.subscriptionDelivery.updateMany({
        where: { id: { in: targetDeliveries.map((d) => d.id) } },
        data: { deliverySlot: newSlot },
      });

      return { success: true, count: targetDeliveries.length, newSlot };
    }

    if (action.type === 'RECORD_PAYMENT') {
      const amtPaise = action.amountPaise || 0;
      if (amtPaise <= 0) throw new BadRequestException('Payment amount must be greater than 0');

      const modeTag = action.paymentMode === 'PHONE_PE' ? '[PHONE_PE]' : '[CASH]';
      const noteTag = `${modeTag} ${action.note || ''}`.trim();

      const updated = await prisma.$transaction([
        prisma.subscriptionDelivery.update({
          where: { id: deliveryId },
          data: {
            cashCollectedPaise: (delivery.cashCollectedPaise || 0) + amtPaise,
            cashCollectedAt: new Date(),
            failureReason: noteTag,
          },
        }),
        prisma.customerSubscription.update({
          where: { id: sub.id },
          data: {
            amountCollectedPaise: (sub.amountCollectedPaise || 0) + amtPaise,
            amountDuePaise: Math.max(0, (sub.amountDuePaise || 0) - amtPaise),
          },
        }),
      ]);

      return { success: true, delivery: updated[0], subscription: updated[1] };
    }

    throw new BadRequestException('Unsupported action type');
  }

  /**
   * Attempts to extract weight in grams from an item name like
   * "Fresh Cow Milk (CM) 1/4 L" → 250, "Aagaam Buffalo Milk 500 ml" → 500
   */
  private static extractWeightGramsFromName(name: string): number | undefined {
    if (!name) return undefined;
    const lower = name.toLowerCase();
    const fracMatch = lower.match(/(\d+)\s*\/\s*(\d+)\s*l/);
    if (fracMatch) {
      const liters = parseInt(fracMatch[1]) / parseInt(fracMatch[2]);
      return Math.round(liters * 1000);
    }
    const mlMatch = lower.match(/(\d+)\s*ml/);
    if (mlMatch) return parseInt(mlMatch[1], 10);
    const literMatch = lower.match(/(\d+(?:\.\d+)?)\s*l/);
    if (literMatch) return Math.round(parseFloat(literMatch[1]) * 1000);
    return undefined;
  }

  /**
   * Base volume for one delivery stop. Split subscriptions persist a distinct
   * quantity per AM/PM slot; falling back to the plan name reported the plan
   * default and ignored the ordered quantity entirely.
   */
  private resolveBaseLiters(
    planName: string,
    priceSnapshot: unknown,
    deliverySlot: string,
    itemsSnapshot?: unknown,
  ): number {
    const itemsSnap = Array.isArray(itemsSnapshot) ? itemsSnapshot : [];
    const firstItem = itemsSnap.length > 0 ? itemsSnap[0] : null;
    const weightGrams: number | undefined = firstItem?.weightGrams ?? StoreMilkGridService.extractWeightGramsFromName(firstItem?.name);

    let planMultiplier: number;
    if (weightGrams && weightGrams <= 300) {
      planMultiplier = 0.25;
    } else if (weightGrams && weightGrams <= 600) {
      planMultiplier = 0.5;
    } else if (planName.toLowerCase().includes('0.25') || planName.toLowerCase().includes('250') || planName.toLowerCase().includes('1/4')) {
      planMultiplier = 0.25;
    } else if (planName.toLowerCase().includes('0.5') || planName.toLowerCase().includes('500') || planName.toLowerCase().includes('1/2')) {
      planMultiplier = 0.5;
    } else {
      planMultiplier = 1.0;
    }

    const splitItems = (priceSnapshot as any)?.splitItems;
    if (!splitItems) return planMultiplier;

    if (deliverySlot === 'AM') {
      return parseVolumeLiters(splitItems.amQuantity || '0.5L') ?? planMultiplier;
    }
    return parseVolumeLiters(splitItems.pmQuantity || '1L') ?? planMultiplier;
  }

  /**
   * Picks the client-supplied amount when present, including an explicit zero.
   * `action.extraPaise || fallback` treated zero as missing and charged the
   * default rate, so a cleared custom price billed ₹80 instead of the ₹0 shown.
   */
  private resolveExtraPaise(...candidates: Array<number | undefined | null>): number | null {
    for (const candidate of candidates) {
      if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0) {
        return Math.round(candidate);
      }
    }
    return null;
  }

  /**
   * Fallback price for an add-on when the client sends none. Derived from the
   * label's volume, because the previous substring tests read `0.25L` as two
   * litres (`includes('2')`) and overcharged it.
   */
  private defaultExtraPricePaise(extraQty: string): number {
    const liters = parseVolumeLiters(extraQty);
    const isCow = extraQty.toUpperCase().includes('CM');
    if (liters === 2) return 16000;
    if (liters === 0.25) return isCow ? 1750 : 2000;
    if (liters === 0.5) return isCow ? 3500 : 4000;
    return isCow ? 7000 : 8000;
  }

  /**
   * Daily Morning Route Dispatch & Packing Summary.
   * Auto-calculates total liters required for Buffalo Milk & Cow Milk today.
   */
  async getDispatchSummary(actor: { id: string; role: Role; email?: string }, dateStr?: string) {
    const targetDate = dateStr ? new Date(dateStr) : new Date();
    const dayStart = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate(), 0, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate(), 23, 59, 59, 999));

    const isMaster = actor.role === Role.ADMIN || (actor.email && (actor.email.includes('aagaam') || actor.email.includes('aagam') || actor.email.includes('store@')));
    const storeFilter = isMaster ? {} : { homeStore: { ownerId: actor.id } };

    const deliveries = await prisma.subscriptionDelivery.findMany({
      where: {
        serviceDate: { gte: dayStart, lte: dayEnd },
        subscription: { ...storeFilter, customer: { isActive: true }, status: { not: 'COMPLETED' } },
      },
      include: {
        subscription: {
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            plan: { select: { id: true, name: true, code: true } },
          },
        },
      },
      orderBy: { sequenceNumber: 'asc' },
    });

    let bmLiters = 0;
    let cmLiters = 0;
    let totalStops = 0;
    let completedStops = 0;
    let cashToCollectPaise = 0;
    let cashCollectedPaise = 0;

    const stops = deliveries.map((d, index) => {
      const planName = d.subscription.plan.name || '';
      const isBuffalo = planName.toLowerCase().includes('buffalo') || planName.toLowerCase().includes('bm');
      const baseQty = this.resolveBaseLiters(planName, d.subscription.priceSnapshot, d.deliverySlot, (d.subscription as any).itemsSnapshot);

      const extraLiters = sumAddOnLiters(d.deferredReason, d.failureReason);

      const isSkipped = d.status === 'SKIPPED';
      const stopLiters = isSkipped ? 0 : baseQty + extraLiters;

      if (!isSkipped) {
        if (isBuffalo) bmLiters += stopLiters;
        else cmLiters += stopLiters;
      }

      totalStops++;
      if (d.status === 'DELIVERED') completedStops++;

      cashToCollectPaise += (d.cashDuePaise || 0);
      cashCollectedPaise += (d.cashCollectedPaise || 0);

      const address = (d.subscription.addressSnapshot as any)?.line1 || 'Local Area';

      return {
        stopNumber: index + 1,
        deliveryId: d.id,
        customerName: d.subscription.customer.name || 'Customer',
        phone: d.subscription.customer.phone || '—',
        address,
        slot: d.deliverySlot,
        product: `${baseQty}L ${isBuffalo ? 'BM' : 'CM'}`,
        extra: extraLiters > 0 ? `+${extraLiters}L` : null,
        totalLiters: stopLiters,
        status: d.status,
        cashDuePaise: d.cashDuePaise,
        cashCollectedPaise: d.cashCollectedPaise,
      };
    });

    return {
      date: targetDate.toISOString().slice(0, 10),
      summary: {
        totalBuffaloMilkLiters: bmLiters,
        totalCowMilkLiters: cmLiters,
        totalMilkLiters: bmLiters + cmLiters,
        totalStops,
        completedStops,
        pendingStops: totalStops - completedStops,
        cashToCollectPaise,
        cashCollectedPaise,
      },
      stops,
    };
  }

  /**
   * Generates a Google Sheets-compatible CSV formatted exactly like the user's Excel file.
   */
  async exportCsv(actor: { id: string; role: Role; email?: string }, year?: number, month?: number): Promise<string> {
    const grid = await this.getGrid(actor, year, month);
    const monthName = new Date(grid.year, grid.month, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });

    const lines: string[] = [];
    lines.push(`"AAGAM DAIRY - MILK ORDERS DAILY DELIVERY FROM BOWLUWADA"`);
    lines.push(`"Month: ${monthName}","Total Customers: ${grid.totalSubscribers}"`);
    lines.push('');

    // Header row
    const headers = ['Customer Name', 'Mobile Number', 'Delivery Address', 'Milk Plan', 'Slot'];
    for (let day = 1; day <= grid.daysInMonth; day++) {
      headers.push(`Day ${day}`);
    }
    headers.push('Total Liters', 'Total Paid (₹)', 'Total Due (₹)');
    lines.push(headers.map((h) => `"${h}"`).join(','));

    // Data rows
    for (const r of grid.rows) {
      // Row 1: Delivery status & quantities
      const row1 = [
        `"${r.customer.name}"`,
        `"${r.customer.phone}"`,
        `"${r.customer.address.replace(/"/g, '""')}"`,
        `"${r.plan.dailyQuantity}"`,
        `"${r.slot}"`,
      ];

      for (let day = 1; day <= grid.daysInMonth; day++) {
        const cell = r.days[day];
        if (!cell) {
          row1.push('""');
        } else if (cell.status === 'DELIVERED') {
          const extraStr = cell.extraMilk ? ` (${cell.extraMilk})` : '';
          row1.push(`"DONE${extraStr}"`);
        } else if (cell.status === 'SKIPPED') {
          row1.push('"NOT TAKEN"');
        } else {
          row1.push('"SCHEDULED"');
        }
      }

      row1.push(`"${r.totalLiters}L"`);
      row1.push(`"${(r.totalCollectedPaise / 100).toFixed(2)}"`);
      row1.push(`"${(r.totalDuePaise / 100).toFixed(2)}"`);
      lines.push(row1.join(','));

      // Row 2: Payments & Mode
      const row2 = ['""', '""', '""', '"Payment Mode"', '""'];
      for (let day = 1; day <= grid.daysInMonth; day++) {
        const cell = r.days[day];
        if (!cell || cell.cashCollectedPaise === 0) {
          row2.push('""');
        } else {
          const mode = cell.paymentMode === 'PHONE_PE' ? 'PhonePe' : 'Cash';
          row2.push(`"₹${(cell.cashCollectedPaise / 100).toFixed(0)} (${mode})"`);
        }
      }
      row2.push('""', '""', '""');
      lines.push(row2.join(','));
    }

    // Daily totals summary footer
    const totalRow = ['"DAILY TOTAL LITERS"', '""', '""', '""', '""'];
    for (let day = 1; day <= grid.daysInMonth; day++) {
      const dt = grid.dailyTotals[day];
      totalRow.push(`"${dt ? dt.totalLiters + 'L' : '0L'}"`);
    }
    totalRow.push('""', '""', '""');
    lines.push(totalRow.join(','));

    return lines.join('\r\n');
  }

  /**
   * Generates a clean WhatsApp bill statement for offline customers.
   */
  async getCustomerStatement(actor: { id: string; role: Role; email?: string }, subscriptionId: string) {
    const sub = await prisma.customerSubscription.findUnique({
      where: { id: subscriptionId },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        plan: { select: { id: true, name: true, code: true } },
        homeStore: { select: { id: true, name: true, ownerId: true } },
        deliveries: {
          orderBy: { serviceDate: 'asc' },
        },
      },
    });

    if (!sub) throw new NotFoundException('Subscription not found');

    const isMaster = actor.role === Role.ADMIN || (actor.email && (actor.email === 'aagaam@gmail.com' || actor.email === 'store@aagam.com'));
    if (!isMaster && sub.homeStore?.ownerId !== actor.id) {
      throw new ForbiddenException('You do not have permission to view statements for this subscription');
    }

    const customerName = sub.customer.name || 'Valued Customer';
    const planName = sub.plan.name;
    const completedCount = sub.deliveries.filter((d) => d.status === 'DELIVERED').length;
    const skippedCount = sub.deliveries.filter((d) => d.status === 'SKIPPED').length;

    const extraLiters = sub.deliveries.reduce(
      (sum, d) => sum + sumAddOnLiters(d.deferredReason, d.failureReason),
      0,
    );

    const totalPaidRupees = (sub.amountCollectedPaise || 0) / 100;
    const totalDueRupees = (sub.amountDuePaise || 0) / 100;

    const whatsappText = `*🥛 AAGAM MILK DELIVERY - MONTHLY STATEMENT*\n` +
      `--------------------------------\n` +
      `*Customer:* ${customerName}\n` +
      `*Plan:* ${planName}\n` +
      `*Delivered Days:* ${completedCount} days\n` +
      `*Skipped Days:* ${skippedCount} days\n` +
      (extraLiters > 0 ? `*Extra Milk:* ${extraLiters} Liters\n` : '') +
      `--------------------------------\n` +
      `*Total Paid:* ₹${totalPaidRupees.toFixed(2)}\n` +
      `*Balance Due:* ₹${totalDueRupees.toFixed(2)}\n` +
      `--------------------------------\n` +
      `Thank you for subscribing with Aagam! For PhonePe / UPI payment: Please contact the store owner.`;

    return {
      subscriptionId,
      customerName,
      phone: sub.customer.phone,
      planName,
      completedCount,
      skippedCount,
      extraLiters,
      totalPaidRupees,
      totalDueRupees,
      whatsappText,
      whatsappUrl: sub.customer.phone ? `https://wa.me/91${sub.customer.phone}?text=${encodeURIComponent(whatsappText)}` : null,
    };
  }

  /**
   * Return approved active delivery riders for store selection.
   */
  async getAvailableRiders(_actor: { id: string; role: Role }) {
    const riders = await prisma.riderProfile.findMany({
      where: {
        approvalStatus: 'APPROVED',
        user: { isActive: true },
      },
      include: {
        user: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return riders.map((r) => ({
      id: r.id,
      name: r.user.name || 'Delivery Rider',
      phone: r.user.phone || '',
      status: r.status,
    }));
  }

  /**
   * Dispatches subscription deliveries (both offline & online) to a chosen delivery rider.
   * Ensures Order, DeliveryJob, DeliveryRun, and DeliveryRunStop with proofMode: RIDER_PHOTO_GPS.
   */
  async dispatchToRider(
    actor: { id: string; role: Role; email?: string },
    dto: {
      deliveryIds: string[];
      riderProfileId: string;
      slot?: 'AM' | 'PM';
      saveAsDefaultRider?: boolean;
      saveAsTemporaryRange?: boolean;
      temporaryStartDate?: string;
      temporaryEndDate?: string;
    },
  ) {
    if (!dto.deliveryIds?.length) throw new BadRequestException('At least one delivery must be selected');
    if (!dto.riderProfileId) throw new BadRequestException('A delivery rider must be selected');

    const rider = await prisma.riderProfile.findFirst({
      where: { id: dto.riderProfileId, approvalStatus: 'APPROVED', user: { isActive: true } },
      include: { user: { select: { id: true, name: true, phone: true } } },
    });
    if (!rider) throw new BadRequestException('Selected rider is not active and approved');

    const deliveries = await prisma.subscriptionDelivery.findMany({
      where: { id: { in: dto.deliveryIds } },
      include: {
        subscription: {
          include: {
            customer: true,
            homeStore: { select: { id: true, ownerId: true, name: true, address: true, latitude: true, longitude: true } },
            plan: true,
          },
        },
        order: { include: { items: true, payment: true } },
        deliveryJob: true,
        runStop: true,
      },
    });

    if (!deliveries.length) throw new NotFoundException('No matching deliveries found');

    const isMaster = actor.role === Role.ADMIN || (actor.email && (actor.email.includes('aagaam') || actor.email.includes('aagam') || actor.email.includes('store@')));
    for (const d of deliveries) {
      if (!isMaster && d.subscription.homeStore?.ownerId !== actor.id) {
        throw new ForbiddenException('You can only dispatch deliveries for your assigned store');
      }
    }

    const first = deliveries[0];
    const store = first.subscription.homeStore || await prisma.store.findFirst({ where: { ownerId: actor.id } });
    if (!store) throw new BadRequestException('Store could not be determined for dispatch');

    return prisma.$transaction(async (tx) => {
      if (dto.saveAsDefaultRider) {
        const subIds = Array.from(new Set(deliveries.map((d) => d.subscriptionId)));
        await tx.customerSubscription.updateMany({
          where: { id: { in: subIds } },
          data: { defaultRiderId: rider.id },
        });
      }

      // Group deliveries by serviceDate and slot so runs are properly partitioned
      const groups = new Map<string, typeof deliveries>();
      for (const d of deliveries) {
        const groupSlot = dto.slot || d.deliverySlot || 'AM';
        const groupDateStr = d.serviceDate.toISOString().slice(0, 10);
        const groupKey = `${groupDateStr}_${groupSlot}`;
        const list = groups.get(groupKey) || [];
        list.push(d);
        groups.set(groupKey, list);
      }

      let lastRunId = '';
      let lastRouteCode = '';

      for (const [groupKey, groupDeliveries] of groups.entries()) {
        const [dateStr, slot] = groupKey.split('_');
        const serviceDate = groupDeliveries[0].serviceDate;
        const cleanStoreName = (store.name || 'STORE').replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase();
        const routeCode = `RUN-${cleanStoreName}-${slot}-${dateStr}-${rider.id.slice(-4)}`;

        let run = await tx.deliveryRun.findFirst({
          where: {
            storeId: store.id,
            serviceDate,
            deliverySlot: slot,
            riderId: rider.id,
            status: { not: 'CANCELLED' },
          },
        });

        if (!run) {
          const slotStart = new Date(serviceDate);
          slotStart.setUTCHours(slot === 'AM' ? 5 : 17, 0, 0, 0);
          const slotEnd = new Date(serviceDate);
          slotEnd.setUTCHours(slot === 'AM' ? 9 : 21, 0, 0, 0);

          run = await tx.deliveryRun.create({
            data: {
              routeCode,
              storeId: store.id,
              riderId: rider.id,
              serviceDate,
              slotStart,
              slotEnd,
              deliveryCluster: 'LOCAL',
              deliverySlot: slot,
              status: 'IN_PROGRESS',
              startedAt: new Date(),
              pickupConfirmedAt: new Date(),
            },
          });
        }

        lastRunId = run.id;
        lastRouteCode = run.routeCode;

        let nextSeq = (await tx.deliveryRunStop.count({ where: { deliveryRunId: run.id } })) + 1;

        for (const d of groupDeliveries) {
          let jobId = d.deliveryJobId;
          if (!jobId) {
            let orderId = d.order?.id;
            if (!orderId) {
              const newOrder = await tx.order.create({
                data: {
                  customerId: d.subscription.customerId,
                  storeId: store.id,
                  status: 'PACKED',
                  orderSource: 'SUBSCRIPTION',
                  totalAmount: (d.cashDuePaise || 0) / 100,
                  subtotal: (d.cashDuePaise || 0) / 100,
                  grandTotal: (d.cashDuePaise || 0) / 100,
                  subtotalPaise: d.cashDuePaise || 0,
                  grandTotalPaise: d.cashDuePaise || 0,
                  currency: 'INR',
                  subscriptionDeliveryId: d.id,
                  scheduledDeliveryDate: d.serviceDate,
                  payment: {
                    create: {
                      method: (d.cashDuePaise || 0) > 0 ? PaymentMethod.COD : PaymentMethod.SUBSCRIPTION_CASH_CREDIT,
                      status: (d.cashDuePaise || 0) > 0 ? PaymentStatus.PENDING_COD : PaymentStatus.SUBSCRIPTION_FUNDED,
                      provider: (d.cashDuePaise || 0) > 0 ? 'COD' : 'SUBSCRIPTION_ENTITLEMENT',
                      amount: (d.cashDuePaise || 0) / 100,
                      amountPaise: d.cashDuePaise || 0,
                      currency: 'INR',
                    },
                  },
                  customerSnapshot: {
                    id: d.subscription.customer.id,
                    name: d.subscription.customer.name,
                    phone: d.subscription.customer.phone,
                  },
                  addressSnapshot: (d.subscription.addressSnapshot as any) || {},
                  itemsSnapshot: (d.subscription.itemsSnapshot as any) || undefined,
                  items: (() => {
                    const rawItems = (d.subscription.itemsSnapshot as any) || [];
                    const validItems = Array.isArray(rawItems)
                      ? rawItems.filter((it: any) => it && it.productId && it.productId !== 'manual-sub')
                      : [];
                    if (validItems.length === 0) return undefined;
                    return {
                      create: validItems.map((it: any) => ({
                        productId: it.productId,
                        quantity: Number(it.quantity) || 1,
                        price: Number(it.price ?? (it.unitPricePaise ? it.unitPricePaise / 100 : 0)),
                        unitPricePaise: Number(it.unitPricePaise ?? d.cashDuePaise ?? 0),
                        lineTotalPaise: Number(it.lineTotalPaise ?? d.cashDuePaise ?? 0),
                      })),
                    };
                  })(),
                },
              });
              orderId = newOrder.id;
            }

            const createdJob = await tx.deliveryJob.create({
              data: {
                orderId,
                status: 'OUT_FOR_DELIVERY',
                currentRiderId: rider.id,
              },
            });
            jobId = createdJob.id;

            await tx.subscriptionDelivery.update({
              where: { id: d.id },
              data: { deliveryJobId: jobId },
            });

            await tx.codLedger.upsert({
              where: { deliveryJobId: jobId },
              create: {
                deliveryJobId: jobId,
                orderId,
                riderId: rider.id,
                expectedAmountPaise: d.cashDuePaise,
                collectedAmountPaise: 0,
                riderHoldingBalancePaise: 0,
                status: 'AWAITING_COLLECTION',
              },
              update: {
                riderId: rider.id,
                expectedAmountPaise: d.cashDuePaise,
              },
            });
          }

          let stop = await tx.deliveryRunStop.findUnique({
            where: { subscriptionDeliveryId: d.id },
          });

          if (!stop) {
            stop = await tx.deliveryRunStop.create({
              data: {
                deliveryRunId: run.id,
                deliveryJobId: jobId,
                subscriptionDeliveryId: d.id,
                sequenceNumber: nextSeq++,
                proofMode: 'RIDER_PHOTO_GPS',
                cashDuePaise: d.cashDuePaise,
                expectedItemCount: 1,
                expectedParcelCount: 1,
                status: 'ARRIVED',
              },
            });
          }

          await tx.subscriptionDelivery.update({
            where: { id: d.id },
            data: {
              status: SubscriptionDeliveryStatus.ASSIGNED,
              proofMode: 'RIDER_PHOTO_GPS',
            },
          });
        }

        const totals = await tx.deliveryRunStop.aggregate({
          where: { deliveryRunId: run.id },
          _count: { _all: true },
          _sum: { cashDuePaise: true },
        });

        await tx.deliveryRun.update({
          where: { id: run.id },
          data: {
            totalStopCount: totals._count._all,
            expectedCashPaise: totals._sum.cashDuePaise ?? 0,
            status: 'IN_PROGRESS',
            version: { increment: 1 },
          },
        });
      }

      if (dto.saveAsTemporaryRange && dto.temporaryStartDate && dto.temporaryEndDate) {
        const subIds = Array.from(new Set(deliveries.map((d) => d.subscriptionId)));
        const start = new Date(dto.temporaryStartDate);
        const end = new Date(dto.temporaryEndDate);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
          const startDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), 0, 0, 0, 0));
          const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), 23, 59, 59, 999));
          await tx.customerSubscription.updateMany({
            where: { id: { in: subIds } },
            data: {
              temporaryRiderId: rider.id,
              temporaryRiderStartDate: startDay,
              temporaryRiderEndDate: endDay,
            },
          });
        }
      }

      return {
        success: true,
        runId: lastRunId,
        routeCode: lastRouteCode,
        dispatchedCount: deliveries.length,
        riderName: rider.user.name,
      };
    });
  }

  /**
   * Permanently sets or clears the default rider for a customer subscription.
   */
  async setDefaultRider(
    actor: { id: string; role: Role; email?: string },
    subscriptionId: string,
    riderProfileId?: string | null,
  ) {
    const sub = await prisma.customerSubscription.findUnique({
      where: { id: subscriptionId },
      include: { homeStore: true },
    });
    if (!sub) throw new NotFoundException('Subscription not found');

    const isMaster = actor.role === Role.ADMIN || (actor.email && (actor.email.includes('aagaam') || actor.email.includes('aagam') || actor.email.includes('store@')));
    if (!isMaster && sub.homeStore?.ownerId !== actor.id) {
      throw new ForbiddenException('You can only set default rider for subscriptions in your store');
    }

    if (riderProfileId) {
      const rider = await prisma.riderProfile.findFirst({
        where: { id: riderProfileId, approvalStatus: 'APPROVED', user: { isActive: true } },
        include: { user: { select: { name: true, phone: true } } },
      });
      if (!rider) throw new BadRequestException('Selected rider is not active and approved');

      await prisma.customerSubscription.update({
        where: { id: subscriptionId },
        data: { defaultRiderId: rider.id },
      });

      return {
        success: true,
        defaultRider: { id: rider.id, name: rider.user.name, phone: rider.user.phone },
      };
    } else {
      await prisma.customerSubscription.update({
        where: { id: subscriptionId },
        data: { defaultRiderId: null },
      });

      return { success: true, defaultRider: null };
    }
  }

  /**
   * Sets or clears a temporary substitute rider for a customer subscription within a date range.
   */
  async setTemporaryRider(
    actor: { id: string; role: Role; email?: string },
    subscriptionId: string,
    dto: { riderProfileId?: string | null; startDate?: string; endDate?: string; applyToScheduledDeliveries?: boolean },
  ) {
    const sub = await prisma.customerSubscription.findUnique({
      where: { id: subscriptionId },
      include: { homeStore: true },
    });
    if (!sub) throw new NotFoundException('Subscription not found');

    const isMaster = actor.role === Role.ADMIN || (actor.email && (actor.email.includes('aagaam') || actor.email.includes('aagam') || actor.email.includes('store@')));
    if (!isMaster && sub.homeStore?.ownerId !== actor.id) {
      throw new ForbiddenException('You can only set temporary rider for subscriptions in your store');
    }

    if (dto.riderProfileId && dto.startDate && dto.endDate) {
      const rider = await prisma.riderProfile.findFirst({
        where: { id: dto.riderProfileId, approvalStatus: 'APPROVED', user: { isActive: true } },
        include: { user: { select: { name: true, phone: true } } },
      });
      if (!rider) throw new BadRequestException('Selected rider is not active and approved');

      const start = new Date(dto.startDate);
      const end = new Date(dto.endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
        throw new BadRequestException('Invalid start or end date');
      }

      const startDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), 0, 0, 0, 0));
      const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), 23, 59, 59, 999));

      await prisma.customerSubscription.update({
        where: { id: subscriptionId },
        data: {
          temporaryRiderId: rider.id,
          temporaryRiderStartDate: startDay,
          temporaryRiderEndDate: endDay,
        },
      });

      if (dto.applyToScheduledDeliveries) {
        const deliveries = await prisma.subscriptionDelivery.findMany({
          where: {
            subscriptionId,
            serviceDate: { gte: startDay, lte: endDay },
            status: { in: ['SCHEDULED', 'RESCHEDULED', 'ASSIGNED'] },
          },
          select: { id: true },
        });
        if (deliveries.length > 0) {
          await this.dispatchToRider(actor, {
            riderProfileId: rider.id,
            deliveryIds: deliveries.map((d) => d.id),
          });
        }
      }

      return {
        success: true,
        temporaryRider: {
          id: rider.id,
          name: rider.user.name,
          phone: rider.user.phone,
          startDate: startDay.toISOString(),
          endDate: endDay.toISOString(),
        },
      };
    } else {
      await prisma.customerSubscription.update({
        where: { id: subscriptionId },
        data: {
          temporaryRiderId: null,
          temporaryRiderStartDate: null,
          temporaryRiderEndDate: null,
        },
      });
      return { success: true, temporaryRider: null };
    }
  }

  /**
   * 1-Click Auto-Dispatch by Pre-Assigned Default / Temporary Riders for any target date.
   */
  async autoDispatchDefaultRiders(
    actor: { id: string; role: Role; email?: string },
    dto: { dateStr: string; slot?: 'AM' | 'PM' | 'ALL'; channel?: 'ALL' | 'ONLINE' | 'OFFLINE' },
  ) {
    const targetDate = new Date(dto.dateStr);
    if (isNaN(targetDate.getTime())) throw new BadRequestException('Invalid date provided');

    const dayStart = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate(), 0, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate(), 23, 59, 59, 999));

    const isMaster = actor.role === Role.ADMIN || (actor.email && (actor.email.includes('aagaam') || actor.email.includes('aagam') || actor.email.includes('store@')));
    const storeFilter = isMaster ? {} : { homeStore: { ownerId: actor.id } };

    const channelFilter: any = {};
    if (dto.channel === 'ONLINE') channelFilter.isCustom = false;
    if (dto.channel === 'OFFLINE') channelFilter.isCustom = true;

    const slotFilter: any = {};
    if (dto.slot && dto.slot !== 'ALL') slotFilter.deliverySlot = dto.slot;

    const deliveries = await prisma.subscriptionDelivery.findMany({
      where: {
        serviceDate: { gte: dayStart, lte: dayEnd },
        status: { in: ['SCHEDULED', 'RESCHEDULED', 'ASSIGNED'] },
        ...slotFilter,
        subscription: {
          ...storeFilter,
          ...channelFilter,
          customer: { isActive: true },
          status: { not: 'COMPLETED' },
          OR: [
            { defaultRiderId: { not: null } },
            { temporaryRiderId: { not: null } },
          ],
        },
      },
      include: {
        subscription: {
          select: {
            id: true,
            defaultRiderId: true,
            defaultRider: { select: { id: true, user: { select: { name: true } } } },
            temporaryRiderId: true,
            temporaryRiderStartDate: true,
            temporaryRiderEndDate: true,
            temporaryRider: { select: { id: true, user: { select: { name: true } } } },
          },
        },
      },
    });

    if (deliveries.length === 0) {
      return {
        success: true,
        dispatchedCount: 0,
        riderBreakdown: {},
        message: 'No eligible deliveries with pre-assigned default or temporary riders found for this date.',
      };
    }

    // Group deliveries by effective rider (temporary rider if active for this date, otherwise default rider)
    const byRider = new Map<string, string[]>();
    for (const d of deliveries) {
      const sub = d.subscription;
      let riderId: string | null = null;
      if (
        sub.temporaryRiderId &&
        sub.temporaryRiderStartDate &&
        sub.temporaryRiderEndDate &&
        dayStart >= sub.temporaryRiderStartDate &&
        dayStart <= sub.temporaryRiderEndDate
      ) {
        riderId = sub.temporaryRiderId;
      } else if (sub.defaultRiderId) {
        riderId = sub.defaultRiderId;
      }
      if (!riderId) continue;
      const list = byRider.get(riderId) || [];
      list.push(d.id);
      byRider.set(riderId, list);
    }

    const riderBreakdown: Record<string, { count: number; name: string }> = {};
    let totalDispatched = 0;

    for (const [riderId, deliveryIds] of byRider.entries()) {
      const res = await this.dispatchToRider(actor, {
        riderProfileId: riderId,
        deliveryIds,
        slot: dto.slot === 'ALL' ? undefined : dto.slot,
      });
      totalDispatched += res.dispatchedCount;
      riderBreakdown[riderId] = {
        count: res.dispatchedCount,
        name: res.riderName || 'Rider',
      };
    }

    return {
      success: true,
      dispatchedCount: totalDispatched,
      riderBreakdown,
      date: dto.dateStr,
    };
  }
}
