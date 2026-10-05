import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { prisma, Prisma, Role, SubscriptionDeliveryStatus, PaymentMethod, PaymentStatus } from '@aagam/database';
import { parseAddOns, parseVolumeLiters, sumAddOnLiters } from './delivery-add-on';
import { computeVoidAdjustment, reconcileSubscriptionBalance } from './subscription-balances';
import { isOfflineSubscription } from '@aagam/utils';
import { SubscriptionCashFundingService } from './subscription-cash-funding.service';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import { startOfUtcDay } from './subscription-calendar.service';

/**
 * A month is `0..11` on the wire and in `Date.UTC`. Reject anything outside
 * that range instead of letting it silently roll into another month (`13`
 * became Feb 2027) or throw a `RangeError` from `Date.UTC` (`99999`).
 */
function normalizeMonth(month: number): number {
  if (!Number.isInteger(month) || month < 0 || month > 11) {
    throw new BadRequestException('month must be an integer between 0 and 11');
  }
  return month;
}

function normalizeYear(year: number): number {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new BadRequestException('year must be an integer between 2000 and 2100');
  }
  return year;
}

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
  /** Live subscription state so the store can see a paused/upcoming customer. */
  status: string;
  pauseEffectiveFrom?: string | null;
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
  totalActiveDeliveries: number;
  totalExtraLiters: number;
  totalLiters: number;
  totalCollectedPaise: number;
  totalDuePaise: number;
}

@Injectable()
export class StoreMilkGridService {
  constructor(
    private readonly funding: SubscriptionCashFundingService,
    private readonly lifecycle: SubscriptionLifecycleService,
  ) {}

  /**
   * Generates a 2D Matrix of all store subscribers across days 1-31 of the requested month.
   */
  async getGrid(actor: { id: string; role: Role; email?: string }, year?: number, month?: number) {
    const now = new Date();
    const targetYear = year !== undefined ? normalizeYear(year) : now.getUTCFullYear();
    const targetMonth = month !== undefined ? normalizeMonth(month) : now.getUTCMonth(); // 0-indexed

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
        // email + acquisitionSource feed the shared isOfflineSubscription()
        // check: source alone is NULL for manually added subscribers.
        customer: { select: { id: true, name: true, phone: true, email: true, acquisitionSource: true } },
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
    const dailyTotals: Record<number, { deliveredCount: number; scheduledCount: number; totalDeliveries: number; totalLiters: number; cashCollectedPaise: number }> = {};
    for (let day = 1; day <= daysInMonth; day++) {
      dailyTotals[day] = { deliveredCount: 0, scheduledCount: 0, totalDeliveries: 0, totalLiters: 0, cashCollectedPaise: 0 };
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
      let totalActiveDeliveries = 0;
      let totalExtraLiters = 0;
      let calculatedLiters = 0;

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

          // Only delivered milk counts as "delivered" cash; skipped/cancelled
          // occurrences are not milk at all. Everything else is milk still on
          // the plan for that day, so the row and daily litre totals must
          // include it (previously they summed delivered cells only, which
          // showed 0L for every future/undelivered day).
          if (d.status !== 'SKIPPED' && d.status !== 'CANCELLED') {
            calculatedLiters += deliveryBaseMultiplier + extraLiters;
            totalActiveDeliveries++;
            if (dailyTotals[dayNum]) {
              dailyTotals[dayNum].totalDeliveries++;
              dailyTotals[dayNum].totalLiters += deliveryBaseMultiplier + extraLiters;
            }
          }

          if (d.status === 'DELIVERED') {
            totalDeliveredDays++;
            totalExtraLiters += extraLiters;
            if (dailyTotals[dayNum]) {
              dailyTotals[dayNum].deliveredCount++;
              dailyTotals[dayNum].cashCollectedPaise += d.cashCollectedPaise || 0;
            }
          } else if (d.status === 'SCHEDULED') {
            if (dailyTotals[dayNum]) {
              dailyTotals[dayNum].scheduledCount++;
            }
          }
        }
      }

      const totalLiters = calculatedLiters;

