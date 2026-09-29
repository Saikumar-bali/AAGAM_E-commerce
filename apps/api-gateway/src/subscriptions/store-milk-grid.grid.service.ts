/**
 * Store grid matrix and CSV export.
 *
 * Split out of the former store-milk-grid.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { Injectable } from "@nestjs/common";
import { prisma, Role } from "@aagam/database";
import { parseAddOns, sumAddOnLiters } from "./delivery-add-on";
import { reconcileSubscriptionBalance } from "./subscription-balances";
import { StoreMilkGridBase } from "./store-milk-grid.base";
import { GridCell, PlanInfo, GridRow } from "./store-milk-grid.types";

@Injectable()
export class StoreMilkGridGridService extends StoreMilkGridBase {
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
        const subWeightGrams: number | undefined = subFirstItem?.weightGrams ?? StoreMilkGridBase.extractWeightGramsFromName(subFirstItem?.name);
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
}
