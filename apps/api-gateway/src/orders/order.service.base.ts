/**
 * Shared order internals (state, history, tracking snapshot, delivery-job side effects).
 *
 * Split out of the former order.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CouponRedemptionStatus, OrderStatus, Role, prisma } from '@aagam/database';
import { calculateDistance } from '@aagam/utils';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { RefundsService } from '../payments/refunds.service';

export class OrderServiceBase {
  private _deps: { trackingGateway?: TrackingGateway; refundsService?: RefundsService } = {};

  useDeps(deps: { trackingGateway?: TrackingGateway; refundsService?: RefundsService }) {
    this._deps = deps;
  }

  protected get trackingGateway(): TrackingGateway {
    return this._deps.trackingGateway as TrackingGateway;
  }

  protected get refundsService(): RefundsService {
    return this._deps.refundsService as RefundsService;
  }

  protected async cancelAssociatedDeliveryJob(orderId: string, tx: any) {
    const deliveryJob = await tx.deliveryJob.findUnique({
      where: { orderId },
    });

    if (!deliveryJob || ['DELIVERED', 'RETURNED_TO_STORE'].includes(deliveryJob.status)) {
      return;
    }

    const respondedAt = new Date();

    if (deliveryJob.status !== 'CANCELLED' || deliveryJob.currentRiderId) {
      await tx.deliveryJob.update({
        where: { id: deliveryJob.id },
        data: {
          status: 'CANCELLED',
          currentRiderId: null,
        },
      });
    }

    await tx.dispatchAssignment.updateMany({
      where: {
        deliveryJobId: deliveryJob.id,
        status: { in: ['CREATED', 'OFFERED', 'ACCEPTED'] },
      },
      data: { status: 'CANCELLED', respondedAt },
    });
  }

  protected releaseCouponRedemption(orderId: string, reason: string, tx: any) {
    return tx.couponRedemption.updateMany({
      where: {
        orderId,
        status: {
          in: [CouponRedemptionStatus.RESERVED, CouponRedemptionStatus.REDEEMED],
        },
      },
      data: {
        status: CouponRedemptionStatus.RELEASED,
        releasedAt: new Date(),
        releaseReason: reason,
      },
    });
  }

  protected async completeAssociatedDeliveryJob(orderId: string, tx: any) {
    const deliveryJob = await tx.deliveryJob.findUnique({
      where: { orderId },
    });

    if (!deliveryJob || deliveryJob.status === 'DELIVERED') {
      return;
    }

    const terminalStatuses = ['CANCELLED', 'RETURNED_TO_STORE'];
    if (terminalStatuses.includes(deliveryJob.status)) {
      return;
    }

    await tx.deliveryJob.update({
      where: { id: deliveryJob.id },
      data: { status: 'DELIVERED', version: { increment: 1 } },
    });

    await tx.dispatchAssignment.updateMany({
      where: {
        deliveryJobId: deliveryJob.id,
        status: { in: ['CREATED', 'OFFERED', 'ACCEPTED'] },
      },
      data: { status: 'CANCELLED', respondedAt: new Date() },
    });
  }

  protected statusNote(nextStatus: OrderStatus, actorRole?: Role) {
    if (actorRole === Role.RIDER) {
      if (nextStatus === OrderStatus.PICKING) return 'Rider reached store and started pickup.';
      if (nextStatus === OrderStatus.OUT_FOR_DELIVERY) return 'Rider picked the order and is on the way.';
      if (nextStatus === OrderStatus.DELIVERED) return 'Rider marked the order as delivered.';
    }
    if (actorRole === Role.ADMIN) {
      if (nextStatus === OrderStatus.CANCELLED) return 'Order cancelled by admin.';
      return undefined;
    }
    if (nextStatus === OrderStatus.CONFIRMED) return 'Store confirmed your order.';
    if (nextStatus === OrderStatus.PICKING) return 'Store is preparing your items.';
    if (nextStatus === OrderStatus.CANCELLED) return actorRole === Role.CUSTOMER ? 'Order cancelled by customer.' : 'Order cancelled.';
    if (nextStatus === OrderStatus.STORE_DELIVERING) return 'Store is delivering your order.';
    if (nextStatus === OrderStatus.STORE_DELIVERED) return 'Store delivered your order.';
    return undefined;
  }

  protected timestampFieldForStatus(status: OrderStatus) {
    const map: Partial<Record<OrderStatus, string>> = {
      CONFIRMED: 'confirmedAt',
      PICKING: 'pickingAt',
      PACKED: 'packedAt',
      STORE_DELIVERING: 'outForDeliveryAt',
      STORE_DELIVERED: 'deliveredAt',
      RIDER_ASSIGNED: 'riderAssignedAt',
      OUT_FOR_DELIVERY: 'outForDeliveryAt',
      DELIVERED: 'deliveredAt',
      CANCELLED: 'cancelledAt',
      PAYMENT_FAILED: 'paymentFailedAt',
    };
    return map[status];
  }

  protected computeTripSummary(pings: Array<{ latitude: number; longitude: number; createdAt: Date }>, startedAt?: Date | null, endedAt?: Date | null) {
    if (!Array.isArray(pings) || pings.length < 2) {
      return {
        distanceKm: 0,
        durationMinutes: startedAt && endedAt ? Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000)) : null,
        points: Array.isArray(pings) ? pings.length : 0,
      };
    }
    let distanceKm = 0;
    for (let i = 1; i < pings.length; i += 1) {
      distanceKm += this.haversineKm(
        pings[i - 1].latitude,
        pings[i - 1].longitude,
        pings[i].latitude,
        pings[i].longitude,
      );
    }
    const effectiveStart = startedAt || pings[0].createdAt;
    const effectiveEnd = endedAt || pings[pings.length - 1].createdAt;
    const durationMinutes = Math.max(1, Math.round((effectiveEnd.getTime() - effectiveStart.getTime()) / 60000));
    return {
      distanceKm: Number(distanceKm.toFixed(2)),
      durationMinutes,
      points: pings.length,
    };
  }

  protected haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    return calculateDistance(lat1, lon1, lat2, lon2);
  }

  protected computeEta(order: any, latestLocation: any) {
    const pingStaleThresholdMs = 6 * 60 * 1000;
    const destinationLat = order.deliveryLat;
    const destinationLng = order.deliveryLng;
    const sourceLat = latestLocation?.latitude ?? order.rider?.latitude;
    const sourceLng = latestLocation?.longitude ?? order.rider?.longitude;
    if (
      typeof destinationLat !== 'number' ||
      typeof destinationLng !== 'number' ||
      typeof sourceLat !== 'number' ||
      typeof sourceLng !== 'number'
    ) {
      return { etaMinutes: null, distanceKm: null, speedKph: null, stale: true, confidence: 'LOW' as const };
    }

    const lastPingAt = latestLocation?.createdAt ? new Date(latestLocation.createdAt) : null;
    const stale = lastPingAt ? Date.now() - lastPingAt.getTime() > pingStaleThresholdMs : true;
    if (stale) {
      return { etaMinutes: null, distanceKm: null, speedKph: null, stale: true, confidence: 'LOW' as const };
    }

    const distanceKm = this.haversineKm(sourceLat, sourceLng, destinationLat, destinationLng);
    const speedFromPingMs = typeof latestLocation?.speed === 'number' && latestLocation.speed > 0 ? latestLocation.speed : null;
    const speedKph = speedFromPingMs ? Math.max(8, Math.min(48, speedFromPingMs * 3.6)) : 18;
    const etaMinutes = Math.max(2, Math.ceil((distanceKm / speedKph) * 60));
    const confidence = speedFromPingMs ? ('HIGH' as const) : ('MEDIUM' as const);
    return {
      etaMinutes,
      distanceKm: Number(distanceKm.toFixed(2)),
      speedKph: Number(speedKph.toFixed(1)),
      stale: false,
      confidence,
    };
  }

  protected computeTrackingState(
    orderStatus: string,
    riderId: string | null,
    latestLocation: any,
    isStale: boolean,
  ): string {
    if (orderStatus === 'DELIVERED' || orderStatus === 'STORE_DELIVERED') return 'DELIVERED';
    if (orderStatus === 'CANCELLED') return 'CANCELLED';
    if (orderStatus === 'STORE_DELIVERING') return 'STORE_DELIVERING';
    if (orderStatus === 'RIDER_ASSIGNED' || orderStatus === 'OUT_FOR_DELIVERY') {
      if (!riderId) return 'NOT_ASSIGNED';
      if (!latestLocation) return 'ASSIGNED_NO_LOCATION';
      if (isStale) return 'STALE';
      return 'LIVE';
    }
    if (!riderId) return 'NOT_ASSIGNED';
    return 'STOPPED';
  }

  async recordStatusHistory(data: {
    orderId: string;
    fromStatus?: OrderStatus | null;
    toStatus: OrderStatus;
    actor?: { id?: string; role?: Role } | null;
    note?: string;
    metadata?: any;
  }, tx: any = prisma) {
    return tx.orderStatusHistory.create({
      data: {
        orderId: data.orderId,
        fromStatus: data.fromStatus || null,
        toStatus: data.toStatus,
        actorUserId: data.actor?.id || null,
        actorRole: data.actor?.role || null,
        note: data.note || null,
        metadata: data.metadata || undefined,
      },
    });
  }

  async getTracking(orderId: string, user?: { id: string; role: Role }) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
        store: { select: { id: true, name: true, address: true, latitude: true, longitude: true, ownerId: true, owner: { select: { phone: true, name: true } } } },
        rider: { include: { user: { select: { id: true, name: true, phone: true } } } },
        payment: true,
        items: { include: { product: { select: { id: true, name: true, image: true } } } },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        riderLocationPings: { orderBy: { createdAt: 'asc' }, take: 400 },
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (user?.role === Role.CUSTOMER && order.customerId !== user.id) {
      throw new ForbiddenException('Not allowed');
    }
    if (user?.role === Role.STORE_OWNER && order.store.ownerId !== user.id) {
      throw new ForbiddenException('Not allowed');
    }
    if (user?.role === Role.RIDER) {
      const riderProfile = await prisma.riderProfile.findUnique({ where: { userId: user.id } });
      if (!riderProfile || order.riderId !== riderProfile.id) {
        throw new ForbiddenException('Not allowed');
      }
    }

    const latestLocation = order.riderLocationPings[order.riderLocationPings.length - 1] || null;
    const eta = this.computeEta(order, latestLocation);
    const tripSummary = this.computeTripSummary(order.riderLocationPings, order.outForDeliveryAt, order.deliveredAt);
    const routePath = order.riderLocationPings.map((p) => ({
      latitude: p.latitude,
      longitude: p.longitude,
      createdAt: p.createdAt,
    }));

    return {
      order: {
        id: order.id,
        status: order.status,
        storeDelivery: order.storeDelivery,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        confirmedAt: order.confirmedAt,
        pickingAt: order.pickingAt,
        packedAt: order.packedAt,
        riderAssignedAt: order.riderAssignedAt,
        outForDeliveryAt: order.outForDeliveryAt,
        deliveredAt: order.deliveredAt,
        cancelledAt: order.cancelledAt,
        paymentFailedAt: order.paymentFailedAt,
        totalAmount: order.totalAmount,
        grandTotal: order.grandTotal,
        addressSnapshot: order.addressSnapshot,
        itemsSnapshot: order.itemsSnapshot,
        pricingSnapshot: order.pricingSnapshot,
      },
      timeline: order.statusHistory,
      payment: order.payment,
      store: {
        id: order.store.id,
        name: order.store.name,
        address: order.store.address,
        phone: (order.store as any)?.owner?.phone || null,
        latitude: order.store.latitude,
        longitude: order.store.longitude,
      },
      customer: order.customer,
      rider: order.rider
        ? {
            id: order.rider.id,
            status: order.rider.status,
            name: order.rider.user?.name,
            phone: order.rider.user?.phone,
            latitude: order.rider.latitude,
            longitude: order.rider.longitude,
            updatedAt: order.rider.updatedAt,
          }
        : null,
      items: order.items,
      tracking: {
        isLive: ['RIDER_ASSIGNED', 'OUT_FOR_DELIVERY', 'STORE_DELIVERING'].includes(order.status),
        trackingState: this.computeTrackingState(order.status, order.riderId, latestLocation, eta.stale),
        isStale: eta.stale,
        staleAfterSeconds: 360,
        latestLocation,
        lastPingAt: latestLocation?.createdAt || null,
        etaMinutes: eta.etaMinutes,
        distanceKm: eta.distanceKm,
        speedKph: eta.speedKph,
        etaStale: eta.stale,
        etaConfidence: eta.confidence,
        tripSummary,
        routePath,
      },
    };
  }

  async emitTrackingUpdate(orderId: string, payload?: any) {
    const tracking = await this.getTracking(orderId);
    const eventPayload = payload || tracking;
    this.trackingGateway.emitOrderStatusUpdated(orderId, eventPayload);
    this.trackingGateway.emitOrderTimelineUpdated(orderId, tracking);
    return tracking;
  }
}
