/**
 * Rider assignment and reassignment.
 *
 * Split out of the former order.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrderStatus, Role, prisma } from '@aagam/database';
import { OrderServiceBase } from './order.service.base';

export class OrderRiderService extends OrderServiceBase {
  async assignRider(orderId: string, userId: string) {
    // Validate user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Validate rider profile exists (User.role may stay CUSTOMER for
    // mobile-onboarded riders; the RiderProfile is the canonical check)
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
}
