import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CouponRedemptionStatus, OrderStatus, PaymentStatus, Role, prisma } from '@aagam/database';
import { calculateDistance } from '@aagam/utils';
import { TrackingGateway } from '../tracking.gateway';
import { RefundsService } from '../payments/refunds.service';

const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  PAYMENT_PENDING: ['CONFIRMED', 'PAYMENT_FAILED', 'CANCELLED'],
  PAYMENT_FAILED: ['PAYMENT_PENDING', 'CANCELLED'],
  CONFIRMED: ['PICKING', 'PACKED', 'RIDER_ASSIGNED', 'CANCELLED'],
  PICKING: ['PACKED', 'RIDER_ASSIGNED', 'CANCELLED'],
  PACKED: ['RIDER_ASSIGNED', 'CANCELLED'],
  RIDER_ASSIGNED: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

const RIDER_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  RIDER_ASSIGNED: [OrderStatus.OUT_FOR_DELIVERY],
  OUT_FOR_DELIVERY: [OrderStatus.DELIVERED],
};

const STORE_OWNER_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  PAYMENT_PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.PICKING, OrderStatus.PACKED, OrderStatus.CANCELLED],
  PICKING: [OrderStatus.PACKED, OrderStatus.CANCELLED],
  PACKED: [OrderStatus.CANCELLED],
};

const STORE_OWNER_FORBIDDEN: OrderStatus[] = [
  OrderStatus.DELIVERED,
  OrderStatus.RIDER_ASSIGNED,
  OrderStatus.OUT_FOR_DELIVERY,
];

@Injectable()
export class OrderService {
  constructor(
    private readonly trackingGateway: TrackingGateway,
    private readonly refundsService: RefundsService,
  ) {}

  private releaseCouponRedemption(orderId: string, reason: string, tx: any) {
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

  private statusNote(nextStatus: OrderStatus, actorRole?: Role) {
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
    return undefined;
  }

  private haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    return calculateDistance(lat1, lon1, lat2, lon2);
  }

  private timestampFieldForStatus(status: OrderStatus) {
    const map: Partial<Record<OrderStatus, string>> = {
      CONFIRMED: 'confirmedAt',
      PICKING: 'pickingAt',
      PACKED: 'packedAt',
      RIDER_ASSIGNED: 'riderAssignedAt',
      OUT_FOR_DELIVERY: 'outForDeliveryAt',
      DELIVERED: 'deliveredAt',
      CANCELLED: 'cancelledAt',
      PAYMENT_FAILED: 'paymentFailedAt',
    };
    return map[status];
  }

