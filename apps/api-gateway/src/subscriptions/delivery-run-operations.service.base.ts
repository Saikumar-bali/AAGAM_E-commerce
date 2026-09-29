/**
 * Shared rider/run ownership lookups.
 *
 * Split out of the former delivery-run-operations.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, prisma } from '@aagam/database';

export type Actor = { id: string; role: Role };

export class DeliveryRunOperationsServiceBase {
  protected async rider(actor: Actor) {
    if (actor.role !== Role.RIDER) throw new ForbiddenException('Rider role is required');
    const rider = await prisma.riderProfile.findUnique({ where: { userId: actor.id } });
    if (!rider) throw new ForbiddenException('Rider profile not found');
    return rider;
  }

  protected async ownedRun(runId: string, actor: Actor) {
    const rider = await this.rider(actor);
    const run = await prisma.deliveryRun.findFirst({
      where: { id: runId, riderId: rider.id },
      include: {
        store: { select: { id: true, name: true, address: true, latitude: true, longitude: true } },
        deliveryZone: true,
        stops: {
          orderBy: { sequenceNumber: 'asc' },
          include: {
            deliveryJob: { include: { order: { include: { customer: { select: { name: true, phone: true } }, payment: true, items: { include: { product: true } } } } } },
            subscriptionDelivery: { include: { subscription: { select: { id: true, customerId: true, addressSnapshot: true, deliveryMethod: true, trustedDropInstructions: true } } } },
          },
        },
      },
    });
    if (!run) throw new NotFoundException('Assigned delivery run not found');
    return { rider, run };
  }
}
