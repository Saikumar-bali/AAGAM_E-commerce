import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Role, prisma } from '@aagam/database';
import { DeliveryJobStatus, DeliveryJobStatusType } from '@aagam/types';
import { calculateDistance } from '@aagam/utils';
import { OrderService } from '../orders/order.service';
import { TrackingGateway } from '../tracking.gateway';
import { RiderLocationDto } from './dto/rider-location.dto';

const TRACKABLE_JOB_STATUSES: DeliveryJobStatusType[] = [
  DeliveryJobStatus.RIDER_ASSIGNED,
  DeliveryJobStatus.RIDER_EN_ROUTE_TO_STORE,
  DeliveryJobStatus.RIDER_AT_STORE,
  DeliveryJobStatus.PICKUP_VERIFIED,
  DeliveryJobStatus.OUT_FOR_DELIVERY,
  DeliveryJobStatus.RIDER_AT_CUSTOMER,
  DeliveryJobStatus.DELIVERY_FAILED,
  DeliveryJobStatus.RETURNING_TO_STORE,
];

const TERMINAL_JOB_STATUSES: DeliveryJobStatusType[] = [
  DeliveryJobStatus.DELIVERED,
  DeliveryJobStatus.RETURNED_TO_STORE,
  DeliveryJobStatus.CANCELLED,
];

const STALE_AFTER_SECONDS = 360;
const MOBILE_SOURCE_PREFIX = 'MOBILE_PARTNERS|';
const MAX_CAPTURE_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 2 * 60 * 1000;