      // Money columns must agree with the day cells rendered in the same row.
      // The ledger can lag the cash evidenced on deliveries, so reconcile the
      // whole customer (all merged subscriptions) before totalling.
      const reconciled = reconcileSubscriptionBalance(
        activeSub,
        custSubs.flatMap((sub) => sub.deliveries),
      );

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
          customerType: isOfflineSubscription(activeSub) ? 'offline' : 'online',
        },
        plan: {
          id: activeSub.plan.id,
          name: activeSub.plan.name,
          code: activeSub.plan.code,
          dailyQuantity: allPlans[0]?.dailyQuantity || `${allPlans[0]?.name || 'Milk Plan'}`,
        },
        slot: splitItems ? 'AM+PM' : (activeSub.deliveryWindowStartMinute >= 900 ? 'PM' : 'AM'),
        status: activeSub.status,
        pauseEffectiveFrom: (activeSub as any).pauseEffectiveFrom?.toISOString() || null,
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
        totalActiveDeliveries,
        totalExtraLiters,
        totalLiters,
        totalCollectedPaise: reconciled.amountCollectedPaise,
        totalDuePaise: reconciled.amountDuePaise,
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
   * Builds the rider's own route board for a service date. This is the single
   * read the rider web/mobile UI uses to render every stop of every assigned
   * run with the same operational detail the store sees (address, coordinates,
   * items, cash due, slot window) so the rider can navigate and act on a whole
   * route instead of individual job cards.
   */
  async getRiderRouteBoard(actor: { id: string; role: Role; email?: string }, dateStr?: string) {
    const rider = await prisma.riderProfile.findUnique({
      where: { userId: actor.id },
      include: { user: { select: { id: true, name: true, phone: true } } },
    });
    if (!rider) throw new NotFoundException('Rider profile not found');

    const base = dateStr ? new Date(dateStr) : new Date();
    const dayStart = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 0, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 23, 59, 59, 999));

    const runs = await prisma.deliveryRun.findMany({
      where: {
        riderId: rider.id,
        serviceDate: { gte: dayStart, lte: dayEnd },
        status: { notIn: ['CANCELLED'] },
      },
      include: {
        store: { select: { id: true, name: true, address: true, latitude: true, longitude: true } },
        deliveryZone: { select: { id: true, name: true, centerLatitude: true, centerLongitude: true } },
        stops: {
          orderBy: { sequenceNumber: 'asc' },
          include: {
            deliveryJob: {
              include: {
                order: {
                  include: {
                    customer: { select: { id: true, name: true, phone: true } },
                    payment: { select: { method: true, status: true, amountPaise: true } },
                    items: { include: { product: { select: { id: true, name: true, image: true } } } },
                  },
                },
              },
            },
            subscriptionDelivery: {
              include: {
                subscription: {
                  select: {
                    id: true,
                    customerId: true,
                    addressSnapshot: true,
                    deliveryMethod: true,
                    trustedDropInstructions: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ slotStart: 'asc' }],
    });

    const addressOf = (snapshot: unknown, fallback?: { latitude: number | null; longitude: number | null }) => {
      const s = (snapshot || {}) as Record<string, any>;
      const parts = [s.line1, s.line2, s.landmark, s.city, s.pincode].filter(Boolean);
      const latitude = typeof s.latitude === 'number' ? s.latitude : fallback?.latitude ?? null;
      const longitude = typeof s.longitude === 'number' ? s.longitude : fallback?.longitude ?? null;
      return {
        text: parts.join(', ') || s.recipientName || 'Customer address',
        latitude,
        longitude,
        // True when we only have the delivery-zone centre, so the rider UI can
        // flag the pin as approximate instead of pretending it is exact.
        approximate: typeof s.latitude !== 'number' || typeof s.longitude !== 'number',
        recipientName: s.recipientName ?? null,
      };
    };

    const routes = runs.map((run) => {
      const zoneFallback = {
        latitude: run.deliveryZone?.centerLatitude ?? null,
        longitude: run.deliveryZone?.centerLongitude ?? null,
      };
      const stops = run.stops.map((stop) => {
        const address = addressOf(stop.subscriptionDelivery?.subscription?.addressSnapshot, zoneFallback);
        const order = stop.deliveryJob?.order;
        return {
          id: stop.id,
          subscriptionDeliveryId: stop.subscriptionDeliveryId,
          deliveryJobId: stop.deliveryJobId,
          runId: run.id,
          routeCode: run.routeCode,
          sequenceNumber: stop.sequenceNumber,
          status: stop.status,
          proofMode: stop.proofMode,
          version: stop.version,
          cashDuePaise: stop.cashDuePaise,
          deliveredAt: stop.deliveredAt,
          failureReason: stop.failureReason,
          customer: order?.customer
            ? { id: order.customer.id, name: order.customer.name, phone: order.customer.phone }
            : { id: null, name: address.recipientName || 'Customer', phone: null },
          address,
          items: (order?.items || []).map((item) => ({
            id: item.id,
            name: item.product?.name || 'Item',
            quantity: item.quantity,
            image: item.product?.image ?? null,
          })),
          payment: order?.payment
            ? { method: order.payment.method, status: order.payment.status, amountPaise: order.payment.amountPaise }
            : null,
          deliveryMethod: stop.subscriptionDelivery?.subscription?.deliveryMethod ?? null,
          trustedDropInstructions: stop.subscriptionDelivery?.subscription?.trustedDropInstructions ?? null,
        };
      });
      const actionable = stops.filter((s) => !['DELIVERED', 'FAILED', 'CANCELLED', 'RETURNED'].includes(s.status));
      return {
        id: run.id,
        routeCode: run.routeCode,
        status: run.status,
        deliverySlot: run.deliverySlot,
        serviceDate: run.serviceDate,
        slotStart: run.slotStart,
        slotEnd: run.slotEnd,
        store: run.store,
        totalStopCount: stops.length,
        completedStopCount: stops.filter((s) => s.status === 'DELIVERED').length,
        expectedCashPaise: stops.reduce((sum, s) => sum + (s.cashDuePaise || 0), 0),
        crateCode: run.crateCode,
        expectedBagCount: run.expectedBagCount,
        stops,
        nextStop: actionable[0] || null,
      };
    });

    const allStops = routes.flatMap((r) => r.stops);
    return {
      date: dayStart.toISOString().slice(0, 10),
      rider: { id: rider.id, name: rider.user?.name || 'Rider', phone: rider.user?.phone || '', status: rider.status },
      summary: {
        routeCount: routes.length,
        stopCount: allStops.length,
        completedStopCount: allStops.filter((s) => s.status === 'DELIVERED').length,
        cashDuePaise: allStops.reduce((sum, s) => sum + (s.cashDuePaise || 0), 0),
      },
      routes,
    };
  }

  async executeQuickAction(
    actor: { id: string; role: Role; email?: string },
    deliveryId: string,
    action: {
      type: 'TOGGLE_DELIVERED' | 'SKIP' | 'EXTRA_MILK' | 'TOGGLE_SLOT' | 'RECORD_PAYMENT' | 'VOID_PAYMENT' | 'ATTACH_EVENING_MILK';
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
            planVersion: { select: { totalDeliveries: true } },
          },
        },
        runStop: { include: { deliveryRun: { select: { riderId: true } } } },
        deliveryJob: { select: { currentRiderId: true } },
      },
    });

    if (!delivery) throw new NotFoundException('Delivery not found');

    const isMaster = actor.role === Role.ADMIN || (actor.email && (actor.email.includes('aagaam') || actor.email.includes('aagam') || actor.email.includes('store@')));
    const isStoreOwner = delivery.subscription.homeStore?.ownerId === actor.id;
    // A rider may run the same field actions on a delivery that is on their own
    // run (or job). Ownership is resolved from the assignment, not a request
    // body, so a rider can never act on another rider's stop.
    const actorRiderProfileId =
      actor.role === Role.RIDER
        ? (await prisma.riderProfile.findUnique({ where: { userId: actor.id }, select: { id: true } }))?.id
        : null;
    const isAssignedRider =
      actor.role === Role.RIDER &&
      actorRiderProfileId != null &&
      (delivery.runStop?.deliveryRun?.riderId === actorRiderProfileId ||
        delivery.deliveryJob?.currentRiderId === actorRiderProfileId);
    if (!isMaster && !isStoreOwner && !isAssignedRider) {
      throw new ForbiddenException('You can only update deliveries for your assigned store or route');
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

      const deliveredAt = isCurrentlyDelivered ? null : new Date();
      const updated = await prisma.$transaction(async (tx) => {
        // Guard the transition so two concurrent "mark delivered" requests
        // cannot both consume the delivery: the second sees zero rows updated.
        const transition = await tx.subscriptionDelivery.updateMany({
          where: isCurrentlyDelivered
            ? { id: deliveryId }
            : { id: deliveryId, status: { not: SubscriptionDeliveryStatus.DELIVERED } },
          data: {
            status: newStatus,
            deliveredAt,
            // Field is store-scoped by name, but only records the acting user.
            // A rider marking a stop delivered must not be written as a store user.
            deliveredByStoreUserId: isCurrentlyDelivered ? null : (isAssignedRider ? null : actor.id),
            cashCollectedPaise: updatedCashCollected,
            cashCollectedAt: cashDelta > 0 ? new Date() : (isCurrentlyDelivered ? null : delivery.cashCollectedAt),
          },
        });
        if (transition.count === 0) {
          throw new ConflictException('Delivery was already completed by another request');
        }
        const nextDelivery = await tx.subscriptionDelivery.findUniqueOrThrow({ where: { id: deliveryId } });

        if (isCurrentlyDelivered) {
          // Undo: recompute completed count and roll the funding entitlement
          // back. Status is left untouched — a plan that was activated by an
          // earlier delivery must not silently regress to "Upcoming".
          const rolledBackSub = await tx.customerSubscription.update({
            where: { id: delivery.subscriptionId },
            data: {
              completedDeliveries: newCompleted,
              skippedDeliveries: newSkipped,
              remainingFundedDeliveries: Math.min(
                sub.planVersion.totalDeliveries,
                (sub.remainingFundedDeliveries || 0) + 1,
              ),
              amountCollectedPaise: Math.max(0, (sub.amountCollectedPaise || 0) + cashDelta),
              amountDuePaise: Math.max(0, (sub.amountDuePaise || 0) - cashDelta),
            },
          });
          await this.syncRunStopForQuickAction(delivery, 'UNDO', tx);
          return { nextDelivery, sub: rolledBackSub };
        }

        // Completion — not cash — advances the plan. The funding service owns
        // the delivery status, completed count, entitlement and status
        // transition, and it preserves any outstanding balance as due.
        const consumed = await this.funding.consumeDeliveredWithinTransaction(
          tx,
          deliveryId,
          { id: actor.id, role: actor.role },
          `milk-grid-delivered:${deliveryId}:${deliveredAt!.getTime()}`,
          { deliveryAlreadyCompleted: true },
        );
        const advancedSub = await tx.customerSubscription.findUnique({ where: { id: delivery.subscriptionId } });
        await this.syncRunStopForQuickAction(delivery, 'DELIVERED', tx);
        return { nextDelivery: consumed ?? nextDelivery, sub: advancedSub };
      });

      return { success: true, delivery: updated.nextDelivery, subscription: updated.sub };
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

      const updated = await prisma.$transaction(async (tx) => {
        const nextDelivery = await tx.subscriptionDelivery.update({
          where: { id: deliveryId },
          data: {
            status: SubscriptionDeliveryStatus.SKIPPED,
            skippedAt: new Date(),
            skipReason: action.note?.trim() || 'Not taken / Skipped by customer',
            deliveredAt: null,
            deliveredByStoreUserId: null,
            cashCollectedPaise: updatedCashCollected,
          },
        });
        // Same teardown as the customer skip path: cancel the order, delivery
        // job and run stop so the store grid and the rider board agree.
        await this.lifecycle.cancelRiderArtifactsWithinTransaction(
          tx,
          deliveryId,
          `Subscription delivery skipped: ${action.note?.trim() || 'Not taken / Skipped by customer'}`,
        );
        const nextSub = await tx.customerSubscription.update({
          where: { id: sub.id },
          data: {
            completedDeliveries: newCompleted,
            skippedDeliveries: newSkipped,
            amountCollectedPaise: Math.max(0, (sub.amountCollectedPaise || 0) + cashDelta),
            amountDuePaise: Math.max(0, (sub.amountDuePaise || 0) - cashDelta),
          },
        });
        return [nextDelivery, nextSub] as const;
      });

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

      // Mirror the rider COD path's subscription-level guard: the due is a hard
      // floor. Without it an over-collection mints phantom collected cash on the
      // cell (reconciliation then surfaces it as "Paid") while the ledger's due
      // is silently clamped, so the two disagree. There is deliberately no
      // per-day cap here: the store's payment tab collects against the whole
      // subscription (its "Full Due" preset), so a lump sum on one cell is valid.
      const outstandingDue = Math.max(0, sub.amountDuePaise || 0);
      if (outstandingDue <= 0) {
        throw new BadRequestException('This subscription has no outstanding due balance to collect');
      }
      if (amtPaise > outstandingDue) {
        throw new BadRequestException(
          `Payment amount (₹${(amtPaise / 100).toFixed(2)}) cannot exceed the outstanding due balance of ₹${(outstandingDue / 100).toFixed(2)}`,
        );
      }

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
            amountDuePaise: Math.max(0, outstandingDue - amtPaise),
          },
        }),
      ]);

      return { success: true, delivery: updated[0], subscription: updated[1] };
    }

    if (action.type === 'VOID_PAYMENT') {
      const collectedOnCell = Math.max(0, delivery.cashCollectedPaise || 0);
      if (collectedOnCell <= 0) {
        throw new BadRequestException('This delivery has no recorded payment to void');
      }
      const requested = action.amountPaise && action.amountPaise > 0 ? action.amountPaise : collectedOnCell;
      const voidPaise = Math.min(requested, collectedOnCell);

      const remainingCellCash = collectedOnCell - voidPaise;
      const { amountCollectedPaise, dueRestoredPaise } = computeVoidAdjustment(
        sub.amountCollectedPaise,
        voidPaise,
      );

      await prisma.$transaction([
        prisma.subscriptionDelivery.update({
          where: { id: deliveryId },
          data: {
            cashCollectedPaise: remainingCellCash,
            cashCollectedAt: remainingCellCash > 0 ? delivery.cashCollectedAt : null,
            failureReason: remainingCellCash > 0
              ? delivery.failureReason
              : null,
          },
        }),
        prisma.customerSubscription.update({
          where: { id: sub.id },
          data: {
            amountCollectedPaise,
            // Return only the amount actually removed from the raw collected
            // ledger so collected + due continues to equal the subscription
            // price, even when the ledger was already short of the cash
            // evidenced on this delivery.
            amountDuePaise: (sub.amountDuePaise || 0) + dueRestoredPaise,
          },
        }),
        prisma.subscriptionAuditEntry.create({
          data: {
            subscriptionId: sub.id,
            actorUserId: actor.id,
            actorRole: actor.role,
            action: 'PAYMENT_VOIDED',
            reason: action.note?.trim() || `Voided ₹${(voidPaise / 100).toFixed(2)} recorded on delivery ${delivery.sequenceNumber}`,
            metadata: {
              deliveryId,
              voidedPaise: voidPaise,
              cellCashBeforePaise: collectedOnCell,
              cellCashAfterPaise: remainingCellCash,
              ledgerCollectedBeforePaise: sub.amountCollectedPaise || 0,
              ledgerDueBeforePaise: sub.amountDuePaise || 0,
            },
            idempotencyKey: `payment-void:${deliveryId}:${randomUUID()}`,
          },
        }),
      ]);

      return {
        success: true,
        voidedPaise: voidPaise,
        cellCashCollectedPaise: remainingCellCash,
      };
    }

    throw new BadRequestException('Unsupported action type');
  }

  /**
   * Keeps the route model in step with the store/rider quick-action grid. The
   * grid toggles the subscription delivery, but the rider's Runs screen reads
   * DeliveryRunStop, so a store "Mark Delivered" used to leave the run stop (and
   * its progress/cash totals) stale. No-op when the delivery is not on a run.
   */
  private async syncRunStopForQuickAction(
    delivery: { runStop: { id: string; deliveryRunId: string } | null },
    action: 'DELIVERED' | 'UNDO',
    tx: Prisma.TransactionClient,
  ) {
    const runStop = delivery.runStop;
    if (!runStop) return;

    await tx.deliveryRunStop.update({
      where: { id: runStop.id },
      data: {
        status: action === 'DELIVERED' ? 'DELIVERED' : 'ARRIVED',
        deliveredAt: action === 'DELIVERED' ? new Date() : null,
        version: { increment: 1 },
      },
    });

    const [agg, completedStopCount] = await Promise.all([
      tx.deliveryRunStop.aggregate({
        where: { deliveryRunId: runStop.deliveryRunId },
        _count: { _all: true },
        _sum: { cashDuePaise: true },
      }),
      tx.deliveryRunStop.count({
        where: { deliveryRunId: runStop.deliveryRunId, status: 'DELIVERED' },
      }),
    ]);

    await tx.deliveryRun.update({
      where: { id: runStop.deliveryRunId },
      data: {
        totalStopCount: agg._count._all,
        completedStopCount,
        expectedCashPaise: agg._sum.cashDuePaise ?? 0,
        version: { increment: 1 },
      },
    });
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
        // Skipped and cancelled occurrences are not milk to prep. Counting them
        // inflated the store's daily stop/litre totals after a customer skip.
        status: { notIn: [SubscriptionDeliveryStatus.SKIPPED, SubscriptionDeliveryStatus.CANCELLED] },
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

    const { amountCollectedPaise, amountDuePaise } = reconcileSubscriptionBalance(sub, sub.deliveries);
    const totalPaidRupees = amountCollectedPaise / 100;
    const totalDueRupees = amountDuePaise / 100;

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
  async getAvailableRiders(actor: { id: string; role: Role; email?: string }) {
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

    const isMaster = actor.role === Role.ADMIN || (actor.email && (actor.email.includes('aagaam') || actor.email.includes('aagam') || actor.email.includes('store@')));
    const dayStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(), 0, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(), 23, 59, 59, 999));

    // Count active (non-cancelled, non-completed) runs so the store sees real
    // workload instead of the undefined value the UI used to render.
    const counts = await prisma.deliveryRun.groupBy({
      by: ['riderId'],
      where: {
        riderId: { not: null },
        status: { notIn: ['CANCELLED', 'COMPLETED'] },
        serviceDate: { gte: dayStart, lte: dayEnd },
        ...(isMaster ? {} : { store: { ownerId: actor.id } }),
      },
      _count: { _all: true },
    });
    const countByRider = new Map(counts.map((c) => [c.riderId as string, c._count._all]));

    return riders.map((r) => ({
      id: r.id,
      name: r.user.name || 'Delivery Rider',
      phone: r.user.phone || '',
      status: r.status,
      pendingRunCount: countByRider.get(r.id) ?? 0,
    }));
  }

  /**
   * Builds the rider dispatch board for a service date: which customers are
   * assigned to which rider (with timings and cash) and which are still
   * unassigned. This is the single source the store uses to audit dispatch.
   */
  async getRiderAssignments(actor: { id: string; role: Role; email?: string }, dateStr?: string) {
    const base = dateStr ? startOfUtcDay(dateStr) : new Date();
    const dayStart = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 0, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 23, 59, 59, 999));

    const isMaster = actor.role === Role.ADMIN || (actor.email && (actor.email.includes('aagaam') || actor.email.includes('aagam') || actor.email.includes('store@')));
    const storeFilter = isMaster ? {} : { homeStore: { ownerId: actor.id } };

    const deliveries = await prisma.subscriptionDelivery.findMany({
      where: {
        serviceDate: { gte: dayStart, lte: dayEnd },
        subscription: { ...storeFilter, customer: { isActive: true }, status: { not: 'COMPLETED' } },
        // Mirror dispatch-summary: a COMPLETED contract keeps its old
        // SCHEDULED/ORDER_GENERATED rows in the DB, and counting them made the
        // rider board report one more stop than the dispatch summary (e.g.
        // Nookalamma's final day lingering on a completed contract).
        status: { notIn: [SubscriptionDeliveryStatus.SKIPPED, SubscriptionDeliveryStatus.CANCELLED] },
      },
      include: {
        subscription: {
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            plan: { select: { id: true, name: true, code: true } },
          },
        },
        order: { select: { id: true, status: true } },
        runStop: {
          include: {
            deliveryRun: {
              include: {
                rider: {
                  include: { user: { select: { id: true, name: true, phone: true } } },
                },
              },
            },
          },
        },
      },
      orderBy: { sequenceNumber: 'asc' },
    });

    const slotWindow = (serviceDate: Date, slot: string) => {
      const start = new Date(serviceDate);
      start.setUTCHours(slot === 'PM' ? 17 : 5, 0, 0, 0);
      const end = new Date(serviceDate);
      end.setUTCHours(slot === 'PM' ? 21 : 9, 0, 0, 0);
      return { start: start.toISOString(), end: end.toISOString() };
    };

    const toStop = (d: (typeof deliveries)[number]) => {
      const planName = d.subscription.plan.name || '';
      const isBuffalo = planName.toLowerCase().includes('buffalo') || planName.toLowerCase().includes('bm');
      const baseQty = this.resolveBaseLiters(planName, d.subscription.priceSnapshot, d.deliverySlot, (d.subscription as any).itemsSnapshot);
      const extraLiters = sumAddOnLiters(d.deferredReason, d.failureReason);
      const addr = d.subscription.addressSnapshot as any;
      return {
        stopId: d.runStop?.id ?? null,
        sequenceNumber: d.runStop?.sequenceNumber ?? d.sequenceNumber,
        stopStatus: d.runStop?.status ?? null,
        deliveryId: d.id,
        deliveryStatus: d.status,
        proofMode: d.runStop?.proofMode ?? d.proofMode,
        slot: d.deliverySlot,
        customer: {
          id: d.subscription.customer.id,
          name: d.subscription.customer.name || 'Customer',
          phone: d.subscription.customer.phone || '—',
        },
        address: addr?.line1 || addr?.street || 'Local Area',
        product: `${baseQty}L ${isBuffalo ? 'BM' : 'CM'}`,
        liters: baseQty + extraLiters,
        cashDuePaise: d.cashDuePaise || 0,
        cashCollectedPaise: d.cashCollectedPaise || 0,
        orderId: d.order?.id ?? null,
        orderStatus: d.order?.status ?? null,
      };
    };

    // Assigned = delivery has a run stop whose run is owned by a rider.
    const riderMap = new Map<
      string,
      {
        id: string;
        name: string;
        phone: string;
        profileStatus: string;
        vehicleType: string | null;
        vehicleNumber: string | null;
        runs: Map<
          string,
          {
            id: string;
            routeCode: string;
            slot: string;
            status: string;
            totalStopCount: number;
            expectedCashPaise: number;
            timings: { slotStart: string; slotEnd: string; startedAt: string | null; pickupConfirmedAt: string | null; completedAt: string | null };
            stops: ReturnType<typeof toStop>[];
          }
        >;
      }
    >();

    const unassigned: ReturnType<typeof toStop>[] = [];
    let assignedCount = 0;
    let unassignedCount = 0;
    let cashToCollectPaise = 0;
    let cashCollectedPaise = 0;
    let totalLiters = 0;
    const slotCounts: Record<string, number> = { AM: 0, PM: 0 };

    for (const d of deliveries) {
      slotCounts[d.deliverySlot] = (slotCounts[d.deliverySlot] || 0) + 1;
      const stop = toStop(d);
      cashToCollectPaise += stop.cashDuePaise;
      cashCollectedPaise += stop.cashCollectedPaise;
      totalLiters += stop.liters;

      const run = d.runStop?.deliveryRun;
      const rider = run?.rider;
      if (!run || !rider) {
        unassignedCount++;
        unassigned.push(stop);
        continue;
      }

      assignedCount++;
      const riderEntry =
        riderMap.get(rider.id) ||
        {
          id: rider.id,
          name: rider.user?.name || 'Delivery Rider',
          phone: rider.user?.phone || '',
          profileStatus: rider.status,
          vehicleType: (rider as any).vehicleType ?? null,
          vehicleNumber: (rider as any).vehicleNumber ?? null,
          runs: new Map(),
        };
      riderMap.set(rider.id, riderEntry);

      const runEntry =
        riderEntry.runs.get(run.id) ||
        {
          id: run.id,
          routeCode: run.routeCode,
          slot: run.deliverySlot,
          status: run.status,
          totalStopCount: run.totalStopCount,
          expectedCashPaise: run.expectedCashPaise,
          timings: {
            ...slotWindow(run.serviceDate, run.deliverySlot),
            startedAt: run.startedAt ? run.startedAt.toISOString() : null,
            pickupConfirmedAt: run.pickupConfirmedAt ? run.pickupConfirmedAt.toISOString() : null,
            completedAt: run.completedAt ? run.completedAt.toISOString() : null,
          },
          stops: [],
        };
      runEntry.stops.push(stop);
      riderEntry.runs.set(run.id, runEntry);
    }

    const riders = Array.from(riderMap.values())
      .map((r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        profileStatus: r.profileStatus,
        vehicleType: r.vehicleType,
        vehicleNumber: r.vehicleNumber,
        runs: Array.from(r.runs.values()).map((run) => ({
          ...run,
          totalStopCount: run.stops.length || run.totalStopCount,
          cashToCollectPaise: run.stops.reduce((sum, s) => sum + s.cashDuePaise, 0),
        })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      date: dayStart.toISOString().slice(0, 10),
      slots: {
        AM: slotWindow(dayStart, 'AM'),
        PM: slotWindow(dayStart, 'PM'),
      },
      totals: {
        stops: assignedCount + unassignedCount,
        assigned: assignedCount,
        unassigned: unassignedCount,
        riders: riders.length,
        slotCounts,
        totalLiters,
        cashToCollectPaise,
        cashCollectedPaise,
      },
      riders,
      unassigned,
    };
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
      where: {
        id: { in: dto.deliveryIds },
        // A skipped or cancelled occurrence is not deliverable; dispatching it
        // would resurrect the stop the skip/pause teardown just cancelled.
        status: { notIn: [SubscriptionDeliveryStatus.SKIPPED, SubscriptionDeliveryStatus.CANCELLED] },
      },
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
              // The store's handoff is implicit in this dispatch action, so the
              // run is handed to the rider as READY_FOR_PICKUP. The rider then
              // performs an independent bag receipt before starting the route,
              // which is what surfaces the run on the rider's Runs screen.
              status: 'READY_FOR_PICKUP',
              storeHandoffConfirmedAt: new Date(),
              storeHandoffConfirmedById: actor.id,
              plannedAt: new Date(),
            },
          });
        }

        lastRunId = run.id;
        lastRouteCode = run.routeCode;

        // Sequence numbers must continue past the highest existing stop, not the
        // stop count: removals and reordering leave gaps that a count would reuse,
        // colliding with @@unique([deliveryRunId, sequenceNumber]).
        const highestSeq = await tx.deliveryRunStop.aggregate({
          where: { deliveryRunId: run.id },
          _max: { sequenceNumber: true },
        });
        let nextSeq = (highestSeq._max.sequenceNumber ?? 0) + 1;

        for (const d of groupDeliveries) {
          const hadJob = Boolean(d.deliveryJobId);
          let jobId = d.deliveryJobId;
          let orderId = d.order?.id;
          if (!jobId) {
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
                // The rider's route pickup (confirmPickupReceipt) requires the
                // job at the store. Creating it OUT_FOR_DELIVERY made every
                // freshly dispatched subscription undeliverable: pickup threw
                // "Stop N is not ready for rider receipt" and the run could
                // never leave READY_FOR_PICKUP.
                status: 'RIDER_AT_STORE',
                currentRiderId: rider.id,
              },
            });
            jobId = createdJob.id;

            await tx.subscriptionDelivery.update({
              where: { id: d.id },
              data: { deliveryJobId: jobId },
            });

            // CodLedger has a CHECK constraint requiring expectedAmountPaise > 0.
            // A fully-funded/prepaid day has cashDuePaise = 0, so minting a COD
            // ledger for it violates the constraint and rolls the whole dispatch
            // back with a 500. COD tracking only applies when there is cash due.
            const cashDuePaise = d.cashDuePaise || 0;
            if (cashDuePaise > 0) {
              await tx.codLedger.upsert({
                where: { deliveryJobId: jobId },
                create: {
                  deliveryJobId: jobId,
                  orderId,
                  riderId: rider.id,
                  expectedAmountPaise: cashDuePaise,
                  collectedAmountPaise: 0,
                  riderHoldingBalancePaise: 0,
                  status: 'AWAITING_COLLECTION',
                },
                update: {
                  riderId: rider.id,
                  expectedAmountPaise: cashDuePaise,
                },
              });
            }
          }

          if (hadJob) {
            // Order-generated subscription jobs sit at WAITING_FOR_DISPATCH and
            // were never advanced to the store, so the rider's route pickup
            // rejected them ("Stop N is not ready for rider receipt"). Move any
            // pre-pickup job to RIDER_AT_STORE, matching the store handoff this
            // dispatch action implies. Terminal/active states are left alone.
            await tx.deliveryJob.updateMany({
              where: {
                id: jobId,
                status: { in: ['WAITING_FOR_DISPATCH', 'RIDER_ASSIGNED', 'RIDER_EN_ROUTE_TO_STORE'] },
              },
              data: { status: 'RIDER_AT_STORE', currentRiderId: rider.id },
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
                status: 'READY',
              },
            });
          } else if (stop.deliveryRunId !== run.id) {
            // A planning run may have already reserved this delivery. Move the
            // stop onto the rider's run so the dispatch actually takes effect.
            stop = await tx.deliveryRunStop.update({
              where: { id: stop.id },
              data: {
                deliveryRunId: run.id,
                sequenceNumber: nextSeq++,
                movedFromRunId: stop.deliveryRunId,
                lastMovedAt: new Date(),
                status: 'READY',
                version: { increment: 1 },
              },
            });
          }

          // Keep the order's rider in sync: the orders board and tracking read
          // order.riderId, which the dispatch path previously left untouched.
          if (orderId) {
            await tx.order.updateMany({
              where: {
                id: orderId,
                status: { notIn: ['DELIVERED', 'CANCELLED', 'STORE_DELIVERED'] },
              },
              data: {
                riderId: rider.id,
                riderAssignedAt: new Date(),
                status: 'RIDER_ASSIGNED',
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
          _sum: { cashDuePaise: true, expectedParcelCount: true, expectedItemCount: true },
        });

        const stopCount = totals._count._all;
        const bagCount = totals._sum.expectedParcelCount ?? stopCount;

        await tx.deliveryRun.update({
          where: { id: run.id },
          data: {
            totalStopCount: stopCount,
            originalStopCount: stopCount,
            expectedParcelCount: bagCount,
            expectedBagCount: bagCount,
            expectedItemCount: totals._sum.expectedItemCount ?? stopCount,
            expectedCashPaise: totals._sum.cashDuePaise ?? 0,
            // Preserve a run the rider already started; otherwise leave it ready
            // for the rider's independent bag receipt.
            status: run.status === 'PICKED_UP' || run.status === 'IN_PROGRESS' ? run.status : 'READY_FOR_PICKUP',
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