  private async emitTrackingUpdate(orderId: string, payload?: any) {
    const tracking = await this.getTracking(orderId);
    const eventPayload = payload || tracking;
    this.trackingGateway.emitOrderStatusUpdated(orderId, eventPayload);
    this.trackingGateway.emitOrderTimelineUpdated(orderId, tracking);
    return tracking;
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
        store: { select: { id: true, name: true, address: true, latitude: true, longitude: true, ownerId: true } },
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
        isLive: ['RIDER_ASSIGNED', 'OUT_FOR_DELIVERY'].includes(order.status),
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

  private computeEta(order: any, latestLocation: any) {
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

  private computeTripSummary(pings: Array<{ latitude: number; longitude: number; createdAt: Date }>, startedAt?: Date | null, endedAt?: Date | null) {
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

  private computeTrackingState(
    orderStatus: string,
    riderId: string | null,
    latestLocation: any,
    isStale: boolean,
  ): string {
    if (orderStatus === 'DELIVERED') return 'DELIVERED';
    if (orderStatus === 'CANCELLED') return 'CANCELLED';
    if (orderStatus === 'RIDER_ASSIGNED' || orderStatus === 'OUT_FOR_DELIVERY') {
      if (!riderId) return 'NOT_ASSIGNED';
      if (!latestLocation) return 'ASSIGNED_NO_LOCATION';
      if (isStale) return 'STALE';
      return 'LIVE';
    }
    if (!riderId) return 'NOT_ASSIGNED';
    return 'STOPPED';
  }

  async findAll() {
    return prisma.order.findMany({
      include: {
        customer: {
          select: { name: true, email: true, phone: true }
        },
        store: {
          select: { name: true, address: true, latitude: true, longitude: true }
        },
        items: {
          include: {
            product: {
              select: { name: true }
            }
          }
        },
        rider: {
          include: {
            user: {
              select: { name: true }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  async findOne(id: string, actor?: { id: string; role: Role }) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        store: true,
        items: {
          include: { product: true }
        },
        rider: {
          include: { user: true }
        }
      }
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (!actor) return order;

    if (actor.role === Role.CUSTOMER && order.customerId !== actor.id) {
      throw new ForbiddenException('Not allowed');
    }
    if (actor.role === Role.RIDER) {
      const riderProfile = await prisma.riderProfile.findUnique({ where: { userId: actor.id } });
      if (!riderProfile || order.riderId !== riderProfile.id) {
        throw new ForbiddenException('Not allowed');
      }
    }
    if (actor.role === Role.STORE_OWNER) {
      if (order.store.ownerId !== actor.id) {
        throw new ForbiddenException('Not allowed');
      }
    }
    return order;
  }

  async findMyOrder(userId: string, id: string) {
    const order = await prisma.order.findFirst({
      where: { id, customerId: userId },
      include: {
        store: {
          select: { id: true, name: true, address: true, latitude: true, longitude: true },
        },
        payment: true,
        rider: {
          include: {
            user: {
              select: { name: true, phone: true },
            },
          },
        },
        items: {
          include: {
            product: {
              select: { id: true, name: true, image: true },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async findStoreOrders(ownerId: string) {
    const stores = await prisma.store.findMany({
      where: { ownerId },
      select: { id: true },
    });
    const storeIds = stores.map((s) => s.id);
    if (storeIds.length === 0) return [];

    return prisma.order.findMany({
      where: { storeId: { in: storeIds } },
      include: {
        customer: { select: { name: true, email: true, phone: true } },
        payment: true,
        items: {
          include: {
            product: { select: { name: true, image: true } },
          },
        },
        rider: {
          include: {
            user: { select: { name: true } },
          },
        },
        statusHistory: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(
    id: string,
    nextStatus: OrderStatus,
    actor: { id: string; role: Role },
    riderId?: string,
  ) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        store: {
          select: { ownerId: true },
        },
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === nextStatus) {
      return order;
    }

    const currentStatus = order.status as OrderStatus;

    // Terminal state check
    const terminalStatuses: OrderStatus[] = [OrderStatus.DELIVERED, OrderStatus.CANCELLED];
    if (terminalStatuses.includes(currentStatus)) {
      throw new BadRequestException(`Order is already ${currentStatus} and cannot be changed`);
    }

    // Generic transition validation
    const allowedNextStatuses = ORDER_TRANSITIONS[currentStatus] || [];
    if (!allowedNextStatuses.includes(nextStatus)) {
      throw new BadRequestException(`Cannot transition order from ${order.status} to ${nextStatus}`);
    }

    // Role-specific validation
    if (actor.role === Role.RIDER) {
      const riderProfile = await prisma.riderProfile.findUnique({ where: { userId: actor.id } });
      if (!riderProfile || order.riderId !== riderProfile.id) {
        throw new ForbiddenException('You can only update your assigned orders');
      }
      const riderAllowedNext = RIDER_TRANSITIONS[currentStatus] || [];
      if (!riderAllowedNext.includes(nextStatus)) {
        throw new ForbiddenException(`Rider transition not allowed: ${currentStatus} -> ${nextStatus}`);
      }
    }

    if (actor.role === Role.STORE_OWNER) {
      if (order.store?.ownerId !== actor.id) {
        throw new ForbiddenException('Not allowed to update orders for this store');
      }
      if (STORE_OWNER_FORBIDDEN.includes(nextStatus)) {
        throw new ForbiddenException(`Store owner cannot set status to ${nextStatus}`);
      }
      const ownerAllowedNext = STORE_OWNER_TRANSITIONS[currentStatus] || [];
      if (!ownerAllowedNext.includes(nextStatus)) {
        throw new ForbiddenException(`Store transition not allowed: ${currentStatus} -> ${nextStatus}`);
      }
    }

    // Admin can do all transitions (no additional restrictions)

    const data: any = { status: nextStatus };
    const timestampField = this.timestampFieldForStatus(nextStatus);
    if (timestampField) {
      data[timestampField] = new Date();
    }
    if (riderId) {
      data.riderId = riderId;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { id },
        data,
      });

      // Build metadata for delivery proof
      const historyMetadata: any = {};
      if (nextStatus === OrderStatus.DELIVERED) {
        historyMetadata.deliveredAt = new Date().toISOString();
        historyMetadata.actorRole = actor.role;
        if (actor.role === Role.RIDER) {
          const riderProfile = await prisma.riderProfile.findUnique({ where: { userId: actor.id } });
          if (riderProfile) {
            historyMetadata.riderProfileId = riderProfile.id;
          }
        }
        historyMetadata.deliveryProof = {
          method: 'rider_confirmed',
          timestamp: new Date().toISOString(),
        };
      }

      await this.recordStatusHistory({
        orderId: id,
        fromStatus: order.status as OrderStatus,
        toStatus: nextStatus,
        actor,
        note: this.statusNote(nextStatus, actor.role),
        metadata: Object.keys(historyMetadata).length > 0 ? historyMetadata : undefined,
      }, tx);

      if (nextStatus === OrderStatus.CANCELLED) {
        await this.releaseCouponRedemption(id, 'ORDER_CANCELLED', tx);
      }

      if (nextStatus === OrderStatus.DELIVERED) {
        const orderItems = await tx.orderItem.findMany({ where: { orderId: id } });
        for (const item of orderItems) {
          const existing = await tx.inventory.findUnique({
            where: { storeId_productId: { storeId: order.storeId, productId: item.productId } },
          });
          const previousQuantity = existing?.quantity ?? 0;

          await tx.inventoryLedger.create({
            data: {
              storeId: order.storeId,
              productId: item.productId,
              orderId: id,
              reason: 'ORDER_DELIVERED_FINALIZE',
              quantityDelta: 0,
              previousQuantity,
              newQuantity: previousQuantity,
              actorUserId: actor.id,
              note: `Order ${id} delivered: ${item.quantity} units finalized`,
            },
          });
        }
      }

      return updatedOrder;
    });

    if (updated.riderId && nextStatus === OrderStatus.DELIVERED) {
      await prisma.riderProfile.update({
        where: { id: updated.riderId },
        data: { status: 'ONLINE' },
      }).catch(() => null);
    }

    await this.emitTrackingUpdate(id);
    return updated;
  }

  async assignRider(orderId: string, userId: string) {
    // Validate user exists and is a rider
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'RIDER') throw new BadRequestException('User is not a rider');

    // Validate rider profile exists and is not OFFLINE
    const riderProfile = await prisma.riderProfile.findUnique({ where: { userId } });
    if (!riderProfile) throw new NotFoundException('Rider profile not found');
    if (riderProfile.status === 'OFFLINE') throw new BadRequestException('Rider is offline and cannot be assigned');

    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { id: true, status: true, riderId: true },
      });
      if (!order) {
        throw new NotFoundException('Order not found');
      }

      // Cannot assign to delivered or cancelled orders
      const termStatuses: OrderStatus[] = [OrderStatus.DELIVERED, OrderStatus.CANCELLED];
      if (termStatuses.includes(order.status as OrderStatus)) {
        throw new BadRequestException(`Cannot assign rider to ${order.status} order`);
      }

      const assignableStatuses: OrderStatus[] = [OrderStatus.CONFIRMED, OrderStatus.PICKING, OrderStatus.PACKED];
      if (!assignableStatuses.includes(order.status as OrderStatus)) {
        throw new BadRequestException('Only confirmed, picking, or packed orders can be assigned to riders');
      }

      if (order.riderId) {
        throw new ConflictException('Order already assigned to a rider');
      }

      const activeOrderForRider = await tx.order.findFirst({
        where: {
          riderId: riderProfile.id,
          status: { in: [OrderStatus.RIDER_ASSIGNED, OrderStatus.OUT_FOR_DELIVERY] },
        },
        select: { id: true, status: true },
      });
      if (activeOrderForRider) {
        throw new ConflictException(`Complete active order ${activeOrderForRider.id} before accepting a new one`);
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.RIDER_ASSIGNED,
          riderId: riderProfile.id,
          riderAssignedAt: new Date(),
        },
      });

      await this.recordStatusHistory({
        orderId,
        fromStatus: order.status as OrderStatus,
        toStatus: OrderStatus.RIDER_ASSIGNED,
        actor: { id: userId, role: Role.RIDER },
        note: 'Rider accepted order',
        metadata: { riderProfileId: riderProfile.id },
      }, tx);

      await tx.riderProfile.update({
        where: { id: riderProfile.id },
        data: { status: 'BUSY' },
      });

      this.trackingGateway.emitRiderAssigned(orderId, {
        orderId,
        riderId: riderProfile.id,
        status: OrderStatus.RIDER_ASSIGNED,
      });
      return updated;
    });
  }

  async reassignRider(orderId: string, newUserId: string, actor: { id: string; role: Role }) {
    if (actor.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admin can reassign rider');
    }

    const newUser = await prisma.user.findUnique({ where: { id: newUserId } });
    if (!newUser) throw new NotFoundException('New rider user not found');
    if (newUser.role !== 'RIDER') throw new BadRequestException('User is not a rider');

    const newRiderProfile = await prisma.riderProfile.findUnique({ where: { userId: newUserId } });
    if (!newRiderProfile) throw new NotFoundException('New rider profile not found');
    if (newRiderProfile.status === 'OFFLINE') throw new BadRequestException('New rider is offline');

    // Check new rider does not already have an active order (exclude current order)
    const activeOrderForNewRider = await prisma.order.findFirst({
      where: {
        riderId: newRiderProfile.id,
        id: { not: orderId },
        status: { in: [OrderStatus.RIDER_ASSIGNED, OrderStatus.OUT_FOR_DELIVERY] },
      },
      select: { id: true, status: true },
    });
    if (activeOrderForNewRider) {
      throw new ConflictException(
        `New rider has active order ${activeOrderForNewRider.id} (${activeOrderForNewRider.status}). Complete it before reassigning.`,
      );
    }

    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { id: true, status: true, riderId: true },
      });
      if (!order) throw new NotFoundException('Order not found');

      const reassignTermStatuses: OrderStatus[] = [OrderStatus.DELIVERED, OrderStatus.CANCELLED];
      if (reassignTermStatuses.includes(order.status as OrderStatus)) {
        throw new BadRequestException(`Cannot reassign rider on ${order.status} order`);
      }

      const oldRiderProfileId = order.riderId;
      const wasAlreadyAssigned = order.status === OrderStatus.RIDER_ASSIGNED;

      // Set status to RIDER_ASSIGNED if not already, always update riderAssignedAt
      const updateData: any = {
        riderId: newRiderProfile.id,
        riderAssignedAt: new Date(),
      };
      if (!wasAlreadyAssigned) {
        updateData.status = OrderStatus.RIDER_ASSIGNED;
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: updateData,
      });

      await this.recordStatusHistory({
        orderId,
        fromStatus: order.status as OrderStatus,
        toStatus: OrderStatus.RIDER_ASSIGNED,
        actor,
        note: `Rider reassigned from ${oldRiderProfileId || 'none'} to ${newRiderProfile.id}`,
        metadata: {
          oldRiderProfileId,
          newRiderProfileId: newRiderProfile.id,
          wasAlreadyAssigned,
        },
      }, tx);

      // Make old rider online if they had a profile
      if (oldRiderProfileId) {
        await tx.riderProfile.update({
          where: { id: oldRiderProfileId },
          data: { status: 'ONLINE' },
        }).catch(() => null);
      }

      await tx.riderProfile.update({
        where: { id: newRiderProfile.id },
        data: { status: 'BUSY' },
      });

      return updated;
    });
  }

  async findMyOrders(userId: string) {
    return prisma.order.findMany({
      where: { customerId: userId },
      include: {
        store: {
          select: { name: true }
        },
        payment: true,
        items: {
          include: {
            product: {
              select: { name: true, image: true }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  async findByRiderId(riderId: string) {
    const orders = await prisma.order.findMany({
      where: { riderId },
      include: {
        customer: {
          select: { name: true, phone: true }
        },
        store: {
          select: { name: true, address: true, latitude: true, longitude: true }
        },
        payment: true,
        items: {
          include: {
            product: {
              select: { name: true, image: true }
            }
          }
        },
        riderLocationPings: {
          select: { latitude: true, longitude: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
          take: 400,
        },
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    return orders.map((order) => {
      const tripSummary = this.computeTripSummary(order.riderLocationPings, order.outForDeliveryAt, order.deliveredAt);
      return {
        ...order,
        trackingSummary: tripSummary,
      };
    });
  }

  async cancelMyOrder(userId: string, orderId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, customerId: userId },
      include: { items: true, payment: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    const cancellableStatuses: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.PAYMENT_PENDING, OrderStatus.CONFIRMED];
    if (!cancellableStatuses.includes(order.status as OrderStatus)) {
      throw new BadRequestException('Order can no longer be cancelled');
    }

    return prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        const existing = await tx.inventory.findUnique({
          where: { storeId_productId: { storeId: order.storeId, productId: item.productId } },
        });
        const previousQuantity = existing?.quantity ?? 0;

        await tx.inventory.updateMany({
          where: { storeId: order.storeId, productId: item.productId },
          data: { quantity: { increment: item.quantity } },
        });

        await tx.inventoryLedger.create({
          data: {
            storeId: order.storeId,
            productId: item.productId,
            orderId: order.id,
            reason: 'ORDER_CANCEL_RESTORE',
            quantityDelta: item.quantity,
            previousQuantity,
            newQuantity: previousQuantity + item.quantity,
            actorUserId: userId,
            note: `Cancelled order ${order.id}: restored ${item.quantity} units`,
          },
        });
      }

      // Handle payment/refund for cancellation
      if (order.payment) {
        if (order.payment.status === PaymentStatus.CAPTURED) {
          await this.refundsService.createRefundForPayment({
            orderId: order.id,
            paymentId: order.payment.id,
            amountPaise: order.grandTotalPaise,
            reason: 'Order cancelled after payment captured',
            requestedByUserId: userId,
          }, tx);
        } else if (order.payment.status === PaymentStatus.PENDING_COD) {
          // COD cancellation: no refund needed
        }
        // FAILED payment: no refund needed
      }

      const updated = await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
      });

      await this.recordStatusHistory(
        {
          orderId: order.id,
          fromStatus: order.status as OrderStatus,
          toStatus: OrderStatus.CANCELLED,
          actor: { id: userId, role: Role.CUSTOMER },
          note: 'Customer cancelled order',
        },
        tx,
      );

      await this.releaseCouponRedemption(order.id, 'CUSTOMER_CANCELLED', tx);

      return updated;
    });
  }

  async forceCancel(orderId: string, actor: { id: string; role: Role }, reason?: string) {
    if (actor.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admin can force cancel orders');
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, payment: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    const forceCancelTermStatuses: OrderStatus[] = [OrderStatus.DELIVERED, OrderStatus.CANCELLED];
    if (forceCancelTermStatuses.includes(order.status as OrderStatus)) {
      throw new BadRequestException(`Order is already ${order.status}`);
    }

    return prisma.$transaction(async (tx) => {
      // Restore inventory if not already restored
      if (order.status !== 'PAYMENT_FAILED') {
        for (const item of order.items) {
          const existing = await tx.inventory.findUnique({
            where: { storeId_productId: { storeId: order.storeId, productId: item.productId } },
          });
          const previousQuantity = existing?.quantity ?? 0;

          await tx.inventory.updateMany({
            where: { storeId: order.storeId, productId: item.productId },
            data: { quantity: { increment: item.quantity } },
          });

          await tx.inventoryLedger.create({
            data: {
              storeId: order.storeId,
              productId: item.productId,
              orderId: order.id,
              reason: 'ORDER_CANCEL_RESTORE',
              quantityDelta: item.quantity,
              previousQuantity,
              newQuantity: previousQuantity + item.quantity,
              actorUserId: actor.id,
              note: `Admin force cancelled order ${order.id}: restored ${item.quantity} units`,
            },
          });
        }
      }

      if (order.payment) {
        if (order.payment.status === PaymentStatus.CAPTURED) {
          await this.refundsService.createRefundForPayment({
            orderId: order.id,
            paymentId: order.payment.id,
            amountPaise: order.grandTotalPaise,
            reason: reason || 'Admin force cancelled order',
            requestedByUserId: actor.id,
          }, tx);
        }
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
      });

      await this.recordStatusHistory({
        orderId,
        fromStatus: order.status as OrderStatus,
        toStatus: OrderStatus.CANCELLED,
        actor,
        note: reason || 'Force cancelled by admin',
        metadata: { forceCancel: true, reason: reason || null },
      }, tx);

      await this.releaseCouponRedemption(orderId, reason || 'ADMIN_CANCELLED', tx);

      // Set rider back to online if assigned
      if (updated.riderId) {
        await tx.riderProfile.update({
          where: { id: updated.riderId },
          data: { status: 'ONLINE' },
        }).catch(() => null);
      }

      return updated;
    });
  }

  async findRecentForRiders(since: Date) {
    return prisma.order.findMany({
      where: {
        createdAt: { gte: since },
        status: { in: [OrderStatus.CONFIRMED, OrderStatus.PICKING, OrderStatus.PACKED] },
        riderId: null,
      },
      include: {
        customer: {
          select: { name: true, phone: true }
        },
        store: {
          select: { name: true, address: true, latitude: true, longitude: true }
        },
        rider: true,
        payment: true,
        items: {
          include: {
            product: {
              select: { name: true, image: true }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 50,
    });
  }

  async findOneWithDetails(id: string) {
    return prisma.order.findUnique({
      where: { id },
      include: {
        customer: {
          select: { name: true, phone: true }
        },
        store: {
          select: { name: true, address: true, latitude: true, longitude: true }
        },
        rider: {
          include: { user: { select: { name: true } } }
        },
        payment: true,
        items: {
          include: {
            product: {
              select: { name: true, image: true }
            }
          }
        }
      }
    });
  }
}
