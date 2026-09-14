import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { prisma, Role, SubscriptionDeliveryStatus } from '@aagam/database';

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
}

export interface GridRow {
  subscriptionId: string;
  customer: {
    id: string;
    name: string;
    phone: string;
    address: string;
  };
  plan: {
    id: string;
    name: string;
    code: string;
    dailyQuantity: string;
  };
  slot: string;
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
        OR: [
          { status: { in: ['ACTIVE', 'PENDING_CASH_COLLECTION', 'PAUSED'] } },
          { updatedAt: { gte: startOfMonth } },
        ],
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        plan: { select: { id: true, name: true, code: true } },
        homeStore: { select: { id: true, name: true } },
        deliveries: {
          where: {
            serviceDate: {
              gte: startOfMonth,
              lte: endOfMonth,
            },
          },
          orderBy: { serviceDate: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const rows: GridRow[] = [];
    const dailyTotals: Record<number, { deliveredCount: number; scheduledCount: number; totalLiters: number; cashCollectedPaise: number }> = {};
    for (let day = 1; day <= daysInMonth; day++) {
      dailyTotals[day] = { deliveredCount: 0, scheduledCount: 0, totalLiters: 0, cashCollectedPaise: 0 };
    }

    for (const sub of subscriptions) {
      const address = (sub.addressSnapshot as any)?.line1 || (sub.addressSnapshot as any)?.street || 'Local Area';
      const planName = sub.plan.name || 'Milk Plan';
      const isBuffalo = planName.toLowerCase().includes('buffalo') || planName.toLowerCase().includes('bm');
      const baseQty = planName.toLowerCase().includes('0.5') || planName.toLowerCase().includes('500') ? '0.5L' : '1L';
      const defaultBaseMultiplier = baseQty === '0.5L' ? 0.5 : 1.0;

      const splitItems = (sub.priceSnapshot as any)?.splitItems;
      const cycleNumber = (sub.priceSnapshot as any)?.cycleNumber || 1;
      let dailyQuantityLabel = `${baseQty} ${isBuffalo ? 'BM' : 'CM'}`;
      if (splitItems) {
        dailyQuantityLabel = `AM: ${splitItems.amQuantity || '0.5L'} ${splitItems.amProductName || 'CM'} | PM: ${splitItems.pmQuantity || '1L'} ${splitItems.pmProductName || 'BM'}`;
      } else if (cycleNumber > 1) {
        dailyQuantityLabel = `${baseQty} ${isBuffalo ? 'BM' : 'CM'} (Cycle #${cycleNumber})`;
      }

      const daysMap: Record<number, GridCell | null> = {};
      let totalDeliveredDays = 0;
      let totalExtraLiters = 0;
      let calculatedDeliveredLiters = 0;

      for (const d of sub.deliveries) {
        const dDate = new Date(d.serviceDate);
        const dayNum = dDate.getUTCDate();

        // Calculate delivery base multiplier (accounting for split items)
        let deliveryBaseMultiplier = defaultBaseMultiplier;
        let cellBaseQty = baseQty;
        if (splitItems) {
          if (d.deliverySlot === 'AM') {
            cellBaseQty = splitItems.amQuantity || '0.5L';
            deliveryBaseMultiplier = cellBaseQty.includes('0.5') ? 0.5 : 1.0;
          } else {
            cellBaseQty = splitItems.pmQuantity || '1L';
            deliveryBaseMultiplier = cellBaseQty.includes('0.5') ? 0.5 : (cellBaseQty.includes('2') ? 2.0 : 1.0);
          }
        }

        // Parse extra milk if recorded in deferredReason
        let extraMilk: string | null = null;
        let extraLiters = 0;
        if (d.deferredReason && d.deferredReason.includes('[EXTRA:')) {
          const match = d.deferredReason.match(/\[EXTRA:\s*([^\|\]]+)/);
          if (match) {
            extraMilk = match[1].trim();
            if (extraMilk.includes('0.5')) extraLiters += 0.5;
            else if (extraMilk.includes('1.5')) extraLiters += 1.5;
            else if (extraMilk.includes('2')) extraLiters += 2.0;
            else extraLiters += 1.0;
          }
        }

        let paymentMode: 'CASH' | 'PHONE_PE' | 'DUE' | null = null;
        if (d.failureReason?.includes('[PHONE_PE]')) paymentMode = 'PHONE_PE';
        else if (d.cashCollectedPaise > 0 || d.failureReason?.includes('[CASH]')) paymentMode = 'CASH';
        else if (d.cashDuePaise > 0) paymentMode = 'DUE';

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
        };

        daysMap[dayNum] = cell;

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

      const totalLiters = calculatedDeliveredLiters;

      rows.push({
        subscriptionId: sub.id,
        customer: {
          id: sub.customer.id,
          name: sub.customer.name || 'Valued Customer',
          phone: sub.customer.phone || '—',
          address,
        },
        plan: {
          id: sub.plan.id,
          name: sub.plan.name,
          code: sub.plan.code,
          dailyQuantity: dailyQuantityLabel,
        },
        slot: splitItems ? 'AM+PM' : (sub.deliveryWindowStartMinute >= 900 ? 'PM' : 'AM'),
        days: daysMap,
        totalDeliveredDays,
        totalExtraLiters,
        totalLiters,
        totalCollectedPaise: sub.amountCollectedPaise || 0,
        totalDuePaise: sub.amountDuePaise || 0,
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
      const extraPaise = action.extraPaise || (
        extraQty.includes('0.5') ? 4000 : extraQty.includes('2') ? 16000 : 8000
      );
      const note = `[EVENING BUFFALO MILK: ${extraQty}|${extraPaise}] ${action.note || ''}`.trim();

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
            deliverySlot: 'PM',
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

      return { success: true, count: targetDeliveries.length, message: `Attached evening buffalo milk for ${targetDeliveries.length} days!` };
    }

    if (action.type === 'EXTRA_MILK') {
      const extraQty = action.extraQuantity?.trim() || '+1L';
      const count = Math.max(1, Math.min(30, action.consecutiveDays || 1));
      const extraPaise = action.extraPaise || action.amountPaise || (
        extraQty.includes('0.5') ? (extraQty.includes('CM') ? 3500 : 4000)
        : extraQty.includes('2') ? 16000
        : (extraQty.includes('CM') ? 7000 : 8000)
      );
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
        subscription: storeFilter,
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
      const baseQty = planName.toLowerCase().includes('0.5') || planName.toLowerCase().includes('500') ? 0.5 : 1.0;

      let extraLiters = 0;
      if (d.deferredReason?.includes('[EXTRA:')) {
        const match = d.deferredReason.match(/\[EXTRA:\s*([^\|\]]+)/);
        if (match) {
          if (match[1].includes('0.5')) extraLiters += 0.5;
          else if (match[1].includes('1.5')) extraLiters += 1.5;
          else if (match[1].includes('2')) extraLiters += 2.0;
          else extraLiters += 1.0;
        }
      }

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

    let extraLiters = 0;
    for (const d of sub.deliveries) {
      if (d.deferredReason?.includes('[EXTRA:')) {
        const match = d.deferredReason.match(/\[EXTRA:\s*([^\|\]]+)/);
        if (match) {
          if (match[1].includes('0.5')) extraLiters += 0.5;
          else if (match[1].includes('1.5')) extraLiters += 1.5;
          else if (match[1].includes('2')) extraLiters += 2.0;
          else extraLiters += 1.0;
        }
      }
    }

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
}