type TrackingDeliveryView = {
  id: string;
  orderId: string;
  status: DeliveryJobStatusType;
  currentRiderId: string | null;
  order: any;
  legacyAdapter?: boolean;
};

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
        riderId: { not: null },
        deliveryJob: { is: { status: { in: TRACKABLE_JOB_STATUSES as any } } },
      },
      include: {
        deliveryJob: { select: { id: true, status: true, updatedAt: true } },
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
      deliveryJobId: order.deliveryJob?.id,
      deliveryStatus: order.deliveryJob?.status,
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
    const { riderProfile, deliveryJob } = await this.assertOwnedDelivery(dto.orderId, userId, true);
    const capturedAt = this.parseCapturedAt(dto.capturedAt);
    const clientPingId = dto.clientPingId?.trim() || null;
    const sequence = dto.sequence || null;
    const source = clientPingId
      ? `${MOBILE_SOURCE_PREFIX}${sequence || 0}|${clientPingId}`
      : dto.source || 'MOBILE';

    const result = await prisma.$transaction(async (tx) => {
      if (clientPingId) {
        await tx.$queryRawUnsafe<Array<{ locked: number }>>(
          'SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext($1))',
          `${riderProfile.id}:${clientPingId}`,
        );

        const duplicate = await tx.riderLocationPing.findFirst({
          where: {
            riderProfileId: riderProfile.id,
            orderId: dto.orderId,
            source,
          },
        });
        if (duplicate) return { ping: duplicate, duplicate: true };
      }

      if (sequence) {
        const latestMobilePing = await tx.riderLocationPing.findFirst({
          where: {
            riderProfileId: riderProfile.id,
            orderId: dto.orderId,
            source: { startsWith: MOBILE_SOURCE_PREFIX },
          },
          orderBy: { createdAt: 'desc' },
        });
        const latestSequence = this.sequenceFromSource(latestMobilePing?.source);
        if (latestSequence !== null && sequence <= latestSequence) {
          throw new BadRequestException(
            `Location sequence ${sequence} is not newer than ${latestSequence}`,
          );
        }
      }

      const latest = await tx.riderLocationPing.findFirst({
        where: { riderProfileId: riderProfile.id, orderId: dto.orderId },
        orderBy: { createdAt: 'desc' },
      });
      if (latest) {
        const distanceKm = this.haversineKm(
          latest.latitude,
          latest.longitude,
          dto.latitude,
          dto.longitude,
        );
        const ageSeconds = Math.max(1, (capturedAt.getTime() - latest.createdAt.getTime()) / 1000);
        const impliedSpeedKmh = (distanceKm / ageSeconds) * 3600;
        if (impliedSpeedKmh > 140) {
          throw new BadRequestException('Location jump is too large');
        }
      }

      await tx.riderProfile.update({
        where: { id: riderProfile.id },
        data: {
          latitude: dto.latitude,
          longitude: dto.longitude,
          status: 'BUSY',
        },
      });

      const ping = await tx.riderLocationPing.create({
        data: {
          riderProfileId: riderProfile.id,
          orderId: dto.orderId,
          latitude: dto.latitude,
          longitude: dto.longitude,
          accuracy: dto.accuracy,
          speed: dto.speed,
          heading: dto.heading,
          source,
        },
      });
      return { ping, duplicate: false };
    }, { isolationLevel: 'Serializable' as any });

    const tracking = await this.orderService.getTracking(dto.orderId);
    const payload = {
      orderId: dto.orderId,
      deliveryJobId: deliveryJob.id,
      deliveryStatus: deliveryJob.status,
      legacyDeliveryAdapter: Boolean(deliveryJob.legacyAdapter),
      riderId: riderProfile.id,
      latitude: result.ping.latitude,
      longitude: result.ping.longitude,
      accuracy: result.ping.accuracy,
      speed: result.ping.speed,
      heading: result.ping.heading,
      createdAt: result.ping.createdAt,
      capturedAt: capturedAt.toISOString(),
      clientPingId,
      sequence,
      duplicate: result.duplicate,
      etaMinutes: tracking.tracking.etaMinutes,
      distanceKm: tracking.tracking.distanceKm,
      trackingState: tracking.tracking.trackingState,
      isStale: false,
      staleAfterSeconds: STALE_AFTER_SECONDS,
    };

    if (!result.duplicate) {
      this.trackingGateway.emitRiderLocationUpdated(dto.orderId, payload);
    }
    return payload;
  }

  async startTracking(orderId: string, actor: { id: string; role: Role }) {
    if (actor.role !== Role.RIDER) throw new ForbiddenException('Only riders can start tracking');
    const { riderProfile, deliveryJob } = await this.assertOwnedDelivery(orderId, actor.id, true);
    const latest = await prisma.riderLocationPing.findFirst({
      where: { riderProfileId: riderProfile.id, orderId },
      orderBy: { createdAt: 'desc' },
    });
    return {
      active: true,
      orderId,
      deliveryJobId: deliveryJob.id,
      deliveryStatus: deliveryJob.status,
      legacyDeliveryAdapter: Boolean(deliveryJob.legacyAdapter),
      riderProfileId: riderProfile.id,
      startedAt: new Date().toISOString(),
      lastPingAt: latest?.createdAt || null,
      staleAfterSeconds: STALE_AFTER_SECONDS,
      status: deliveryJob.order.status,
      outForDeliveryAt: deliveryJob.order.outForDeliveryAt,
      deliveredAt: deliveryJob.order.deliveredAt,
    };
  }

  async stopTracking(
    orderId: string,
    actor: { id: string; role: Role },
    reason = 'CLIENT_STOPPED',
  ) {
    if (actor.role !== Role.RIDER) throw new ForbiddenException('Only riders can stop tracking');
    const { riderProfile, deliveryJob } = await this.assertOwnedDelivery(orderId, actor.id, false);
    const payload = {
      active: false,
      orderId,
      deliveryJobId: deliveryJob.id,
      deliveryStatus: deliveryJob.status,
      legacyDeliveryAdapter: Boolean(deliveryJob.legacyAdapter),
      riderProfileId: riderProfile.id,
      reason,
      stoppedAt: new Date().toISOString(),
      status: deliveryJob.order.status,
      outForDeliveryAt: deliveryJob.order.outForDeliveryAt,
      deliveredAt: deliveryJob.order.deliveredAt,
    };
    this.trackingGateway.emitTrackingStopped(orderId, payload);
    return payload;
  }

  private async assertOwnedDelivery(orderId: string, userId: string, requireTrackable: boolean) {
    const riderProfile = await prisma.riderProfile.findUnique({ where: { userId } });
    if (!riderProfile) throw new NotFoundException('Rider profile not found');

    const deliveryJob = await this.deliveryView(orderId);
    if (deliveryJob.currentRiderId !== riderProfile.id) {
      throw new ForbiddenException(
        'You can only update location for assigned orders and track your active delivery',
      );
    }

    const status = deliveryJob.status as DeliveryJobStatusType;
    if (requireTrackable && !TRACKABLE_JOB_STATUSES.includes(status)) {
      if (TERMINAL_JOB_STATUSES.includes(status)) {
        throw new BadRequestException(
          `Order is not currently live-trackable: delivery tracking ended at ${status}`,
        );
      }
      throw new BadRequestException(
        `Order is not currently live-trackable: delivery is not trackable while ${status}`,
      );
    }
    return { riderProfile, deliveryJob };
  }

  private async deliveryView(orderId: string): Promise<TrackingDeliveryView> {
    const canonical = await prisma.deliveryJob.findUnique({
      where: { orderId },
      include: { order: true },
    });
    if (canonical) {
      return {
        id: canonical.id,
        orderId: canonical.orderId,
        status: canonical.status as DeliveryJobStatusType,
        currentRiderId: canonical.currentRiderId,
        order: canonical.order,
      };
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Delivery job not found');

    return {
      id: `legacy-order:${order.id}`,
      orderId: order.id,
      status: this.deliveryStatusFromLegacyOrder(order.status),
      currentRiderId: order.riderId,
      order,
      legacyAdapter: true,
    };
  }

  private deliveryStatusFromLegacyOrder(status: OrderStatus): DeliveryJobStatusType {
    if (status === OrderStatus.RIDER_ASSIGNED) return DeliveryJobStatus.RIDER_ASSIGNED;
    if (status === OrderStatus.OUT_FOR_DELIVERY) return DeliveryJobStatus.OUT_FOR_DELIVERY;
    if (status === OrderStatus.DELIVERED) return DeliveryJobStatus.DELIVERED;
    if (status === OrderStatus.CANCELLED) return DeliveryJobStatus.CANCELLED;
    return DeliveryJobStatus.WAITING_FOR_DISPATCH;
  }

  private parseCapturedAt(value?: string) {
    const now = Date.now();
    const capturedAt = value ? new Date(value) : new Date(now);
    if (!Number.isFinite(capturedAt.getTime())) {
      throw new BadRequestException('capturedAt is invalid');
    }
    if (capturedAt.getTime() > now + MAX_FUTURE_SKEW_MS) {
      throw new BadRequestException('capturedAt is too far in the future');
    }
    if (capturedAt.getTime() < now - MAX_CAPTURE_AGE_MS) {
      throw new BadRequestException('capturedAt is too old');
    }
    return capturedAt;
  }

  private sequenceFromSource(source?: string | null) {
    if (!source?.startsWith(MOBILE_SOURCE_PREFIX)) return null;
    const parsed = Number(source.split('|')[1]);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  private haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    return calculateDistance(lat1, lon1, lat2, lon2);
  }
}

export { STALE_AFTER_SECONDS, TERMINAL_JOB_STATUSES, TRACKABLE_JOB_STATUSES };
