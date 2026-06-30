import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Role, prisma } from '@aagam/database';
import { calculateDistance } from '@aagam/utils';
import { TrackingGateway } from '../tracking.gateway';
import { OrderService } from '../orders/order.service';
import { RiderLocationDto } from './dto/rider-location.dto';

const TRACKABLE_STATUSES: OrderStatus[] = [
  OrderStatus.RIDER_ASSIGNED,
  OrderStatus.OUT_FOR_DELIVERY,
];

const STALE_AFTER_SECONDS = 360;

@Injectable()
export class TrackingService {
  constructor(
    private readonly trackingGateway: TrackingGateway,
    private readonly orderService: OrderService,
  ) {}

  async getOrderTracking(orderId: string, user?: { id: string; role: Role }) {
    return this.orderService.getTracking(orderId, user);
  }

  async getMyOrderTracking(orderId: string, userId: string) {
    return this.orderService.getTracking(orderId, { id: userId, role: Role.CUSTOMER });
  }

  async getAdminLiveTracking() {
    const activeOrders = await prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.RIDER_ASSIGNED, OrderStatus.OUT_FOR_DELIVERY] },
        riderId: { not: null },
      },
      include: {
        store: { select: { id: true, name: true, latitude: true, longitude: true } },
        customer: { select: { id: true, name: true, phone: true } },
        rider: { include: { user: { select: { id: true, name: true, phone: true } } } },
        riderLocationPings: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return activeOrders.map((order) => ({
      orderId: order.id,
      status: order.status,
      store: order.store,
      customer: order.customer,
      rider: order.rider
        ? {
            id: order.rider.id,
            name: order.rider.user?.name,
            phone: order.rider.user?.phone,
            latitude: order.rider.latitude,
            longitude: order.rider.longitude,
            updatedAt: order.rider.updatedAt,
          }
        : null,
      latestLocation: order.riderLocationPings[0] || null,
      delivery: {
        latitude: order.deliveryLat,
        longitude: order.deliveryLng,
      },
    }));
  }

  async ingestRiderLocation(userId: string, dto: RiderLocationDto) {
    const riderProfile = await prisma.riderProfile.findUnique({ where: { userId } });
    if (!riderProfile) {
      throw new NotFoundException('Rider profile not found');
    }

    const order = await prisma.order.findUnique({
      where: { id: dto.orderId },
      include: {
        riderLocationPings: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.riderId !== riderProfile.id) {
      throw new ForbiddenException('You can only update location for assigned orders');
    }
    if (!TRACKABLE_STATUSES.includes(order.status as OrderStatus)) {
      throw new BadRequestException('Order is not currently live-trackable');
    }

    const latest = order.riderLocationPings[0];
    if (latest) {
      const distanceKm = this.haversineKm(latest.latitude, latest.longitude, dto.latitude, dto.longitude);
      const ageSeconds = Math.max(1, (Date.now() - latest.createdAt.getTime()) / 1000);
      const impliedSpeedKmh = (distanceKm / ageSeconds) * 3600;
      if (impliedSpeedKmh > 140) {
        throw new BadRequestException('Location jump is too large');
      }
    }

    const ping = await prisma.$transaction(async (tx) => {
      await tx.riderProfile.update({
        where: { id: riderProfile.id },
        data: {
          latitude: dto.latitude,
          longitude: dto.longitude,
        },
      });

      return tx.riderLocationPing.create({
        data: {
          riderProfileId: riderProfile.id,
          orderId: dto.orderId,
          latitude: dto.latitude,
          longitude: dto.longitude,
          accuracy: dto.accuracy,
          speed: dto.speed,
          heading: dto.heading,
          source: dto.source || 'MOBILE',
        },
      });
    });

    const tracking = await this.orderService.getTracking(dto.orderId);
    const payload = {
      orderId: dto.orderId,
      riderId: riderProfile.id,
      latitude: ping.latitude,
      longitude: ping.longitude,
      accuracy: ping.accuracy,
      speed: ping.speed,
      heading: ping.heading,
      createdAt: ping.createdAt,
      etaMinutes: tracking.tracking.etaMinutes,
      distanceKm: tracking.tracking.distanceKm,
      trackingState: tracking.tracking.trackingState,
      isStale: false,
      staleAfterSeconds: STALE_AFTER_SECONDS,
    };

    this.trackingGateway.emitRiderLocationUpdated(dto.orderId, payload);
    return payload;
  }

  async startTracking(orderId: string, actor: { id: string; role: Role }) {
    return this.orderService.updateStatus(orderId, OrderStatus.OUT_FOR_DELIVERY, actor);
  }

  async stopTracking(orderId: string, actor: { id: string; role: Role }) {
    const order = await this.orderService.updateStatus(orderId, OrderStatus.DELIVERED, actor);
    this.trackingGateway.emitTrackingStopped(orderId, {
      orderId,
      status: OrderStatus.DELIVERED,
      stoppedAt: new Date().toISOString(),
    });
    return order;
  }

  private haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    return calculateDistance(lat1, lon1, lat2, lon2);
  }
}
