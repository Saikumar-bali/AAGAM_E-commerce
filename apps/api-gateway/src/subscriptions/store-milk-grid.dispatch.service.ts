/**
 * Rider dispatch, assignment and dispatch summary.
 *
 * Split out of the former store-milk-grid.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { NotFoundException, ForbiddenException, BadRequestException, Injectable } from "@nestjs/common";
import { prisma, Role, SubscriptionDeliveryStatus, PaymentMethod, PaymentStatus } from "@aagam/database";
import { sumAddOnLiters } from "./delivery-add-on";
import { StoreMilkGridBase } from "./store-milk-grid.base";

@Injectable()
export class StoreMilkGridDispatchService extends StoreMilkGridBase {
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

        // Sequence numbers must continue past the highest existing stop, not the
        // stop count: removals and reordering leave gaps that a count would reuse,
        // colliding with @@unique([deliveryRunId, sequenceNumber]).
        const highestSeq = await tx.deliveryRunStop.aggregate({
          where: { deliveryRunId: run.id },
          _max: { sequenceNumber: true },
        });
        let nextSeq = (highestSeq._max.sequenceNumber ?? 0) + 1;

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
